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


class CorrectionRequestCategory(str, enum.Enum):
    PET_ALLOWED_WRONG = "pet_allowed_wrong"  # "반려동물 동반 가능 여부가 틀려요"
    CLOSED_DOWN = "closed_down"              # "이 카페 폐업했어요"
    ADDRESS_CHANGED = "address_changed"      # "주소가 바뀌었어요"
    PHONE_CHANGED = "phone_changed"          # "전화번호가 바뀌었어요"
    INFO_OUTDATED = "info_outdated"          # "정보가 오래됐어요"
    OTHER = "other"                          # "기타"


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
    request_category: Mapped[CorrectionRequestCategory] = mapped_column(
        SAEnum(CorrectionRequestCategory, values_callable=lambda c: [m.value for m in c]),
        default=CorrectionRequestCategory.OTHER,
        server_default="other",
        nullable=False,
        index=True,
    )
    description: Mapped[str] = mapped_column(Text)
    current_info: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    requested_info: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    # NOTE: evidence_image_url is reserved for Phase 2.5 image upload via Object Storage.
    # Phase 1 only provisions the column; upload UX is intentionally not implemented yet.
    evidence_image_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    visit_date: Mapped[date | None] = mapped_column(DateTime(timezone=True), nullable=True)
    status: Mapped[CorrectionRequestStatus] = mapped_column(
        SAEnum(CorrectionRequestStatus, values_callable=lambda c: [m.value for m in c]),
        default=CorrectionRequestStatus.PENDING,
        server_default="pending", index=True,
    )
    admin_note: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    # Read-only relationship for response payloads. Callers must
    # selectinload(CorrectionRequest.place) to avoid async lazy-load.
    place: Mapped["Place"] = relationship("Place")
