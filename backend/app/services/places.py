from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, Float
from sqlalchemy.orm import selectinload

from app.models.category import Category
from app.models.place import Place, PlaceCategory, VisibilityStatus
from app.models.pet_policy import PetPolicy, PetAllowedStatus, VerificationStatus
from app.models.vet import VetHospital
from app.schemas.place import PlaceFilter


# Legacy default-map gate. Kept on the scalar Place.category column on
# purpose: it protects the 362 untagged rows that were imported before
# the multi-tag system existed — they have places.category='restaurant'
# but no place_categories rows, so a tag-based gate would drop them.
# Revisit (and probably delete) once the scalar column itself is dropped.
DEFAULT_MAP_CATEGORIES: tuple[PlaceCategory, ...] = (
    PlaceCategory.RESTAURANT,
    PlaceCategory.CAFE,
)

# Values of `filters.category` that still take the legacy scalar path.
# Anything else is treated as a Category.code and routed through the
# place_categories association table.
_LEGACY_SCALAR_CATEGORY_VALUES: frozenset[str] = frozenset({"restaurant", "cafe"})

# Pet-allowed statuses that may appear on the main map (i.e., not unknown / not_allowed).
DEFAULT_MAP_PET_ALLOWED = (PetAllowedStatus.ALLOWED, PetAllowedStatus.LIMITED)

# Verification statuses considered "verified" for default map display.
DEFAULT_MAP_VERIFIED = (
    VerificationStatus.OFFICIAL_VERIFIED,
    VerificationStatus.OWNER_VERIFIED,
    VerificationStatus.ADMIN_VERIFIED,
)


def _haversine_km(lat: float, lng: float):
    """SQLAlchemy expression for Haversine distance in km from a fixed point."""
    return (
        6371
        * func.acos(
            func.least(
                1.0,
                func.cos(func.radians(lat))
                * func.cos(func.radians(Place.latitude))
                * func.cos(func.radians(Place.longitude) - func.radians(lng))
                + func.sin(func.radians(lat))
                * func.sin(func.radians(Place.latitude)),
            )
        )
    ).cast(Float)


async def create_place_with_default_policy(
    db: AsyncSession,
    place_data: dict,
    *,
    owner_user_id: int | None = None,
) -> Place:
    """Create a Place and its default-'unknown' PetPolicy row in one flush.

    This is the only sanctioned code path for inserting a Place in Phase 1+.
    Every other call site (POST /places router, mfds_import, place_matching,
    Phase1-9 dummy injection, future admin tooling) MUST go through here so
    we never end up with a Place lacking a pet_policies row — the default
    map join filter assumes the 1:1 invariant.
    """
    place = Place(**place_data, owner_user_id=owner_user_id)
    db.add(place)
    await db.flush()  # populate place.id before linking the policy

    db.add(PetPolicy(place_id=place.id))
    await db.flush()
    return place


async def get_places_nearby(
    db: AsyncSession,
    lat: float,
    lng: float,
    filters: PlaceFilter,
    page: int = 1,
    size: int = 20,
    *,
    include_unverified: bool = False,
) -> tuple[list[Place], int]:
    """Default-map place lookup.

    Filter semantics (Phase 1):
        - visibility_status = 'visible'                            (always)
        - category ∈ {restaurant, cafe}                            (always)
        - pet_policies.pet_allowed_status ∈ {allowed, limited}     (always)
        - pet_policies.verification_status ∈ {official_verified,
            owner_verified, admin_verified}                        (unless include_unverified)
    """
    distance_km = _haversine_km(lat, lng).label("distance_km")

    query = (
        select(Place, distance_km)
        .outerjoin(PetPolicy, PetPolicy.place_id == Place.id)
        .where(
            Place.is_active == True,
            Place.visibility_status == VisibilityStatus.VISIBLE,
            Place.category.in_(DEFAULT_MAP_CATEGORIES),
            PetPolicy.pet_allowed_status.in_(DEFAULT_MAP_PET_ALLOWED),
        )
        .order_by(distance_km)
        .options(selectinload(Place.pet_policy), selectinload(Place.photos))
    )

    if not include_unverified:
        query = query.where(PetPolicy.verification_status.in_(DEFAULT_MAP_VERIFIED))

    # Category filter narrows further. Two paths kept side-by-side:
    #   - "restaurant" / "cafe": legacy scalar column path so older app
    #     builds that still send the enum values keep working unchanged.
    #   - anything else: treated as a Category.code and routed through
    #     place_categories. An unknown code naturally yields 0 rows.
    # The outer DEFAULT_MAP_CATEGORIES gate above still applies, so the
    # tag path is effectively "restaurant/cafe rows also tagged with X".
    if filters.category:
        if filters.category in _LEGACY_SCALAR_CATEGORY_VALUES:
            query = query.where(Place.category == filters.category)
        else:
            query = query.where(
                Place.categories.any(Category.code == filters.category)
            )

    if filters.has_parking is not None:
        query = query.where(Place.has_parking == filters.has_parking)

    if filters.q:
        # Name-only, whitespace-insensitive: strip spaces from both query and
        # name so "스타 벅스" matches "스타벅스" (and vice versa). Address is
        # intentionally NOT matched — search is "what place do I want to go"
        # not "what's near this address". Radius gate is also skipped below
        # so the user can find a place anywhere in the dataset.
        q_nospace = filters.q.strip().replace(" ", "")
        pattern = f"%{q_nospace}%"
        query = query.where(func.replace(Place.name, " ", "").ilike(pattern))
    else:
        # Nearby browsing mode (no q): keep the radius gate so the default
        # list isn't the whole country.
        query = query.where(_haversine_km(lat, lng) <= filters.radius_km)

    count_query = select(func.count()).select_from(query.subquery())
    total = (await db.execute(count_query)).scalar_one()

    offset = (page - 1) * size
    result = await db.execute(query.offset(offset).limit(size))
    rows = result.all()

    places = []
    for row in rows:
        place = row[0]
        place._distance_km = round(float(row[1]), 2) if row[1] is not None else None
        places.append(place)

    return places, total


