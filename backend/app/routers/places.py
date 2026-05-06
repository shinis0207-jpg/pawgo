from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from geoalchemy2.functions import ST_GeogFromText

from app.database import get_db
from app.models.place import Place, PlaceCategory
from app.models.user import User
from app.schemas.place import PlaceCreate, PlaceUpdate, PlaceResponse, PlaceListResponse, PlaceFilter
from app.services.auth import get_current_user
from app.services.places import get_places_nearby, place_to_response, get_emergency_vets
from app.services.cache import cache_get, cache_set, place_cache_key, places_nearby_cache_key

router = APIRouter(prefix="/places", tags=["places"])


@router.get("/nearby", response_model=PlaceListResponse)
async def get_nearby_places(
    lat: float = Query(..., ge=-90, le=90),
    lng: float = Query(..., ge=-180, le=180),
    category: PlaceCategory | None = None,
    max_weight_kg: float | None = None,
    allows_indoor: bool | None = None,
    has_parking: bool | None = None,
    radius_km: float = Query(default=5.0, le=50.0),
    lang: str = Query(default="ko"),
    page: int = Query(default=1, ge=1),
    size: int = Query(default=20, le=100),
    db: AsyncSession = Depends(get_db),
):
    filters = PlaceFilter(
        category=category,
        max_weight_kg=max_weight_kg,
        allows_indoor=allows_indoor,
        has_parking=has_parking,
        radius_km=radius_km,
        lang=lang,
    )

    cache_key = places_nearby_cache_key(lat, lng, radius_km, str(category), lang)
    cached = await cache_get(cache_key)
    if cached and page == 1:
        return cached

    places, total = await get_places_nearby(db, lat, lng, filters, page, size)
    items = [place_to_response(p, lang) for p in places]
    response = {"items": items, "total": total, "page": page, "size": size}

    if page == 1:
        await cache_set(cache_key, response, ttl=120)
    return response


@router.get("/emergency-vets")
async def list_emergency_vets(
    lat: float = Query(...),
    lng: float = Query(...),
    radius_km: float = Query(default=10.0, le=50.0),
    lang: str = Query(default="ko"),
    db: AsyncSession = Depends(get_db),
):
    places = await get_emergency_vets(db, lat, lng, radius_km)
    return [place_to_response(p, lang) for p in places]


@router.get("/{place_id}", response_model=PlaceResponse)
async def get_place(
    place_id: int,
    lang: str = Query(default="ko"),
    db: AsyncSession = Depends(get_db),
):
    cache_key = place_cache_key(place_id, lang)
    cached = await cache_get(cache_key)
    if cached:
        return cached

    result = await db.execute(select(Place).where(Place.id == place_id, Place.is_active == True))
    place = result.scalar_one_or_none()
    if not place:
        raise HTTPException(status_code=404, detail="Place not found")

    response = place_to_response(place, lang)
    await cache_set(cache_key, response)
    return response


@router.post("", response_model=PlaceResponse, status_code=status.HTTP_201_CREATED)
async def create_place(
    data: PlaceCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    location = f"SRID=4326;POINT({data.longitude} {data.latitude})"
    place_data = data.model_dump(exclude={"latitude", "longitude"})
    place = Place(**place_data, location=location, owner_user_id=current_user.id)
    db.add(place)
    await db.flush()
    return place_to_response(place)


@router.patch("/{place_id}", response_model=PlaceResponse)
async def update_place(
    place_id: int,
    data: PlaceUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Place).where(Place.id == place_id))
    place = result.scalar_one_or_none()
    if not place:
        raise HTTPException(status_code=404, detail="Place not found")
    if place.owner_user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not authorized")

    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(place, field, value)

    await cache_set(place_cache_key(place_id, "ko"), None, ttl=1)
    return place_to_response(place)
