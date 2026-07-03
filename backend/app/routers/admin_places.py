"""Admin direct-edit endpoint for pet_policies.

Bypasses the correction-request queue so an admin can push a policy fix
straight through without a user having reported it first. Writes go
through update_pet_policy_with_logging so policy_change_logs and trust
engine re-evaluation stay wired up exactly as they are for
correction-request-driven approvals.
"""
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.database import get_db
from app.models.place import Place
from app.models.user import User
from app.schemas.place import (
    PetPolicyPatchRequest,
    PetPolicyResponse,
    PlaceAdminPatchRequest,
    PlaceListResponse,
    PlaceResponse,
)
from app.services.auth import require_admin
from app.services.cache import cache_delete_pattern
from app.services.places import place_to_response
from app.services.policy_logger import update_pet_policy_with_logging
from app.services.trust_engine import apply_trust_evaluation
# Sole source of truth for the field set an admin is allowed to touch.
# admin_correction_requests already enforces it on the queue-driven
# path; sharing the constant keeps queue vs direct-edit in lockstep.
from app.routers.admin_correction_requests import _ALLOWED_POLICY_FIELDS


# Fail at import time if the pydantic body schema and the shared
# whitelist ever drift apart. Either both should gain a field or both
# should lose one — this assert points a future maintainer at both
# sources instead of letting one path silently accept a field the other
# rejects.
_PATCH_SCHEMA_FIELDS = set(PetPolicyPatchRequest.model_fields.keys())
assert _PATCH_SCHEMA_FIELDS == _ALLOWED_POLICY_FIELDS, (
    "PetPolicyPatchRequest fields drifted from _ALLOWED_POLICY_FIELDS: "
    f"only in schema={_PATCH_SCHEMA_FIELDS - _ALLOWED_POLICY_FIELDS}, "
    f"only in whitelist={_ALLOWED_POLICY_FIELDS - _PATCH_SCHEMA_FIELDS}"
)


router = APIRouter(prefix="/admin/places", tags=["admin"])


@router.get("", response_model=PlaceListResponse)
async def admin_list_places(
    q: str | None = Query(default=None, max_length=100),
    page: int = Query(default=1, ge=1),
    size: int = Query(default=20, ge=1, le=100),
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Admin place listing — name search, includes HIDDEN rows.

    Unlike the public /places/nearby, this endpoint deliberately does NOT
    filter by visibility_status so an admin can find a place they just
    soft-deleted and restore it. is_active is still enforced so
    test/junk rows stay out.

    Name matching mirrors the public search (whitespace-insensitive
    ilike). When q is omitted, returns all places paginated.
    """
    query = (
        select(Place)
        .where(Place.is_active == True)  # noqa: E712 (SQLAlchemy needs `== True`)
        .options(selectinload(Place.pet_policy), selectinload(Place.photos))
    )
    if q:
        q_nospace = q.strip().replace(" ", "")
        if q_nospace:
            pattern = f"%{q_nospace}%"
            query = query.where(
                func.replace(Place.name, " ", "").ilike(pattern)
            )

    total = (await db.execute(
        select(func.count()).select_from(query.subquery())
    )).scalar_one()

    rows = (await db.execute(
        query.order_by(Place.name)
        .offset((page - 1) * size)
        .limit(size)
    )).scalars().all()

    items = [place_to_response(p, "ko") for p in rows]
    return {"items": items, "total": total, "page": page, "size": size}


@router.patch("/{place_id}", response_model=PlaceResponse)
async def admin_update_place(
    place_id: int,
    data: PlaceAdminPatchRequest,
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Admin edit for name / phone / visibility_status.

    - 404 when the places row is missing.
    - 422 (auto, from pydantic model_config extra='forbid' + validators)
      when the body carries any field outside the whitelist or a blank/
      null name / null visibility_status.

    Does NOT filter by visibility_status on load — a HIDDEN place must
    still be editable so the admin can restore it. No policy-side
    effects: this endpoint never calls update_pet_policy_with_logging or
    apply_trust_evaluation. Trust engine doesn't look at name / phone /
    visibility_status, so verification bands are unaffected.
    """
    place = (await db.execute(
        select(Place).where(Place.id == place_id)
        .options(selectinload(Place.pet_policy), selectinload(Place.photos))
    )).scalar_one_or_none()
    if place is None:
        raise HTTPException(status_code=404, detail="Place not found")

    changes = data.model_dump(exclude_unset=True)
    for field, value in changes.items():
        setattr(place, field, value)

    # Delete every language variant so a subsequent GET refetches from
    # the DB. cache.py already exposes cache_delete_pattern; the "ko"-only
    # tombstone the three place-editing routes used to share was a leftover
    # from before that helper existed.
    await cache_delete_pattern(f"place:{place_id}:*")

    return place_to_response(place, "ko")


@router.patch("/{place_id}/policy", response_model=PetPolicyResponse)
async def admin_update_policy(
    place_id: int,
    data: PetPolicyPatchRequest,
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Overwrite whitelisted pet_policies fields for `place_id`.

    - 404 when the places row itself is missing.
    - 409 when the places row exists but its pet_policies row doesn't;
      that means the create_place_with_default_policy invariant was
      violated upstream and papering over it here would hide the bug.
    - 422 (auto, from pydantic model_config extra='forbid') when the
      body carries any field outside the whitelist, including
      verification_status.

    Empty body (no fields supplied) is a legal no-op: the helper still
    runs, writes zero log rows, and trust re-evaluation runs on
    unchanged data.
    """
    place_exists = (await db.execute(
        select(Place.id).where(Place.id == place_id)
    )).scalar_one_or_none()
    if place_exists is None:
        raise HTTPException(status_code=404, detail="Place not found")

    changes = data.model_dump(exclude_unset=True)
    try:
        policy = await update_pet_policy_with_logging(
            db, place_id,
            changes=changes,
            changed_by=f"admin:{admin.id}",
            reason="admin_direct_edit",
        )
    except ValueError as exc:
        raise HTTPException(status_code=409, detail=str(exc))

    # Re-evaluate verification_status inside this transaction so the
    # returned policy reflects the trust engine's fresh call — mirrors
    # the correction-request approve flow.
    await apply_trust_evaluation(db, place_id)
    await db.refresh(policy)

    # Invalidate the place cache so the next GET /places/{id} refetches
    # from the DB instead of serving the pre-edit response. Same pattern
    # as places.py::update_place — pattern-delete covers every language
    # variant in one call.
    await cache_delete_pattern(f"place:{place_id}:*")

    return policy
