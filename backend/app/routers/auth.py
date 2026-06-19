from datetime import datetime, timezone, timedelta

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.database import get_db
from app.models.user import User, AuthProvider
from app.schemas.user import (
    UserCreate,
    UserResponse,
    Token,
    LoginRequest,
    OAuthLogin,
    RegisterResponse,
    VerifyEmailRequest,
    ResendCodeRequest,
    ResendCodeResponse,
)
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
from app.services.email import (
    send_verification_email,
    generate_code,
    CODE_TTL_MIN,
    MAX_ATTEMPTS,
    RESEND_COOLDOWN_SEC,
)

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/register", response_model=RegisterResponse)
async def register(data: UserCreate, db: AsyncSession = Depends(get_db)):
    """Create or refresh an unverified account, mint a 6-digit code, persist
    it, commit, then send the email outside the transaction.

    - Verified duplicate → 400 (existing behaviour).
    - Unverified duplicate → name + password are overwritten with the new
      values (per Q1 decision), verification fields are reset, code is
      resent. This lets a user who never made it past verification "try
      again" without a stale credential lockout.
    - SMTP failure after commit → 503; the account is left in the DB
      unverified so a subsequent /resend-code can recover it.
    """
    result = await db.execute(select(User).where(User.email == data.email))
    existing = result.scalar_one_or_none()

    if existing and existing.is_verified:
        raise HTTPException(status_code=400, detail="Email already registered")

    code = generate_code()
    now = datetime.now(timezone.utc)
    expires = now + timedelta(minutes=CODE_TTL_MIN)

    if existing:
        existing.name = data.name
        existing.hashed_password = hash_password(data.password)
        existing.language = data.language
        existing.verification_code = code
        existing.verification_code_expires_at = expires
        existing.verification_attempts = 0
        existing.last_verification_sent_at = now
        target_email = existing.email
    else:
        user = User(
            email=data.email,
            name=data.name,
            hashed_password=hash_password(data.password),
            language=data.language,
            role=resolve_user_role_from_email(data.email),
            is_verified=False,
            verification_code=code,
            verification_code_expires_at=expires,
            verification_attempts=0,
            last_verification_sent_at=now,
        )
        db.add(user)
        target_email = data.email

    # Q5: commit user + code BEFORE the SMTP call so a mail failure does not
    # roll back the account row. get_db's auto-commit at handler return is
    # a no-op once we've already committed here.
    await db.commit()

    try:
        await send_verification_email(target_email, code)
    except Exception:
        raise HTTPException(
            status_code=503,
            detail="Failed to send verification email. Please try /resend-code.",
        )

    return RegisterResponse(
        email=target_email,
        message="인증 코드를 보냈습니다.",
        code_ttl_min=CODE_TTL_MIN,
    )


@router.post("/verify-email", response_model=Token)
async def verify_email(data: VerifyEmailRequest, db: AsyncSession = Depends(get_db)):
    """Validate a one-time code and, on success, mint the access token.

    Q3: a user who is already verified gets a flat 400 — we never issue a
    token through this path post-verification, since that would let anyone
    holding (or guessing) a stale code take over an existing account.
    """
    result = await db.execute(select(User).where(User.email == data.email))
    user = result.scalar_one_or_none()
    if user is None:
        raise HTTPException(status_code=400, detail="Invalid email or code")

    if user.is_verified:
        raise HTTPException(
            status_code=400,
            detail="Email already verified. Please log in.",
        )

    if not user.verification_code:
        raise HTTPException(
            status_code=400,
            detail="No active verification code. Please request a new one.",
        )

    now = datetime.now(timezone.utc)
    if user.verification_code_expires_at and user.verification_code_expires_at < now:
        raise HTTPException(
            status_code=400,
            detail="Verification code expired. Please request a new one.",
        )

    if user.verification_attempts >= MAX_ATTEMPTS:
        user.verification_code = None
        user.verification_code_expires_at = None
        await db.commit()
        raise HTTPException(
            status_code=429,
            detail="Too many attempts. Please request a new code.",
        )

    if user.verification_code != data.code:
        user.verification_attempts += 1
        # Hitting the cap on a wrong guess invalidates the code and ends
        # this attempt with 429 — the next call can't keep guessing the
        # cleared code, and the user is steered to /resend-code.
        if user.verification_attempts >= MAX_ATTEMPTS:
            user.verification_code = None
            user.verification_code_expires_at = None
            await db.commit()
            raise HTTPException(
                status_code=429,
                detail="Too many attempts. Please request a new code.",
            )
        await db.commit()
        raise HTTPException(status_code=400, detail="Invalid verification code")

    # Success — clear verification state and re-resolve role like login does.
    user.is_verified = True
    user.verification_code = None
    user.verification_code_expires_at = None
    user.verification_attempts = 0
    desired_role = resolve_user_role_from_email(user.email)
    if user.role != desired_role:
        user.role = desired_role
    await db.commit()

    token = create_access_token(token_payload_for(user))
    return Token(access_token=token, user=UserResponse.model_validate(user))


@router.post("/resend-code", response_model=ResendCodeResponse)
async def resend_code(data: ResendCodeRequest, db: AsyncSession = Depends(get_db)):
    """Issue a fresh code for an unverified account, enforcing a 60-second
    cooldown to avoid mail flood + brute-force amplification."""
    result = await db.execute(select(User).where(User.email == data.email))
    user = result.scalar_one_or_none()
    if user is None:
        raise HTTPException(status_code=400, detail="Invalid email")
    if user.is_verified:
        raise HTTPException(status_code=400, detail="Email already verified")

    now = datetime.now(timezone.utc)
    if user.last_verification_sent_at:
        elapsed = (now - user.last_verification_sent_at).total_seconds()
        if elapsed < RESEND_COOLDOWN_SEC:
            remaining = int(RESEND_COOLDOWN_SEC - elapsed)
            raise HTTPException(
                status_code=429,
                detail=f"Resend cooldown active. Retry after {remaining} seconds.",
            )

    code = generate_code()
    user.verification_code = code
    user.verification_code_expires_at = now + timedelta(minutes=CODE_TTL_MIN)
    user.verification_attempts = 0
    user.last_verification_sent_at = now
    await db.commit()

    try:
        await send_verification_email(data.email, code)
    except Exception:
        raise HTTPException(
            status_code=503,
            detail="Failed to send verification email. Please try again.",
        )

    return ResendCodeResponse(
        message="인증 코드를 다시 보냈습니다.",
        cooldown_sec=RESEND_COOLDOWN_SEC,
    )


@router.post("/login", response_model=Token)
async def login(data: LoginRequest, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(User).where(User.email == data.email))
    user = result.scalar_one_or_none()
    if not user or not verify_password(data.password, user.hashed_password or ""):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    if not user.is_active:
        raise HTTPException(status_code=403, detail="Account disabled")

    # Email-verification gate. Frontend reads detail.code to route to the
    # verify screen. No auto-resend here (would amplify mail spam and
    # bypass the 60s cooldown).
    if not user.is_verified:
        raise HTTPException(
            status_code=403,
            detail={
                "code": "EMAIL_NOT_VERIFIED",
                "message": "이메일 인증이 필요합니다",
                "email": user.email,
            },
        )

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
