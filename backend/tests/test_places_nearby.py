"""Phase 1 default-map filter + helper safety-net tests.

Covers the 9-case dummy mix from the Phase 1 spec section 3-1 and verifies:

- Default call (include_unverified=False) returns exactly cases 1+2+3 (7 rows).
- include_unverified=True bypasses verification_status only — visibility,
  category, and pet_allowed_status filters still apply, so cases 5/7/8/9 are
  still excluded. Expected returns: cases 1+2+3+4+6 (10 rows).
- The service-layer helper create_place_with_default_policy() always inserts
  exactly one matching pet_policies row, even across repeated calls.
"""
from sqlalchemy import select

from app.models.category import Category, place_categories
from app.models.place import Place, PlaceCategory, VisibilityStatus
from app.models.pet_policy import (
    PetPolicy,
    PetAllowedStatus,
    VerificationStatus,
)
from app.schemas.place import PlaceFilter
from app.services.places import (
    create_place_with_default_policy,
    get_places_nearby,
    place_to_response,
)


# Seoul City Hall — all dummy places share this so the distance filter passes.
_LAT = 37.5665
_LNG = 126.9780


# (count, label, verification, pet_allowed, category, visibility)
# Label is a short id used to assert which cases survive each filter.
DUMMY_CASES = [
    (3, "1", VerificationStatus.OFFICIAL_VERIFIED, PetAllowedStatus.ALLOWED,
     PlaceCategory.RESTAURANT, VisibilityStatus.VISIBLE),
    (2, "2", VerificationStatus.OWNER_VERIFIED, PetAllowedStatus.LIMITED,
     PlaceCategory.CAFE, VisibilityStatus.VISIBLE),
    (2, "3", VerificationStatus.ADMIN_VERIFIED, PetAllowedStatus.ALLOWED,
     PlaceCategory.RESTAURANT, VisibilityStatus.VISIBLE),
    (2, "4", VerificationStatus.USER_REPORTED, PetAllowedStatus.ALLOWED,
     PlaceCategory.CAFE, VisibilityStatus.VISIBLE),
    (2, "5", VerificationStatus.UNKNOWN, PetAllowedStatus.UNKNOWN,
     PlaceCategory.RESTAURANT, VisibilityStatus.VISIBLE),
    (1, "6", VerificationStatus.UNDER_REVIEW, PetAllowedStatus.LIMITED,
     PlaceCategory.CAFE, VisibilityStatus.VISIBLE),
    (1, "7", VerificationStatus.OFFICIAL_VERIFIED, PetAllowedStatus.NOT_ALLOWED,
     PlaceCategory.RESTAURANT, VisibilityStatus.VISIBLE),
    (1, "8", VerificationStatus.OFFICIAL_VERIFIED, PetAllowedStatus.ALLOWED,
     PlaceCategory.PARK, VisibilityStatus.VISIBLE),
    (1, "9", VerificationStatus.OFFICIAL_VERIFIED, PetAllowedStatus.ALLOWED,
     PlaceCategory.RESTAURANT, VisibilityStatus.HIDDEN),
]


async def _seed_dummy(db) -> None:
    """Create 15 places matching the Phase 1 spec section 3-1 mix.
    Names are formatted "caseX-i" so the case label can be parsed back out.
    """
    serial = 0
    for count, label, verification, pet_allowed, category, visibility in DUMMY_CASES:
        for i in range(count):
            serial += 1
            place = await create_place_with_default_policy(db, {
                "name": f"case{label}-{i}",
                "category": category,
                "latitude": _LAT,
                "longitude": _LNG,
                "address": f"Seoul fake addr {serial}",
                "visibility_status": visibility,
            })
            policy = (await db.execute(
                select(PetPolicy).where(PetPolicy.place_id == place.id)
            )).scalar_one()
            policy.pet_allowed_status = pet_allowed
            policy.verification_status = verification
            await db.flush()


def _label_of(place: Place) -> str:
    # "caseX-i" → "X"
    return place.name[len("case"):].split("-", 1)[0]


# ─── Default map filter ────────────────────────────────────────────────────


