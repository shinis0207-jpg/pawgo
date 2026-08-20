"""Admin CRUD for the Place ↔ Category multi-tag association.

Split from admin_places.py on purpose — its PATCH endpoint's
PlaceAdminPatchRequest deliberately excludes category edits (see that
schema's docstring: "an admin can't accidentally slip a category …
edit through this endpoint"). This router owns category writes so that
whitelist stays honest.

Follows admin_menus.py's shape: own router, own schemas, cache-
invalidate the affected place after each successful commit.
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import delete, insert, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.category import Category, place_categories
from app.models.place import Place
from app.models.user import User
from app.schemas.place import (
    CategoryResponse,
    PlaceCategoriesReplaceRequest,
)
from app.services.auth import require_admin
from app.services.cache import cache_delete_pattern


router = APIRouter(tags=["admin"])


@router.get(
    "/admin/categories",
    response_model=list[CategoryResponse],
)
async def admin_list_categories(
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Return the whole `categories` master, grouped-then-ordered.

    Group first so the admin UI can render "food / coffee_dessert /
    drink / space_tag" section headers without a second pass; sort_order
    inside a group is the render order the filter panel already uses.
    """
    rows = (await db.execute(
        select(Category).order_by(
            Category.group.asc(), Category.sort_order.asc()
        )
    )).scalars().all()
    return rows


@router.put(
    "/admin/places/{place_id}/categories",
    response_model=list[CategoryResponse],
)
async def admin_replace_place_categories(
    place_id: int,
    data: PlaceCategoriesReplaceRequest,
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Whole-replace the tag set attached to `place_id`.

    - 404 when the places row is missing.
    - 422 (returned explicitly here, not via pydantic) when one or more
      submitted codes are not present in the `categories` master —
      response detail carries the offending codes so the admin UI can
      surface them without a round-trip. Nothing is written in that case.
    - Empty `codes` is a legal state (see PlaceCategoriesReplaceRequest
      docstring). The delete still runs — that's how "clear all tags" works.
    - Delete + insert live in one transaction. Only a single commit at the
      end so a mid-way failure leaves the previous tag set intact.

    Deliberately scalar-select `Place.id` for existence + query the
    association table directly for the response, so Place.categories'
    lazy="selectin" never fires here. Loading a Place ORM instance would
    drag one extra selectin round-trip per call for no gain — we already
    have the ids we just wrote.
    """
    place_exists = (await db.execute(
        select(Place.id).where(Place.id == place_id)
    )).scalar_one_or_none()
    if place_exists is None:
        raise HTTPException(status_code=404, detail="Place not found")

    # Dedupe while preserving first-seen order so the 422 detail (and any
    # future ordered-insert requirement) stays deterministic.
    seen: set[str] = set()
    codes: list[str] = []
    for c in data.codes:
        if c not in seen:
            seen.add(c)
            codes.append(c)

    category_ids: list[int] = []
    if codes:
        rows = (await db.execute(
            select(Category.id, Category.code).where(Category.code.in_(codes))
        )).all()
        found = {code: cid for cid, code in rows}
        missing = [c for c in codes if c not in found]
        if missing:
            raise HTTPException(
                status_code=422,
                detail={
                    "error": "unknown category codes",
                    "unknown_codes": missing,
                },
            )
        category_ids = [found[c] for c in codes]

    # Whole-replace in one transaction. The composite PK (place_id,
    # category_id) makes the DELETE necessary before the INSERT — an
    # UPSERT-style path would need explicit ON CONFLICT handling for the
    # same net effect.
    await db.execute(
        delete(place_categories).where(place_categories.c.place_id == place_id)
    )
    if category_ids:
        await db.execute(
            insert(place_categories),
            [{"place_id": place_id, "category_id": cid} for cid in category_ids],
        )
    await db.commit()

    # Post-commit cache invalidation — mirror admin_places.py /
    # admin_menus.py. Pattern-delete covers every language variant.
    await cache_delete_pattern(f"place:{place_id}:*")

    # Canonical order for the response — matches admin_list_categories
    # so the admin UI can rely on one ordering rule everywhere.
    result_rows = (await db.execute(
        select(Category)
        .join(place_categories, place_categories.c.category_id == Category.id)
        .where(place_categories.c.place_id == place_id)
        .order_by(Category.group.asc(), Category.sort_order.asc())
    )).scalars().all()
    return result_rows
