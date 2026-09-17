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
    # 표시용 자유 텍스트 (예: "15000", "변동", "시가", "10,000원~15,000원").
    # 순수 숫자 문자열은 앱이 언어별로 포맷(콤마 + 원/KRW)하고, 그 외 문자열은 그대로 표시.
    # 기존 Integer 데이터의 마이그레이션에서는 "원"·콤마를 덧붙이지 않고 숫자 문자열로만 이관한다
    # (영어 화면에 "원"이 나오지 않게 하기 위함).
    # 반면 관리자가 직접 입력하는 자유텍스트에는 단위·콤마가 포함될 수 있다 — 그대로 저장한다.
    # 정렬·계산·집계 대상 아님.
    price: Mapped[str | None] = mapped_column(String(50), nullable=True)
    is_signature: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false")
    # Reserved for Phase-later photo upload. Populated column so a later
    # feature flip does not need a migration.
    image_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    sort_order: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    place: Mapped["Place"] = relationship("Place", back_populates="menus")
