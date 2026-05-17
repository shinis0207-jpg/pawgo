from sqlalchemy import String, Float, Boolean, ForeignKey, DateTime, Text, Integer, JSON, Enum as SAEnum
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.sql import func
from datetime import datetime
import enum
from app.database import Base


class PlaceCategory(str, enum.Enum):
    ACCOMMODATION = "accommodation"
    RESTAURANT = "restaurant"
    CAFE = "cafe"
    PARK = "park"
    VET = "vet"


class VisibilityStatus(str, enum.Enum):
    VISIBLE = "visible"
    HIDDEN = "hidden"


class Place(Base):
    """In Phase 1+, always create via
    services/places.py::create_place_with_default_policy().

    Direct Place(...) instantiation outside that helper is discouraged
    because a matching PetPolicy row will not be created automatically.
    """

    __tablename__ = "places"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(200), index=True)
    category: Mapped[PlaceCategory] = mapped_column(SAEnum(PlaceCategory), index=True)
    latitude: Mapped[float] = mapped_column(Float)
    longitude: Mapped[float] = mapped_column(Float)
    address: Mapped[str] = mapped_column(String(500))
    road_address: Mapped[str | None] = mapped_column(String(500), nullable=True)
    address_detail: Mapped[str | None] = mapped_column(String(200), nullable=True)
    city: Mapped[str | None] = mapped_column(String(100), nullable=True, index=True)
    province: Mapped[str | None] = mapped_column(String(100), nullable=True)
    phone: Mapped[str | None] = mapped_column(String(20), nullable=True)
    website: Mapped[str | None] = mapped_column(String(500), nullable=True)
    hours: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    # has_parking is a general place amenity (not a pet policy), kept on places.
    has_parking: Mapped[bool] = mapped_column(Boolean, default=False)
    entrance_fee: Mapped[str | None] = mapped_column(String(200), nullable=True)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    thumbnail_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    # rating / review_count are kept for backward-compatible response payloads
    # until place_ratings is populated. Phase 2/3 consolidation TODO.
    rating: Mapped[float] = mapped_column(Float, default=0.0)
    review_count: Mapped[int] = mapped_column(Integer, default=0)
    visibility_status: Mapped[VisibilityStatus] = mapped_column(
        SAEnum(VisibilityStatus, values_callable=lambda c: [m.value for m in c]),
        default=VisibilityStatus.VISIBLE, server_default="visible", index=True,
    )
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    owner_user_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    external_id: Mapped[str | None] = mapped_column(String(100), nullable=True)
    kakao_place_id: Mapped[str | None] = mapped_column(String(100), nullable=True, index=True)
    naver_place_id: Mapped[str | None] = mapped_column(String(100), nullable=True, index=True)
    official_mfds_id: Mapped[str | None] = mapped_column(String(100), nullable=True, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    translations: Mapped[list["PlaceTranslation"]] = relationship(
        "PlaceTranslation", back_populates="place", lazy="selectin"
    )
    photos: Mapped[list["PlacePhoto"]] = relationship(
        "PlacePhoto", back_populates="place", lazy="selectin"
    )
    reviews: Mapped[list["Review"]] = relationship("Review", back_populates="place")
    vet_info: Mapped["VetHospital | None"] = relationship(
        "VetHospital", back_populates="place", uselist=False
    )
    pet_policy: Mapped["PetPolicy | None"] = relationship(
        "PetPolicy", back_populates="place", uselist=False, lazy="selectin"
    )
    place_rating: Mapped["PlaceRating | None"] = relationship(
        "PlaceRating", back_populates="place", uselist=False
    )


class PlaceTranslation(Base):
    __tablename__ = "place_translations"

    id: Mapped[int] = mapped_column(primary_key=True)
    place_id: Mapped[int] = mapped_column(ForeignKey("places.id", ondelete="CASCADE"), index=True)
    language: Mapped[str] = mapped_column(String(5), index=True)
    name: Mapped[str] = mapped_column(String(200))
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    address: Mapped[str | None] = mapped_column(String(500), nullable=True)

    place: Mapped["Place"] = relationship("Place", back_populates="translations")


class PlacePhoto(Base):
    __tablename__ = "place_photos"

    id: Mapped[int] = mapped_column(primary_key=True)
    place_id: Mapped[int] = mapped_column(ForeignKey("places.id", ondelete="CASCADE"), index=True)
    url: Mapped[str] = mapped_column(String(500))
    caption: Mapped[str | None] = mapped_column(String(200), nullable=True)
    is_primary: Mapped[bool] = mapped_column(Boolean, default=False)
    uploaded_by: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    place: Mapped["Place"] = relationship("Place", back_populates="photos")
