from sqlalchemy import String, DateTime, Enum as SAEnum, Boolean, Integer
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.sql import func
from datetime import datetime
import enum
from app.database import Base


class AuthProvider(str, enum.Enum):
    EMAIL = "email"
    KAKAO = "kakao"
    GOOGLE = "google"
    APPLE = "apple"


class Language(str, enum.Enum):
    KO = "ko"
    EN = "en"
    JA = "ja"
    ZH = "zh"


class UserRole(str, enum.Enum):
    USER = "user"
    ADMIN = "admin"


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    name: Mapped[str] = mapped_column(String(100))
    hashed_password: Mapped[str | None] = mapped_column(String(255), nullable=True)
    auth_provider: Mapped[AuthProvider] = mapped_column(
        SAEnum(AuthProvider), default=AuthProvider.EMAIL
    )
    oauth_id: Mapped[str | None] = mapped_column(String(255), nullable=True)
    language: Mapped[Language] = mapped_column(SAEnum(Language), default=Language.KO)
    profile_image_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    is_verified: Mapped[bool] = mapped_column(Boolean, default=False)
    verification_code: Mapped[str | None] = mapped_column(String(10), nullable=True)
    verification_code_expires_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    verification_attempts: Mapped[int] = mapped_column(
        Integer, nullable=False, server_default="0"
    )
    last_verification_sent_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    role: Mapped[UserRole] = mapped_column(
        SAEnum(UserRole, values_callable=lambda c: [m.value for m in c]),
        default=UserRole.USER,
        server_default="user",
        nullable=False,
        index=True,
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    pets: Mapped[list["Pet"]] = relationship("Pet", back_populates="owner", lazy="selectin")
    # reviews relationship dropped; Review.user_id is nullable and queried via filter.
