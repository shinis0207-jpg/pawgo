"""Admin CRUD for place_menus.

Split from admin_places.py because two of the four endpoints
(PATCH/DELETE) sit under /admin/menus/{menu_id}, not under
/admin/places/{place_id}/*. Keeping them together in one file trumps
sharing admin_places.py's prefix; APIRouter's `prefix=` doesn't support
two roots. All four endpoints share require_admin and cache-invalidate
the affected place after a successful commit.
"""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.place import Place
from app.models.place_menu import PlaceMenu
from app.models.user import User
from app.schemas.place import (
    PlaceMenuCreate,
    PlaceMenuResponse,
    PlaceMenuUpdate,
)
from app.services.auth import require_admin
from app.services.cache import cache_delete_pattern


router = APIRouter(tags=["admin"])


@router.get(
    "/admin/places/{place_id}/menus",
    response_model=list[PlaceMenuResponse],
)
async def admin_list_menus(
    place_id: int,
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    place_exists = (await db.execute(
        select(Place.id).where(Place.id == place_id)
    )).scalar_one_or_none()
    if place_exists is None:
        raise HTTPException(status_code=404, detail="Place not found")

    rows = (await db.execute(
        select(PlaceMenu)
        .where(PlaceMenu.place_id == place_id)
        .order_by(PlaceMenu.sort_order.asc(), PlaceMenu.id.asc())
    )).scalars().all()
    return rows


@router.post(
    "/admin/places/{place_id}/menus",
    response_model=PlaceMenuResponse,
    status_code=status.HTTP_201_CREATED,
)
async def admin_create_menu(
    place_id: int,
    data: PlaceMenuCreate,
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    place_exists = (await db.execute(
        select(Place.id).where(Place.id == place_id)
    )).scalar_one_or_none()
    if place_exists is None:
        raise HTTPException(status_code=404, detail="Place not found")

    menu = PlaceMenu(place_id=place_id, **data.model_dump())
    db.add(menu)
    await db.commit()
    await db.refresh(menu)

    # Post-commit cache invalidation — a pre-commit tombstone paired with
    # a failed commit would leave the DB stale while the cache reloads.
    await cache_delete_pattern(f"place:{place_id}:*")

    return menu


@router.patch(
    "/admin/menus/{menu_id}",
    response_model=PlaceMenuResponse,
)
async def admin_update_menu(
    menu_id: int,
    data: PlaceMenuUpdate,
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    menu = (await db.execute(
        select(PlaceMenu).where(PlaceMenu.id == menu_id)
    )).scalar_one_or_none()
    if menu is None:
        raise HTTPException(status_code=404, detail="Menu not found")

    changes = data.model_dump(exclude_unset=True)
    for field, value in changes.items():
        setattr(menu, field, value)

    await db.commit()
    await db.refresh(menu)

    await cache_delete_pattern(f"place:{menu.place_id}:*")
    return menu


@router.delete(
    "/admin/menus/{menu_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def admin_delete_menu(
    menu_id: int,
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    menu = (await db.execute(
        select(PlaceMenu).where(PlaceMenu.id == menu_id)
    )).scalar_one_or_none()
    if menu is None:
        raise HTTPException(status_code=404, detail="Menu not found")

    # Capture place_id BEFORE the row is gone — we still need it for the
    # cache invalidation call below.
    place_id = menu.place_id
    await db.delete(menu)
    await db.commit()

    await cache_delete_pattern(f"place:{place_id}:*")
