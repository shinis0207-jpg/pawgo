from sqlalchemy import String, Boolean, ForeignKey, DateTime, JSON, Integer
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.sql import func
from datetime import datetime
from app.database import Base


class VetHospital(Base):
    __tablename__ = "vet_hospitals"

    id: Mapped[int] = mapped_column(primary_key=True)
    place_id: Mapped[int] = mapped_column(
        ForeignKey("places.id", ondelete="CASCADE"), unique=True, index=True
    )
    is_24h: Mapped[bool] = mapped_column(Boolean, default=False)
    emergency: Mapped[bool] = mapped_column(Boolean, default=False)
    night_hours: Mapped[str | None] = mapped_column(String(100), nullable=True)
    specialties: Mapped[list | None] = mapped_column(JSON, nullable=True)
    license_number: Mapped[str | None] = mapped_column(String(50), nullable=True)
    doctor_count: Mapped[int | None] = mapped_column(Integer, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    place: Mapped["Place"] = relationship("Place", back_populates="vet_info")
