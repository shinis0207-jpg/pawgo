from sqlalchemy import String, Float, ForeignKey, DateTime, Enum as SAEnum
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.sql import func
from datetime import datetime
import enum
from app.database import Base


class PlaceMatchingStatus(str, enum.Enum):
    AUTO_MATCHED = "auto_matched"
    PENDING_REVIEW = "pending_review"
    UNMATCHED = "unmatched"
    APPROVED = "approved"
    REJECTED = "rejected"


class PlaceMatchingJob(Base):
    __tablename__ = "place_matching_jobs"

    id: Mapped[int] = mapped_column(primary_key=True)
    place_id: Mapped[int | None] = mapped_column(
        ForeignKey("places.id", ondelete="SET NULL"), nullable=True, index=True
    )
    mfds_id: Mapped[str] = mapped_column(String(100), index=True)
    kakao_id: Mapped[str | None] = mapped_column(String(100), nullable=True)
    naver_id: Mapped[str | None] = mapped_column(String(100), nullable=True)
    match_score: Mapped[float] = mapped_column(Float, default=0.0, server_default="0.0")
    status: Mapped[PlaceMatchingStatus] = mapped_column(
        SAEnum(PlaceMatchingStatus, values_callable=lambda c: [m.value for m in c]),
        default=PlaceMatchingStatus.UNMATCHED,
        server_default="unmatched", index=True,
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    reviewed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    reviewed_by: Mapped[str | None] = mapped_column(String(100), nullable=True)
