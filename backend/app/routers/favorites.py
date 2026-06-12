from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select, func, delete
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import selectinload

from app.database import get_db
from app.models.favorite import Favorite
from app.models.place import Place
from app.models.user import User
from app.schemas.favorite import (
    FavoriteCreate,
    FavoriteResponse,
    FavoriteListResponse,
)
from app.services.auth import get_current_user
from app.services.places import place_to_response

router = APIRouter(prefix="/favorites", tags=["favorites"])


@router.post("", response_model=FavoriteResponse, status_code=status.HTTP_201_CREATED)
async def add_favorite(
    data: FavoriteCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    lang: str = Query(default="ko"),
):
    # Validate the place exists before inserting — surfacing 404 is friendlier
    # than letting the FK constraint blow up with an opaque 500. The same
    # eager-load chain is used so place_to_response below has everything it
    # needs without a second round-trip.
    place = (await db.execute(
        select(Place)
        .where(Place.id == data.place_id)
        .options(selectinload(Place.pet_policy), selectinload(Place.photos))
    )).scalar_one_or_none()
    if place is None:
        raise HTTPException(status_code=404, detail="Place not found")

    # Idempotent add: UNIQUE(user_id, place_id) lets the DB enforce "one
    # favorite per (user, place)". Re-favoriting an already-favorited
    # place returns the existing row (with the same id/created_at) instead
    # of erroring, so a double-tap on the heart never surfaces as failure.
    fav = Favorite(user_id=current_user.id, place_id=data.place_id)
    db.add(fav)
    try:
        await db.flush()
    except IntegrityError:
        await db.rollback()
        fav = (await db.execute(
            select(Favorite).where(
                Favorite.user_id == current_user.id,
                Favorite.place_id == data.place_id,
            )
        )).scalar_one()

    return {
        "id": fav.id,
        "place_id": fav.place_id,
        "created_at": fav.created_at,
        "place": place_to_response(place, lang),
    }


@router.delete("/{place_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_favorite(
    place_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Remove a favorite by place id.

    Idempotent: returns 204 whether or not the row existed. The client
    doesn't have to special-case "already removed" — useful when the
    heart icon's local state is briefly stale after a refresh.
    """
    await db.execute(
        delete(Favorite).where(
            Favorite.user_id == current_user.id,
            Favorite.place_id == place_id,
        )
    )
    return None


@router.get("", response_model=FavoriteListResponse)
async def list_my_favorites(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    lang: str = Query(default="ko"),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
):
    """List places the authenticated user has favorited, newest first.

    place_to_response hydrates each row with translations / pet_policy /
    photos so the mobile list screen can reuse PlaceCard as-is.
    """
    base = select(Favorite).where(Favorite.user_id == current_user.id)

    total = (await db.execute(
        select(func.count()).select_from(base.subquery())
    )).scalar_one()

    favs = (await db.execute(
        base.options(
            selectinload(Favorite.place).selectinload(Place.pet_policy),
            selectinload(Favorite.place).selectinload(Place.photos),
        )
        .order_by(Favorite.created_at.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
    )).scalars().all()

    items = [
        {
            "id": f.id,
            "place_id": f.place_id,
            "created_at": f.created_at,
            "place": place_to_response(f.place, lang),
        }
        for f in favs
    ]
    return FavoriteListResponse(
        items=items, total=total, page=page, page_size=page_size,
    )
