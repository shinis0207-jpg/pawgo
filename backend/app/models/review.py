from sqlalchemy import String, Float, Boolean, ForeignKey, DateTime, Text, Integer
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.sql import func
from datetime import datetime, date
from app.database import Base


class Review(Base):
    """Phase 1 review schema — six independent scores plus contextual actuals."""

    __tablename__ = "reviews"

    id: Mapped[int] = mapped_column(primary_key=True)
    place_id: Mapped[int] = mapped_column(
        ForeignKey("places.id", ondelete="CASCADE"), index=True
    )
    user_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True
    )

    # Visit context
    pet_visit_verified: Mapped[bool] = mapped_column(Boolean, default=False)
    pet_allowed_actual: Mapped[bool | None] = mapped_column(Boolean, nullable=True)
    indoor_actual: Mapped[bool | None] = mapped_column(Boolean, nullable=True)
    outdoor_actual: Mapped[bool | None] = mapped_column(Boolean, nullable=True)

    # Six independent scores (0..5 typical, not enforced at DB level)
    pet_friendliness_score: Mapped[float | None] = mapped_column(Float, nullable=True)
    taste_score: Mapped[float | None] = mapped_column(Float, nullable=True)
    ambience_score: Mapped[float | None] = mapped_column(Float, nullable=True)
    cleanliness_score: Mapped[float | None] = mapped_column(Float, nullable=True)
    staff_friendliness_score: Mapped[float | None] = mapped_column(Float, nullable=True)
    revisit_intent_score: Mapped[float | None] = mapped_column(Float, nullable=True)

    comment: Mapped[str | None] = mapped_column(Text, nullable=True)
    visit_date: Mapped[date | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    place: Mapped["Place"] = relationship("Place", back_populates="reviews")
