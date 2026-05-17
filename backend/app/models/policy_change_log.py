from sqlalchemy import String, ForeignKey, DateTime, Text
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.sql import func
from datetime import datetime
from app.database import Base


class PolicyChangeLog(Base):
    """Audit trail of every pet_policies field mutation.

    `changed_by` is a free-form label (user id stringified, "admin:<id>", or
    "system:<job>") so the source of any policy change can be inspected even
    if the original user/admin row is later deleted.
    """

    __tablename__ = "policy_change_logs"

    id: Mapped[int] = mapped_column(primary_key=True)
    place_id: Mapped[int] = mapped_column(
        ForeignKey("places.id", ondelete="CASCADE"), index=True
    )
    field_name: Mapped[str] = mapped_column(String(100))
    before_value: Mapped[str | None] = mapped_column(Text, nullable=True)
    after_value: Mapped[str | None] = mapped_column(Text, nullable=True)
    changed_by: Mapped[str] = mapped_column(String(100))
    reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
