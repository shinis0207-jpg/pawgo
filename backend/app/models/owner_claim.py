from sqlalchemy import String, ForeignKey, DateTime, Enum as SAEnum
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.sql import func
from datetime import datetime
import enum
from app.database import Base


class OwnerClaimStatus(str, enum.Enum):
    PENDING = "pending"
    VERIFIED = "verified"
    REJECTED = "rejected"


class OwnerClaim(Base):
    __tablename__ = "owner_claims"

    id: Mapped[int] = mapped_column(primary_key=True)
    place_id: Mapped[int] = mapped_column(
        ForeignKey("places.id", ondelete="CASCADE"), index=True
    )
    owner_user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    verification_method: Mapped[str] = mapped_column(String(50))
    verification_status: Mapped[OwnerClaimStatus] = mapped_column(
        SAEnum(OwnerClaimStatus, values_callable=lambda c: [m.value for m in c]),
        default=OwnerClaimStatus.PENDING,
        server_default="pending", index=True,
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    verified_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
