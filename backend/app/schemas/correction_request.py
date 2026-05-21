from pydantic import BaseModel, Field
from datetime import datetime, date

from app.models.correction_request import (
    CorrectionRequestStatus,
    CorrectionRequestCategory,
)
from app.models.place import PlaceCategory


class CorrectionRequestPlaceMini(BaseModel):
    """Minimal place projection embedded inside a correction-request
    response so callers can render the place name + category in one
    round-trip. Routers MUST selectinload CorrectionRequest.place before
    serialising to avoid async lazy-load.
    """
    id: int
    name: str
    category: PlaceCategory

    model_config = {"from_attributes": True}


class CorrectionRequestCreate(BaseModel):
    place_id: int
    request_category: CorrectionRequestCategory = CorrectionRequestCategory.OTHER
    description: str = Field(min_length=1, max_length=2000)
    current_info: dict | None = None
    requested_info: dict | None = None
    visit_date: date | None = None


class CorrectionRequestResponse(BaseModel):
    id: int
    place_id: int
    place: CorrectionRequestPlaceMini
    user_id: int | None
    request_category: CorrectionRequestCategory
    description: str
    current_info: dict | None
    requested_info: dict | None
    evidence_image_url: str | None
    visit_date: date | None
    status: CorrectionRequestStatus
    admin_note: str | None
    created_at: datetime
    resolved_at: datetime | None

    model_config = {"from_attributes": True}


class CorrectionRequestListResponse(BaseModel):
    items: list[CorrectionRequestResponse]
    total: int
    page: int
    page_size: int


class AdminCorrectionAction(BaseModel):
    """Admin verdict on a correction request.

    On `approve`, the underlying request's `requested_info` JSON is the
    sole source of pet_policies edits — the admin can't override the
    payload here. This keeps the user's submission as the canonical
    change set; admins gate it through but don't rewrite it. For
    notification-style categories whose `requested_info` is empty
    (closed_down, info_outdated, ...), approve just flips status without
    touching pet_policies.
    """
    action: str = Field(pattern="^(approve|reject)$")
    admin_note: str | None = Field(default=None, max_length=2000)
