"""Admin read-only endpoints for member inspection.

Exposes list and detail for users so an admin can inspect who signed
up and what pets each user registered. No create / update / delete
surface — this file is deliberately read-only. Sensitive columns
(hashed_password, verification_*, oauth_id) are omitted at the schema
layer (schemas/user.py), so they can't leak through the response even
if this router evolves.

Mirrors admin_places.py for pagination and auth conventions.
"""
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.user import User
from app.schemas.user import (
    AdminPetItem,
    AdminUserDetail,
    AdminUserListItem,
    AdminUserListResponse,
)
from app.services.auth import require_admin


router = APIRouter(prefix="/admin/users", tags=["admin"])


@router.get("", response_model=AdminUserListResponse)
async def admin_list_users(
    page: int = Query(default=1, ge=1),
    size: int = Query(default=20, ge=1, le=100),
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Paginated user list ordered by created_at DESC.

    pet_count uses len(user.pets); User.pets has lazy="selectin" so the
    pets rows for the sliced page load in one follow-up SELECT keyed
    by user_id IN (...). At admin scale (size <= 100) this is simpler
    than a correlated count subquery and keeps the main query free of
    joins.
    """
    total = (await db.execute(select(func.count(User.id)))).scalar_one()

    rows = (await db.execute(
        select(User)
        .order_by(User.created_at.desc())
        .offset((page - 1) * size)
        .limit(size)
    )).scalars().all()

    items = [
        AdminUserListItem(
            id=u.id,
            name=u.name,
            email=u.email,
            role=u.role,
            auth_provider=u.auth_provider,
            created_at=u.created_at,
            pet_count=len(u.pets),
        )
        for u in rows
    ]
    return AdminUserListResponse(
        items=items, total=total, page=page, size=size,
    )


@router.get("/{user_id}", response_model=AdminUserDetail)
async def admin_get_user(
    user_id: int,
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Single-user detail with pet roster. 404 when the users row is
    missing. is_active=False rows are intentionally included — an admin
    should be able to inspect deactivated accounts too.
    """
    user = (await db.execute(
        select(User).where(User.id == user_id)
    )).scalar_one_or_none()
    if user is None:
        raise HTTPException(status_code=404, detail="User not found")

    return AdminUserDetail(
        id=user.id,
        name=user.name,
        email=user.email,
        role=user.role,
        auth_provider=user.auth_provider,
        language=user.language,
        is_active=user.is_active,
        is_verified=user.is_verified,
        created_at=user.created_at,
        pet_count=len(user.pets),
        pets=[AdminPetItem.model_validate(p) for p in user.pets],
    )
