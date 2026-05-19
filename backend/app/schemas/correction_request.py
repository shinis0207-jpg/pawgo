from pydantic import BaseModel, Field
from datetime import datetime, date

from app.models.correction_request import (
    CorrectionRequestStatus,
    CorrectionRequestCategory,
)


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
