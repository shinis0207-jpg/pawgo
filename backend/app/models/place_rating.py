from sqlalchemy import Float, Integer, ForeignKey, DateTime
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.sql import func
from datetime import datetime
from app.database import Base


class PlaceRating(Base):
    """Aggregated review metrics per place (one row per place).

    NOTE: Phase 1 keeps `places.rating` / `places.review_count` populated for
    backward-compatible responses while this table is empty. Phase 2/3 should
    migrate response payloads to read from here and drop the duplicates.
    """

    __tablename__ = "place_ratings"

    place_id: Mapped[int] = mapped_column(
        ForeignKey("places.id", ondelete="CASCADE"), primary_key=True
    )
    pet_friendliness_avg: Mapped[float] = mapped_column(Float, default=0.0, server_default="0.0")
    taste_avg: Mapped[float] = mapped_column(Float, default=0.0, server_default="0.0")
    ambience_avg: Mapped[float] = mapped_column(Float, default=0.0, server_default="0.0")
    cleanliness_avg: Mapped[float] = mapped_column(Float, default=0.0, server_default="0.0")
    staff_friendliness_avg: Mapped[float] = mapped_column(Float, default=0.0, server_default="0.0")
    revisit_intent_avg: Mapped[float] = mapped_column(Float, default=0.0, server_default="0.0")
    sample_count: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    place: Mapped["Place"] = relationship("Place", back_populates="place_rating")