async def get_emergency_vets(
    db: AsyncSession,
    lat: float,
    lng: float,
    radius_km: float = 10.0,
) -> list[Place]:
    # Deliberately untouched by the multi-tag migration: VET is not in
    # the new 23-category set, so this endpoint keeps relying on the
    # legacy scalar Place.category column until vets get their own path.
    distance_km = _haversine_km(lat, lng).label("distance_km")

    result = await db.execute(
        select(Place, distance_km)
        .join(VetHospital, VetHospital.place_id == Place.id)
        .where(
            _haversine_km(lat, lng) <= radius_km,
            Place.is_active == True,
            Place.category == PlaceCategory.VET,
        )
        .order_by(VetHospital.emergency.desc(), VetHospital.is_24h.desc(), distance_km)
        .limit(10)
    )

    places = []
    for row in result.all():
        place = row[0]
        place._distance_km = round(float(row[1]), 2) if row[1] is not None else None
        places.append(place)
    return places


def place_to_response(place: Place, lang: str = "ko") -> dict:
    translation = next(
        (t for t in (place.translations or []) if t.language == lang), None
    )
    policy = place.pet_policy
    pet_policy_payload = None
    if policy is not None:
        pet_policy_payload = {
            "pet_allowed_status": policy.pet_allowed_status,
            "verification_status": policy.verification_status,
            "indoor_allowed": policy.indoor_allowed,
            "outdoor_allowed": policy.outdoor_allowed,
            "dog_allowed": policy.dog_allowed,
            "cat_allowed": policy.cat_allowed,
            "max_weight_kg": policy.max_weight_kg,
            "leash_required": policy.leash_required,
            "carrier_required": policy.carrier_required,
            "vaccination_required": policy.vaccination_required,
            "notes": policy.notes,
            "policy_source": policy.policy_source,
            "confidence_score": policy.confidence_score,
            "last_verified_at": policy.last_verified_at,
        }
    # New multi-tag exposure, sorted by the seed order so the frontend
    # can render tags in a stable, category-panel-friendly order without
    # doing its own sort. Legacy scalar `category` is kept alongside for
    # backward compatibility with older clients.
    categories_sorted = sorted(
        place.categories or [], key=lambda c: c.sort_order
    )
    return {
        "id": place.id,
        "name": translation.name if translation else place.name,
        "category": place.category,
        "categories": [c.code for c in categories_sorted],
        "latitude": place.latitude,
        "longitude": place.longitude,
        "address": translation.address if translation and translation.address else place.address,
        "road_address": place.road_address,
        "city": place.city,
        "phone": place.phone,
        "website": place.website,
        "hours": place.hours,
        "has_parking": place.has_parking,
        "entrance_fee": place.entrance_fee,
        "description": translation.description if translation else place.description,
        "thumbnail_url": place.thumbnail_url,
        "rating": place.rating,
        "review_count": place.review_count,
        "visibility_status": place.visibility_status,
        "photos": [
            {"id": p.id, "url": p.url, "caption": p.caption, "is_primary": p.is_primary}
            for p in (place.photos or [])
        ],
        "pet_policy": pet_policy_payload,
        "distance_km": getattr(place, "_distance_km", None),
        "created_at": place.created_at,
    }
