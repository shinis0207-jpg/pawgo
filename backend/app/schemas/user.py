from pydantic import BaseModel, EmailStr
from datetime import datetime
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
