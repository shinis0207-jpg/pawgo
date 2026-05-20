from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.correction_request import (
    CorrectionRequest,
    CorrectionRequestStatus,
    CorrectionRequestCategory,
)
from app.models.pet_policy import PetPolicy
from app.models.user import User
from app.schemas.correction_request import (
    CorrectionRequestResponse,
    CorrectionRequestListResponse,
    AdminCorrectionAction,
)
from app.services.auth import require_admin


router = APIRouter(prefix="/admin/correction-requests", tags=["admin"])


# Whitelist of pet_policies columns an admin is allowed to set via
# pet_policy_update. Anything outside this set is a 422.
_ALLOWED_POLICY_FIELDS = {
    "pet_allowed_status",
    "verification_status",
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
        base.order_by(CorrectionRequest.created_at.desc())
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
        select(CorrectionRequest).where(CorrectionRequest.id == request_id)
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
        await db.refresh(req)
        return req

    # action == "approve"
    # The user's requested_info IS the change set. Admins gate it but
    # don't rewrite it; if you need different values, reject and ask
    # the user to resubmit, or edit the place via a future admin tool.
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
        policy = (await db.execute(
            select(PetPolicy).where(PetPolicy.place_id == req.place_id)
        )).scalar_one_or_none()
        if policy is None:
            raise HTTPException(
                status_code=409,
                detail="pet_policies row missing for this place — investigate "
                       "the helper invariant before retrying.",
            )
        for field, value in info.items():
            setattr(policy, field, value)
    # else: notification-style request (e.g. closed_down with no
    # requested_info) — just flip status, no policy edit.

    req.status = CorrectionRequestStatus.APPROVED
    req.admin_note = payload.admin_note
    req.resolved_at = datetime.now(timezone.utc)

    await db.flush()
    await db.refresh(req)
    return req
