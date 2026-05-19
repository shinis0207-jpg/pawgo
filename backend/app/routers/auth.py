from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.database import get_db
from app.models.user import User, AuthProvider
from app.schemas.user import UserCreate, UserResponse, Token, LoginRequest, OAuthLogin
from app.services.auth import (
    hash_password,
    verify_password,
    create_access_token,
    get_current_user,
    get_kakao_user_info,
    get_google_user_info,
    get_or_create_oauth_user,
    resolve_user_role_from_email,
    token_payload_for,
)

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/register", response_model=Token, status_code=status.HTTP_201_CREATED)
async def register(data: UserCreate, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(User).where(User.email == data.email))
    if result.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Email already registered")

    user = User(
        email=data.email,
        name=data.name,
        hashed_password=hash_password(data.password),
        language=data.language,
        role=resolve_user_role_from_email(data.email),
    )
    db.add(user)
    await db.flush()

    token = create_access_token(token_payload_for(user))
    return Token(access_token=token, user=UserResponse.model_validate(user))


@router.post("/login", response_model=Token)
async def login(data: LoginRequest, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(User).where(User.email == data.email))
    user = result.scalar_one_or_none()
    if not user or not verify_password(data.password, user.hashed_password or ""):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    if not user.is_active:
        raise HTTPException(status_code=403, detail="Account disabled")

    # Every login re-resolves the role so additions/removals in ADMIN_EMAILS
    # take effect on the user's next login without a separate migration.
    desired_role = resolve_user_role_from_email(user.email)
    if user.role != desired_role:
        user.role = desired_role

    token = create_access_token(token_payload_for(user))
    return Token(access_token=token, user=UserResponse.model_validate(user))


@router.post("/oauth", response_model=Token)
async def oauth_login(data: OAuthLogin, db: AsyncSession = Depends(get_db)):
    if data.provider == AuthProvider.KAKAO:
        info = await get_kakao_user_info(data.access_token)
    elif data.provider == AuthProvider.GOOGLE:
        info = await get_google_user_info(data.access_token)
    else:
        raise HTTPException(status_code=400, detail="Unsupported OAuth provider")

    user = await get_or_create_oauth_user(
        db,
        provider=data.provider,
        oauth_id=info["id"],
        email=info["email"],
        name=info["name"],
        profile_image=info.get("profile_image"),
    )
    token = create_access_token(token_payload_for(user))
    return Token(access_token=token, user=UserResponse.model_validate(user))


@router.get("/me", response_model=UserResponse)
async def get_me(current_user: User = Depends(get_current_user)):
    return current_user
