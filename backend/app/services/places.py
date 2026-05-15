from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, Float

from app.models.place import Place, PlaceCategory
from app.models.vet import VetHospital
from app.schemas.place import PlaceFilter


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


async def get_places_nearby(
    db: AsyncSession,
    lat: float,
    lng: float,
    filters: PlaceFilter,
    page: int = 1,
    size: int = 20,
) -> tuple[list[Place], int]:
    distance_km = _haversine_km(lat, lng).label("distance_km")

    query = (
        select(Place, distance_km)
        .where(
            _haversine_km(lat, lng) <= filters.radius_km,
            Place.is_active == True,
        )
        .order_by(distance_km)
    )

    if filters.category:
        query = query.where(Place.category == filters.category)
    if filters.max_weight_kg is not None:
        query = query.where(
            (Place.max_weight_kg == None) | (Place.max_weight_kg >= filters.max_weight_kg)
        )
    if filters.allows_indoor is not None:
        query = query.where(Place.allows_indoor == filters.allows_indoor)
    if filters.has_parking is not None:
        query = query.where(Place.has_parking == filters.has_parking)
    if filters.q:
        pattern = f"%{filters.q.strip()}%"
        query = query.where(
            (Place.name.ilike(pattern)) | (Place.address.ilike(pattern))
        )

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
    return {
        "id": place.id,
        "name": translation.name if translation else place.name,
        "category": place.category,
        "latitude": place.latitude,
        "longitude": place.longitude,
        "address": translation.address if translation and translation.address else place.address,
        "city": place.city,
        "phone": place.phone,
        "website": place.website,
        "hours": place.hours,
        "max_weight_kg": place.max_weight_kg,
        "allows_indoor": place.allows_indoor,
        "allows_outdoor": place.allows_outdoor,
        "has_parking": place.has_parking,
        "entrance_fee": place.entrance_fee,
        "description": translation.description if translation else place.description,
        "thumbnail_url": place.thumbnail_url,
        "rating": place.rating,
        "review_count": place.review_count,
        "is_verified": place.is_verified,
        "photos": [
            {"id": p.id, "url": p.url, "caption": p.caption, "is_primary": p.is_primary}
            for p in (place.photos or [])
        ],
        "distance_km": getattr(place, "_distance_km", None),
        "created_at": place.created_at,
    }
