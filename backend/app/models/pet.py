from sqlalchemy import String, Float, Date, ForeignKey, DateTime, JSON
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.sql import func
from datetime import datetime, date
from app.database import Base


class Pet(Base):
    __tablename__ = "pets"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    name: Mapped[str] = mapped_column(String(50))
    type: Mapped[str] = mapped_column(String(50))  # dog, cat, bird, etc.
    breed: Mapped[str | None] = mapped_column(String(100), nullable=True)
    weight_kg: Mapped[float | None] = mapped_column(Float, nullable=True)
    birth_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    chip_id: Mapped[str | None] = mapped_column(String(50), nullable=True, unique=True)
    photo_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    vaccination_records: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    notes: Mapped[str | None] = mapped_column(String(1000), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    owner: Mapped["User"] = relationship("User", back_populates="pets")
    # Phase 1 reviews no longer carry pet_id; pet ↔ review relationship dropped.
