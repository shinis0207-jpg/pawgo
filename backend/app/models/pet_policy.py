from sqlalchemy import String, Float, Boolean, ForeignKey, DateTime, Text, Integer, Enum as SAEnum
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.sql import func
from datetime import datetime
import enum
from app.database import Base


class PetAllowedStatus(str, enum.Enum):
    ALLOWED = "allowed"
    LIMITED = "limited"
    NOT_ALLOWED = "not_allowed"
    UNKNOWN = "unknown"


class VerificationStatus(str, enum.Enum):
    OFFICIAL_VERIFIED = "official_verified"
    OWNER_VERIFIED = "owner_verified"
    ADMIN_VERIFIED = "admin_verified"
    USER_REPORTED = "user_reported"
    UNDER_REVIEW = "under_review"
    UNKNOWN = "unknown"


class PolicySource(str, enum.Enum):
    MFDS = "mfds"
    OWNER = "owner"
    ADMIN = "admin"
    USER_REPORT = "user_report"
    EXTERNAL = "external"
    UNKNOWN = "unknown"


class PetPolicy(Base):
    __tablename__ = "pet_policies"

    id: Mapped[int] = mapped_column(primary_key=True)
    place_id: Mapped[int] = mapped_column(
        ForeignKey("places.id", ondelete="CASCADE"), unique=True, index=True
    )
    pet_allowed_status: Mapped[PetAllowedStatus] = mapped_column(
        SAEnum(PetAllowedStatus), default=PetAllowedStatus.UNKNOWN,
        server_default="unknown", index=True,
    )
    verification_status: Mapped[VerificationStatus] = mapped_column(
        SAEnum(VerificationStatus), default=VerificationStatus.UNKNOWN,
        server_default="unknown", index=True,
    )
    indoor_allowed: Mapped[bool | None] = mapped_column(Boolean, nullable=True)
    outdoor_allowed: Mapped[bool | None] = mapped_column(Boolean, nullable=True)
    dog_allowed: Mapped[bool | None] = mapped_column(Boolean, nullable=True)
    cat_allowed: Mapped[bool | None] = mapped_column(Boolean, nullable=True)
    max_weight_kg: Mapped[float | None] = mapped_column(Float, nullable=True)
    leash_required: Mapped[bool | None] = mapped_column(Boolean, nullable=True)
    carrier_required: Mapped[bool | None] = mapped_column(Boolean, nullable=True)
    vaccination_required: Mapped[bool | None] = mapped_column(Boolean, nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    policy_source: Mapped[PolicySource] = mapped_column(
        SAEnum(PolicySource), default=PolicySource.UNKNOWN, server_default="unknown",
    )
    confidence_score: Mapped[float] = mapped_column(Float, default=0.0, server_default="0.0")
    last_verified_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    place: Mapped["Place"] = relationship("Place", back_populates="pet_policy")
