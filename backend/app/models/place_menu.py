from sqlalchemy import String, Integer, Boolean, ForeignKey, DateTime
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.sql import func
from datetime import datetime
from app.database import Base


class PlaceMenu(Base):
    """A menu item attached to a place.

    Deliberately shares no ordering column with PlacePhoto — menus have
    an editable `sort_order`, while photos rank by `is_primary` + created_at.
    Relationship is loaded on demand (not selectin) so /places/nearby
    doesn't drag menu rows for every card.
    """

    __tablename__ = "place_menus"

    id: Mapped[int] = mapped_column(primary_key=True)
    place_id: Mapped[int] = mapped_column(
        ForeignKey("places.id", ondelete="CASCADE"), index=True
    )
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    # Integer 원 단위. Free-form price text ("시가", "10,000원~") is not
    # supported by design — coerce to int before write, drop the row if you
    # can't.
    price: Mapped[int | None] = mapped_column(Integer, nullable=True)
    is_signature: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false")
    # Reserved for Phase-later photo upload. Populated column so a later
    # feature flip does not need a migration.
    image_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    sort_order: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    place: Mapped["Place"] = relationship("Place", back_populates="menus")
