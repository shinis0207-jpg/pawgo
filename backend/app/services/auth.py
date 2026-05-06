from datetime import datetime, timedelta
from jose import JWTError, jwt
from passlib.context import CryptContext
from fastapi import HTTPException, status, Depends
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
import httpx

from app.config import get_settings
from app.database import get_db
from app.models.user import User, AuthProvider, Language
from app.schemas.user import TokenData

settings = get_settings()
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/v1/auth/login")


def hash_password(password: str) -> str:
    return pwd_context.hash(password)


def verify_password(plain: str, hashed: str) -> bool:
    return pwd_context.verify(plain, hashed)


def create_access_token(data: dict) -> str:
    payload = data.copy()
    expire = datetime.utcnow() + timedelta(minutes=settings.access_token_expire_minutes)
    payload.update({"exp": expire})
    return jwt.encode(payload, settings.secret_key, algorithm=settings.algorithm)


async def get_current_user(
    token: str = Depends(oauth2_scheme),
    db: AsyncSession = Depends(get_db),
) -> User:
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Invalid credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, settings.secret_key, algorithms=[settings.algorithm])
        user_id: int | None = payload.get("sub")
        if user_id is None:
            raise credentials_exception
    except JWTError:
        raise credentials_exception

    result = await db.execute(select(User).where(User.id == int(user_id), User.is_active == True))
    user = result.scalar_one_or_none()
    if user is None:
        raise credentials_exception
    return user


async def get_kakao_user_info(access_token: str) -> dict:
    async with httpx.AsyncClient() as client:
        response = await client.get(
            "https://kapi.kakao.com/v2/user/me",
            headers={"Authorization": f"Bearer {access_token}"},
        )
        if response.status_code != 200:
            raise HTTPException(status_code=400, detail="Invalid Kakao token")
        data = response.json()
        kakao_account = data.get("kakao_account", {})
        return {
            "id": str(data["id"]),
            "email": kakao_account.get("email", f"kakao_{data['id']}@pawgo.app"),
            "name": kakao_account.get("profile", {}).get("nickname", "사용자"),
            "profile_image": kakao_account.get("profile", {}).get("thumbnail_image_url"),
        }


async def get_google_user_info(access_token: str) -> dict:
    async with httpx.AsyncClient() as client:
        response = await client.get(
            "https://www.googleapis.com/oauth2/v3/userinfo",
            headers={"Authorization": f"Bearer {access_token}"},
        )
        if response.status_code != 200:
            raise HTTPException(status_code=400, detail="Invalid Google token")
        data = response.json()
        return {
            "id": data["sub"],
            "email": data.get("email", ""),
            "name": data.get("name", "사용자"),
            "profile_image": data.get("picture"),
        }


async def get_or_create_oauth_user(
    db: AsyncSession,
    provider: AuthProvider,
    oauth_id: str,
    email: str,
    name: str,
    profile_image: str | None,
) -> User:
    result = await db.execute(
        select(User).where(User.auth_provider == provider, User.oauth_id == oauth_id)
    )
    user = result.scalar_one_or_none()
    if user:
        return user

    result = await db.execute(select(User).where(User.email == email))
    user = result.scalar_one_or_none()
    if user:
        user.oauth_id = oauth_id
        user.auth_provider = provider
        return user

    user = User(
        email=email,
        name=name,
        auth_provider=provider,
        oauth_id=oauth_id,
        profile_image_url=profile_image,
        is_verified=True,
    )
    db.add(user)
    await db.flush()
    return user