async def test_default_filter_returns_exactly_seven(db_session):
    await _seed_dummy(db_session)
    filters = PlaceFilter(radius_km=50.0)
    places, total = await get_places_nearby(
        db_session, _LAT, _LNG, filters, include_unverified=False,
    )
    assert total == 7, f"expected 7 verified rows, got {total}"
    assert len(places) == 7
    labels = sorted(_label_of(p) for p in places)
    # 3 + 2 + 2 = 7 rows distributed across cases 1, 2, 3
    assert labels == ["1", "1", "1", "2", "2", "3", "3"]


async def test_include_unverified_returns_exactly_ten(db_session):
    """include_unverified=true bypasses verification_status only.
    Cases still excluded: 5 (pet_allowed=unknown), 7 (not_allowed),
    8 (category=park), 9 (visibility=hidden). Survivors: 1+2+3+4+6 = 10.
    """
    await _seed_dummy(db_session)
    filters = PlaceFilter(radius_km=50.0)
    places, total = await get_places_nearby(
        db_session, _LAT, _LNG, filters, include_unverified=True,
    )
    assert total == 10, f"expected 10 rows with include_unverified, got {total}"
    labels = sorted(_label_of(p) for p in places)
    # 3 + 2 + 2 + 2 + 1 = 10 distributed across cases 1, 2, 3, 4, 6
    assert labels == ["1", "1", "1", "2", "2", "3", "3", "4", "4", "6"]
    # Hard guarantees: excluded cases must NEVER appear.
    excluded = set(labels) & {"5", "7", "8", "9"}
    assert not excluded, f"forbidden cases leaked through: {excluded}"


async def test_include_unverified_still_excludes_unknown_pet_allowed(db_session):
    """Explicit documentation: pet_allowed_status=unknown places must stay
    invisible even with include_unverified=True. Case 5 is the canary.
    """
    await _seed_dummy(db_session)
    filters = PlaceFilter(radius_km=50.0)
    places, _ = await get_places_nearby(
        db_session, _LAT, _LNG, filters, include_unverified=True,
    )
    assert "5" not in {_label_of(p) for p in places}


# ─── Helper safety-net ─────────────────────────────────────────────────────


async def test_helper_creates_exactly_one_pet_policy(db_session):
    place = await create_place_with_default_policy(db_session, {
        "name": "helper-single",
        "category": PlaceCategory.RESTAURANT,
        "latitude": _LAT,
        "longitude": _LNG,
        "address": "addr",
    })
    rows = (await db_session.execute(
        select(PetPolicy).where(PetPolicy.place_id == place.id)
    )).scalars().all()
    assert len(rows) == 1
    assert rows[0].pet_allowed_status == PetAllowedStatus.UNKNOWN
    assert rows[0].verification_status == VerificationStatus.UNKNOWN


# ─── Multi-tag category filter (commit 3) ─────────────────────────────────


async def _seed_tagged_place(
    db,
    name: str,
    category: PlaceCategory,
    tag_codes: list[str],
) -> Place:
    """Create a fully-verified place and attach it to the given
    category tags. Verified so it survives the default map gate."""
    place = await create_place_with_default_policy(db, {
        "name": name,
        "category": category,
        "latitude": _LAT,
        "longitude": _LNG,
        "address": f"tagged addr {name}",
    })
    policy = (await db.execute(
        select(PetPolicy).where(PetPolicy.place_id == place.id)
    )).scalar_one()
    policy.pet_allowed_status = PetAllowedStatus.ALLOWED
    policy.verification_status = VerificationStatus.OFFICIAL_VERIFIED
    await db.flush()

    if tag_codes:
        cat_rows = (await db.execute(
            select(Category).where(Category.code.in_(tag_codes))
        )).scalars().all()
        for c in cat_rows:
            await db.execute(
                place_categories.insert().values(
                    place_id=place.id, category_id=c.id,
                )
            )
        await db.flush()
    return place


