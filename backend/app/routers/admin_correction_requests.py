from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.database import get_db
from app.models.correction_request import (
    CorrectionRequest,
    CorrectionRequestStatus,
    CorrectionRequestCategory,
)
from app.models.user import User
from app.schemas.correction_request import (
    CorrectionRequestResponse,
    CorrectionRequestListResponse,
    AdminCorrectionAction,
)
from app.services.auth import require_admin
from app.services.policy_logger import update_pet_policy_with_logging
from app.services.trust_engine import apply_trust_evaluation


router = APIRouter(prefix="/admin/correction-requests", tags=["admin"])


# Whitelist of pet_policies columns an admin is allowed to set via
# requested_info. verification_status is deliberately EXCLUDED so the
# trust engine remains the sole writer for that column — admins set the
# observable facts (pet_allowed_status, indoor_allowed, ...) and the
# verification band is recomputed downstream.
_ALLOWED_POLICY_FIELDS = {
    "pet_allowed_status",
    "indoor_allowed",
    "outdoor_allowed",
    "dog_allowed",
    "cat_allowed",
    "max_weight_kg",
    "leash_required",
    "carrier_required",
    "vaccination_required",
    "notes",
    "policy_source",
    "confidence_score",
}


@router.get("", response_model=CorrectionRequestListResponse)
async def list_admin_queue(
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
    status_filter: CorrectionRequestStatus | None = Query(default=None, alias="status"),
    request_category: CorrectionRequestCategory | None = None,
    place_id: int | None = None,
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
):
    base = select(CorrectionRequest)
    if status_filter is not None:
        base = base.where(CorrectionRequest.status == status_filter)
    if request_category is not None:
        base = base.where(CorrectionRequest.request_category == request_category)
    if place_id is not None:
        base = base.where(CorrectionRequest.place_id == place_id)

    total = (await db.execute(
        select(func.count()).select_from(base.subquery())
    )).scalar_one()

    rows = (await db.execute(
        base.options(selectinload(CorrectionRequest.place))
            .order_by(CorrectionRequest.created_at.desc())
            .offset((page - 1) * page_size)
            .limit(page_size)
    )).scalars().all()

    return CorrectionRequestListResponse(
        items=list(rows), total=total, page=page, page_size=page_size,
    )


@router.patch("/{request_id}", response_model=CorrectionRequestResponse)
async def admin_resolve(
    request_id: int,
    payload: AdminCorrectionAction,
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    req = (await db.execute(
        select(CorrectionRequest)
        .where(CorrectionRequest.id == request_id)
        .options(selectinload(CorrectionRequest.place))
    )).scalar_one_or_none()
    if req is None:
        raise HTTPException(status_code=404, detail="Correction request not found")
    if req.status in (CorrectionRequestStatus.APPROVED, CorrectionRequestStatus.REJECTED):
        raise HTTPException(status_code=409, detail="Already resolved")

    if payload.action == "reject":
        req.status = CorrectionRequestStatus.REJECTED
        req.admin_note = payload.admin_note
        req.resolved_at = datetime.now(timezone.utc)
        await db.flush()
        await db.refresh(req, ["place"])
        return req

    # action == "approve"
    # The user's requested_info IS the change set. Admins gate it but
    # don't rewrite it. verification_status is NOT in the whitelist —
    # it's owned by the trust engine and recomputed below.
    info = req.requested_info or {}
    if info:
        unknown = set(info) - _ALLOWED_POLICY_FIELDS
        if unknown:
            raise HTTPException(
                status_code=422,
                detail=(
                    f"Unknown pet_policy fields in requested_info: "
                    f"{sorted(unknown)}"
                ),
            )
        try:
            await update_pet_policy_with_logging(
                db, req.place_id,
                changes=info,
                changed_by=f"admin:{admin.id}",
                reason=f"correction_request:{req.id}",
            )
        except ValueError as exc:
            raise HTTPException(status_code=409, detail=str(exc))
    # else: notification-style request (e.g. closed_down with no
    # requested_info) — just flip status, no policy edit.

    req.status = CorrectionRequestStatus.APPROVED
    req.admin_note = payload.admin_note
    req.resolved_at = datetime.now(timezone.utc)

    await db.flush()

    # Re-evaluate verification_status now that the new approved report +
    # any pet_policies edits are visible inside this transaction.
    await apply_trust_evaluation(db, req.place_id)

    await db.refresh(req, ["place"])
    return req
