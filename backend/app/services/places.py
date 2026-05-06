from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, text
from geoalchemy2.functions import ST_DWithin, ST_Distance, ST_GeogFromText
from geoalchemy2.shape import to_shape
import json

from app.models.place import Place, PlaceCategory
from app.models.vet import VetHospital
from app.schemas.place import PlaceFilter, PlaceResponse


def make_point(lat: float, lng: float) -> str:
    return f"SRID=4326;POINT({lng} {lat})"


async def get_places_nearby(
    db: AsyncSession,
    lat: float,
    lng: float,
    filters: PlaceFilter,
    page: int = 1,
    size: int = 20,
) -> tuple[list[Place], int]:
    origin = ST_GeogFromText(f"POINT({lng} {lat})")
    radius_m = filters.radius_km * 1000

    query = (
        select(Place, ST_Distance(Place.location, origin).label("distance_m"))
        .where(
            ST_DWithin(Place.location, origin, radius_m),
            Place.is_active == True,
        )
        .order_by("distance_m")
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

    count_query = select(func.count()).select_from(query.subquery())
    total_result = await db.execute(count_query)
    total = total_result.scalar_one()

    offset = (page - 1) * size
    paginated = query.offset(offset).limit(size)
    result = await db.execute(paginated)
    rows = result.all()

    places = []
    for row in rows:
        place = row[0]
        distance_m = row[1]
        place._distance_km = round(distance_m / 1000, 2) if distance_m else None
        places.append(place)

    return places, total


async def get_emergency_vets(
    db: AsyncSession,
    lat: float,
    lng: float,
    radius_km: float = 10.0,
) -> list[Place]:
    origin = ST_GeogFromText(f"POINT({lng} {lat})")
    radius_m = radius_km * 1000

    result = await db.execute(
        select(Place, ST_Distance(Place.location, origin).label("distance_m"))
        .join(VetHospital, VetHospital.place_id == Place.id)
        .where(
            ST_DWithin(Place.location, origin, radius_m),
            Place.is_active == True,
            Place.category == PlaceCategory.VET,
        )
        .order_by(VetHospital.emergency.desc(), VetHospital.is_24h.desc(), "distance_m")
        .limit(10)
    )
    rows = result.all()
    places = []
    for row in rows:
        place = row[0]
        place._distance_km = round(row[1] / 1000, 2) if row[1] else None
        places.append(place)
    return places


def place_to_response(place: Place, lang: str = "ko") -> dict:
    translation = next(
        (t for t in (place.translations or []) if t.language == lang), None
    )
    point = to_shape(place.location)
    return {
        "id": place.id,
        "name": translation.name if translation else place.name,
        "category": place.category,
        "latitude": point.y,
        "longitude": point.x,
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
        "photos": [{"id": p.id, "url": p.url, "caption": p.caption, "is_primary": p.is_primary}
                   for p in (place.photos or [])],
        "distance_km": getattr(place, "_distance_km", None),
        "created_at": place.created_at,
    }