async def test_tag_filter_matches_korean_tagged_places(db_session):
    """category='korean' returns only rows tagged with the korean
    Category.code, and each surviving row has 'korean' in its
    place_to_response['categories'] list."""
    await _seed_tagged_place(db_session, "tagged-kor-1",
                             PlaceCategory.RESTAURANT, ["korean"])
    await _seed_tagged_place(db_session, "tagged-kor-2",
                             PlaceCategory.RESTAURANT, ["korean", "bbq_grill"])
    await _seed_tagged_place(db_session, "tagged-cafe",
                             PlaceCategory.CAFE, ["cafe"])
    await _seed_tagged_place(db_session, "tagged-nope",
                             PlaceCategory.RESTAURANT, [])

    filters = PlaceFilter(radius_km=50.0, category="korean")
    places, total = await get_places_nearby(
        db_session, _LAT, _LNG, filters, include_unverified=False,
    )
    assert total == 2, f"expected 2 korean-tagged rows, got {total}"
    names = sorted(p.name for p in places)
    assert names == ["tagged-kor-1", "tagged-kor-2"]


async def test_scalar_filter_cafe_still_uses_legacy_column(db_session):
    """category='cafe' hits the legacy scalar path (Place.category
    == 'cafe') and is agnostic to whether the row has any tags."""
    # Two scalar cafes — one with the 'cafe' tag, one without.
    await _seed_tagged_place(db_session, "cafe-with-tag",
                             PlaceCategory.CAFE, ["cafe"])
    await _seed_tagged_place(db_session, "cafe-untagged",
                             PlaceCategory.CAFE, [])
    # A non-cafe row that carries the 'cafe' tag as a decoy — must NOT
    # come back through the scalar path.
    await _seed_tagged_place(db_session, "restaurant-with-cafe-tag",
                             PlaceCategory.RESTAURANT, ["cafe"])

    filters = PlaceFilter(radius_km=50.0, category="cafe")
    places, total = await get_places_nearby(
        db_session, _LAT, _LNG, filters, include_unverified=False,
    )
    names = sorted(p.name for p in places)
    assert total == 2, f"expected 2 scalar cafes, got {total}"
    assert names == ["cafe-untagged", "cafe-with-tag"]


async def test_unknown_category_code_returns_zero(db_session):
    await _seed_tagged_place(db_session, "tagged-kor",
                             PlaceCategory.RESTAURANT, ["korean"])
    filters = PlaceFilter(radius_km=50.0, category="nonexistent_code_xyz")
    _, total = await get_places_nearby(
        db_session, _LAT, _LNG, filters, include_unverified=False,
    )
    assert total == 0


async def test_response_exposes_both_category_and_categories(db_session):
    """place_to_response emits the legacy scalar `category` alongside
    the new `categories` list; the list is sort_order-ordered."""
    place = await _seed_tagged_place(
        db_session, "dual-fields",
        PlaceCategory.RESTAURANT,
        ["bbq_grill", "korean"],   # seed order: korean=1, bbq_grill=6
    )
    # Reload with the categories relationship populated.
    place = (await db_session.execute(
        select(Place).where(Place.id == place.id)
    )).scalar_one()
    body = place_to_response(place)
    assert body["category"] == PlaceCategory.RESTAURANT
    assert body["categories"] == ["korean", "bbq_grill"]


async def test_default_call_no_category_regresses_to_seven(db_session):
    """Guard: with the legacy DEFAULT_MAP_CATEGORIES gate intact, the
    Phase 1 seven-row default still holds even after category-filter
    plumbing was rewritten."""
    await _seed_dummy(db_session)
    filters = PlaceFilter(radius_km=50.0)  # no category param
    _, total = await get_places_nearby(
        db_session, _LAT, _LNG, filters, include_unverified=False,
    )
    assert total == 7


async def test_helper_two_calls_create_two_pairs(db_session):
    p1 = await create_place_with_default_policy(db_session, {
        "name": "twice-1",
        "category": PlaceCategory.CAFE,
        "latitude": _LAT,
        "longitude": _LNG,
        "address": "addr1",
    })
    p2 = await create_place_with_default_policy(db_session, {
        "name": "twice-2",
        "category": PlaceCategory.CAFE,
        "latitude": _LAT,
        "longitude": _LNG,
        "address": "addr2",
    })

    places = (await db_session.execute(
        select(Place).where(Place.id.in_([p1.id, p2.id]))
    )).scalars().all()
    policies = (await db_session.execute(
        select(PetPolicy).where(PetPolicy.place_id.in_([p1.id, p2.id]))
    )).scalars().all()

    assert len(places) == 2
    assert len(policies) == 2
    assert {pp.place_id for pp in policies} == {p1.id, p2.id}
