from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.correction_request import (
    CorrectionRequest,
    CorrectionRequestStatus,
    CorrectionRequestCategory,
)
from app.models.place import Place
from app.models.user import User
from app.schemas.correction_request import (
    CorrectionRequestCreate,
    CorrectionRequestResponse,
    CorrectionRequestListResponse,
)
from app.services.auth import get_current_user

router = APIRouter(prefix="/correction-requests", tags=["correction-requests"])


@router.post("", response_model=CorrectionRequestResponse, status_code=status.HTTP_201_CREATED)
async def submit_correction_request(
    data: CorrectionRequestCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    place = (await db.execute(
        select(Place).where(Place.id == data.place_id)
    )).scalar_one_or_none()
    if place is None:
        raise HTTPException(status_code=404, detail="Place not found")

    req = CorrectionRequest(
        place_id=data.place_id,
        user_id=current_user.id,
        request_category=data.request_category,
        description=data.description,
        current_info=data.current_info,
        requested_info=data.requested_info,
        visit_date=data.visit_date,
        status=CorrectionRequestStatus.PENDING,
    )
    db.add(req)
    await db.flush()
    await db.refresh(req)
    return req


@router.get("", response_model=CorrectionRequestListResponse)
async def list_my_correction_requests(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    status_filter: CorrectionRequestStatus | None = Query(default=None, alias="status"),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
):
    """List correction requests submitted by the authenticated user only."""
    base = select(CorrectionRequest).where(CorrectionRequest.user_id == current_user.id)
    if status_filter is not None:
        base = base.where(CorrectionRequest.status == status_filter)

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
