from datetime import datetime
from sqlalchemy import ForeignKey, DateTime, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.sql import func

from app.database import Base


class Favorite(Base):
    """User-saved place.

    UNIQUE(user_id, place_id) makes the POST handler idempotent at the DB
    layer — a double-tap on the heart icon or a stale client can't create
    duplicate rows. Both FKs cascade on delete; this is convenience state
    for the "saved places" list, not an audit log, so dropping a user or
    place should drop their favorite rows too.
    """

    __tablename__ = "favorites"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False
    )
    place_id: Mapped[int] = mapped_column(
        ForeignKey("places.id", ondelete="CASCADE"), index=True, nullable=False
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    # Read-only relationship for response payloads. Callers must
    # selectinload(Favorite.place) to avoid async lazy-load.
    place: Mapped["Place"] = relationship("Place")

    __table_args__ = (
        UniqueConstraint("user_id", "place_id", name="uq_favorites_user_place"),
    )
