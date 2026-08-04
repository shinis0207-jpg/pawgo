from pydantic import BaseModel, EmailStr, Field
from datetime import date, datetime
from app.models.user import AuthProvider, Language, UserRole


class UserCreate(BaseModel):
    email: EmailStr
    name: str
    password: str
    language: Language = Language.KO


class UserUpdate(BaseModel):
    name: str | None = None
    language: Language | None = None
    profile_image_url: str | None = None


class UserResponse(BaseModel):
    id: int
    email: str
    name: str
    language: Language
    profile_image_url: str | None
    is_verified: bool
    role: UserRole
    created_at: datetime

    model_config = {"from_attributes": True}


class OAuthLogin(BaseModel):
    provider: AuthProvider
    access_token: str


class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserResponse


class TokenData(BaseModel):
    user_id: int | None = None


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


# ── Email verification (Phase 2-B) ─────────────────────────────────────
# Internal fields (verification_code, expires_at, attempts) are
# deliberately NOT exposed on any response schema.

class RegisterResponse(BaseModel):
    email: EmailStr
    message: str
    code_ttl_min: int


class VerifyEmailRequest(BaseModel):
    email: EmailStr
    code: str = Field(min_length=6, max_length=6, pattern=r"^\d{6}$")


class ResendCodeRequest(BaseModel):
    email: EmailStr


class ResendCodeResponse(BaseModel):
    message: str
    cooldown_sec: int


# ── Admin read-only member inspection ─────────────────────────────────
# Response shapes for /admin/users. Sensitive columns
# (hashed_password, verification_code, verification_code_expires_at,
# verification_attempts, last_verification_sent_at, oauth_id) are
# deliberately absent — a future refactor that adds fields to the User
# model must consciously opt them in here rather than leak by default.

class AdminPetItem(BaseModel):
    id: int
    name: str
    type: str
    breed: str | None
    weight_kg: float | None
    birth_date: date | None
    notes: str | None

    model_config = {"from_attributes": True}


class AdminUserListItem(BaseModel):
    id: int
    name: str
    email: EmailStr
    role: UserRole
    auth_provider: AuthProvider
    created_at: datetime
    pet_count: int


class AdminUserListResponse(BaseModel):
    items: list[AdminUserListItem]
    total: int
    page: int
    size: int


class AdminUserDetail(BaseModel):
    id: int
    name: str
    email: EmailStr
    role: UserRole
    auth_provider: AuthProvider
    language: Language
    is_active: bool
    is_verified: bool
    created_at: datetime
    pet_count: int
    pets: list[AdminPetItem]
