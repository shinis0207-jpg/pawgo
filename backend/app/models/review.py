from sqlalchemy import String, Float, ForeignKey, DateTime, Text, Integer, Boolean
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.sql import func
from datetime import datetime
from app.database import Base


class Review(Base):
    __tablename__ = "reviews"

    id: Mapped[int] = mapped_column(primary_key=True)
    place_id: Mapped[int] = mapped_column(ForeignKey("places.id", ondelete="CASCADE"), index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    pet_id: Mapped[int | None] = mapped_column(
        ForeignKey("pets.id", ondelete="SET NULL"), nullable=True
    )
    rating: Mapped[float] = mapped_column(Float)
    content: Mapped[str | None] = mapped_column(Text, nullable=True)
    visit_date: Mapped[str | None] = mapped_column(String(20), nullable=True)
    is_helpful_count: Mapped[int] = mapped_column(Integer, default=0)
    is_verified_visit: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    place: Mapped["Place"] = relationship("Place", back_populates="reviews")
    user: Mapped["User"] = relationship("User", back_populates="reviews")
    pet: Mapped["Pet | None"] = relationship("Pet", back_populates="reviews")
    photos: Mapped[list["ReviewPhoto"]] = relationship(
        "ReviewPhoto", back_populates="review", lazy="selectin"
    )


class ReviewPhoto(Base):
    __tablename__ = "review_photos"

    id: Mapped[int] = mapped_column(primary_key=True)
    review_id: Mapped[int] = mapped_column(ForeignKey("reviews.id", ondelete="CASCADE"), index=True)
    url: Mapped[str] = mapped_column(String(500))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    review: Mapped["Review"] = relationship("Review", back_populates="photos")
