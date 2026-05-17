from sqlalchemy import String, ForeignKey, DateTime, Text, JSON, Enum as SAEnum
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.sql import func
from datetime import datetime, date
import enum
from app.database import Base


class CorrectionRequestStatus(str, enum.Enum):
    PENDING = "pending"
    REVIEWING = "reviewing"
    APPROVED = "approved"
    REJECTED = "rejected"


class CorrectionRequest(Base):
    """User-submitted correction to a place's information.

    MVP 1차에서는 텍스트 기반 정정 요청을 우선 구현한다.
    `evidence_image_url`은 Phase 2.5 Object Storage 연동 시 사용할 컬럼이다 — 현재
    Phase 1에서는 컬럼만 생성하고 실제 이미지 업로드 기능은 구현하지 않는다.
    """

    __tablename__ = "correction_requests"

    id: Mapped[int] = mapped_column(primary_key=True)
    place_id: Mapped[int] = mapped_column(
        ForeignKey("places.id", ondelete="CASCADE"), index=True
    )
    user_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True
    )
    request_type: Mapped[str] = mapped_column(String(50))
    description: Mapped[str] = mapped_column(Text)
    current_info: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    requested_info: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    # NOTE: evidence_image_url is reserved for Phase 2.5 image upload via Object Storage.
    # Phase 1 only provisions the column; upload UX is intentionally not implemented yet.
    evidence_image_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    visit_date: Mapped[date | None] = mapped_column(DateTime(timezone=True), nullable=True)
    status: Mapped[CorrectionRequestStatus] = mapped_column(
        SAEnum(CorrectionRequestStatus), default=CorrectionRequestStatus.PENDING,
        server_default="pending", index=True,
    )
    admin_note: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
