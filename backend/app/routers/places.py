from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.database import get_db
from app.models.place import Place
from app.models.user import User
from app.schemas.place import PlaceCreate, PlaceUpdate, PlaceResponse, PlaceListResponse, PlaceFilter
from app.services.auth import get_current_user
from app.services.places import (
    get_places_nearby,
    place_to_response,
    get_emergency_vets,
    create_place_with_default_policy,
)
from app.services.cache import cache_delete_pattern, cache_get, cache_set, place_cache_key, places_nearby_cache_key
from app.services.photo_service import cache_place_thumbnail

router = APIRouter(prefix="/places", tags=["places"])


@router.get("/nearby", response_model=PlaceListResponse)
async def get_nearby_places(
    lat: float = Query(..., ge=-90, le=90),
    lng: float = Query(..., ge=-180, le=180),
    # Free-form: legacy "restaurant"/"cafe" or new Category.code.
    # Service layer branches; unknown codes yield an empty result set.
    category: str | None = None,
    has_parking: bool | None = None,
    radius_km: float = Query(default=5.0, le=50.0),
    lang: str = Query(default="ko"),
    q: str | None = Query(default=None, max_length=100),
    include_unverified: bool = Query(
        default=False,
        description=(
            "If true, bypass the verification_status filter. visibility/category/"
            "pet_allowed_status filters still apply. Intended for search and admin views."
        ),
    ),
    page: int = Query(default=1, ge=1),
    size: int = Query(default=20, le=100),
    db: AsyncSession = Depends(get_db),
):
    q_clean = q.strip() if q else None
    filters = PlaceFilter(
        category=category,
        has_parking=has_parking,
        radius_km=radius_km,
        lang=lang,
        q=q_clean or None,
    )

    # Cache key distinguishes verified-only vs. include_unverified responses.
    cache_namespace = "unverified" if include_unverified else "verified"
    cache_key = (
        places_nearby_cache_key(lat, lng, radius_km, str(category), lang, q_clean)
        + f":{cache_namespace}"
    )
    cached = await cache_get(cache_key)
    if cached and page == 1:
        return cached

    places, total = await get_places_nearby(
        db, lat, lng, filters, page, size, include_unverified=include_unverified,
    )
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
    background_tasks: BackgroundTasks,
    lang: str = Query(default="ko"),
    db: AsyncSession = Depends(get_db),
):
    cache_key = place_cache_key(place_id, lang)
    cached = await cache_get(cache_key)
    if cached:
        return cached

    result = await db.execute(
        select(Place)
        .where(Place.id == place_id, Place.is_active == True)
        .options(selectinload(Place.pet_policy), selectinload(Place.photos))
    )
    place = result.scalar_one_or_none()
    if not place:
        raise HTTPException(status_code=404, detail="Place not found")

    # thumbnail 없는 카카오 장소는 백그라운드에서 OG 이미지 수집 후 DB 캐시
    if (
        not place.thumbnail_url
        and place.external_id
        and place.external_id.startswith("kakao_")
    ):
        kakao_id = place.external_id.removeprefix("kakao_")
        background_tasks.add_task(cache_place_thumbnail, place_id, kakao_id)

    response = place_to_response(place, lang)
    await cache_set(cache_key, response)
    return response


@router.post("", response_model=PlaceResponse, status_code=status.HTTP_201_CREATED)
async def create_place(
    data: PlaceCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    place = await create_place_with_default_policy(
        db, data.model_dump(), owner_user_id=current_user.id,
    )
    await db.refresh(place, ["pet_policy", "photos"])
    return place_to_response(place)


@router.patch("/{place_id}", response_model=PlaceResponse)
async def update_place(
    place_id: int,
    data: PlaceUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Place).where(Place.id == place_id)
        .options(selectinload(Place.pet_policy), selectinload(Place.photos))
    )
    place = result.scalar_one_or_none()
    if not place:
        raise HTTPException(status_code=404, detail="Place not found")
    if place.owner_user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not authorized")

    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(place, field, value)

    await cache_delete_pattern(f"place:{place_id}:*")
    return place_to_response(place)
