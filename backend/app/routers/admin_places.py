"""Admin direct-edit endpoint for pet_policies.

Bypasses the correction-request queue so an admin can push a policy fix
straight through without a user having reported it first. Writes go
through update_pet_policy_with_logging so policy_change_logs and trust
engine re-evaluation stay wired up exactly as they are for
correction-request-driven approvals.
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.place import Place
from app.models.user import User
from app.schemas.place import PetPolicyPatchRequest, PetPolicyResponse
from app.services.auth import require_admin
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

    return policy
