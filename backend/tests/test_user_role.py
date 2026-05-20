"""User.role + ADMIN_EMAILS auto-promotion + require_admin gate."""
from datetime import datetime, timedelta

import pytest
from fastapi import HTTPException
from jose import jwt
from sqlalchemy import select

from app.config import get_settings
from app.models.user import User, UserRole
from app.schemas.user import UserCreate, LoginRequest
from app.services.auth import (
    create_access_token,
    get_current_user,
    require_admin,
    resolve_user_role_from_email,
    token_payload_for,
    hash_password,
)
from app.routers.auth import register, login


# ─── resolve_user_role_from_email ───────────────────────────────────────


def test_resolve_role_with_empty_admin_emails(monkeypatch):
    settings = get_settings()
    monkeypatch.setattr(settings, "admin_emails", "")
    assert resolve_user_role_from_email("anyone@test.com") == UserRole.USER


def test_resolve_role_with_match(monkeypatch):
    settings = get_settings()
    monkeypatch.setattr(settings, "admin_emails", "boss@test.com,boss2@test.com")
    assert resolve_user_role_from_email("boss@test.com") == UserRole.ADMIN
    assert resolve_user_role_from_email("BOSS@test.com") == UserRole.ADMIN  # case-insensitive
    assert resolve_user_role_from_email("nobody@test.com") == UserRole.USER


# ─── register / login auto-promotion ────────────────────────────────────


async def test_register_promotes_admin_email(db_session, monkeypatch):
    settings = get_settings()
    monkeypatch.setattr(settings, "admin_emails", "boss@test.com")

    data = UserCreate(email="boss@test.com", name="boss", password="pw12345678")
    token = await register(data, db=db_session)
    assert token.user.role == UserRole.ADMIN

    row = (await db_session.execute(
        select(User).where(User.email == "boss@test.com")
    )).scalar_one()
    assert row.role == UserRole.ADMIN


async def test_register_keeps_non_admin_as_user(db_session, monkeypatch):
    settings = get_settings()
    monkeypatch.setattr(settings, "admin_emails", "boss@test.com")

    data = UserCreate(email="alice@test.com", name="alice", password="pw12345678")
    token = await register(data, db=db_session)
    assert token.user.role == UserRole.USER


async def test_login_promotes_existing_user_when_added_to_admins(db_session, monkeypatch):
    """Existing user becomes admin on their next login after being added."""
    settings = get_settings()
    monkeypatch.setattr(settings, "admin_emails", "")  # not admin at register
    data = UserCreate(email="becomeadmin@test.com", name="x", password="pw12345678")
    await register(data, db=db_session)

    # Operator adds them to ADMIN_EMAILS.
    monkeypatch.setattr(settings, "admin_emails", "becomeadmin@test.com")

    token = await login(
        LoginRequest(email="becomeadmin@test.com", password="pw12345678"),
        db=db_session,
    )
    assert token.user.role == UserRole.ADMIN

    row = (await db_session.execute(
        select(User).where(User.email == "becomeadmin@test.com")
    )).scalar_one()
    assert row.role == UserRole.ADMIN


# ─── JWT carries role ───────────────────────────────────────────────────


async def test_token_payload_for_includes_role(db_session):
    user = User(
        email="payload@test.com", name="t",
        hashed_password=hash_password("pw12345678"),
        role=UserRole.ADMIN,
    )
    db_session.add(user)
    await db_session.flush()
    token = create_access_token(token_payload_for(user))
    settings = get_settings()
    decoded = jwt.decode(token, settings.secret_key, algorithms=[settings.algorithm])
    assert decoded["sub"] == str(user.id)
    assert decoded["role"] == "admin"


# ─── require_admin gate ─────────────────────────────────────────────────


async def test_require_admin_allows_admin(db_session):
    admin = User(email="ra-admin@test.com", name="ra", role=UserRole.ADMIN)
    db_session.add(admin)
    await db_session.flush()
    result = await require_admin(current_user=admin)
    assert result is admin


async def test_require_admin_rejects_regular_user(db_session):
    user = User(email="ra-user@test.com", name="ra", role=UserRole.USER)
    db_session.add(user)
    await db_session.flush()
    with pytest.raises(HTTPException) as exc:
        await require_admin(current_user=user)
    assert exc.value.status_code == 403


async def test_get_current_user_rejects_invalid_token(db_session):
    with pytest.raises(HTTPException) as exc:
        await get_current_user(token="not-a-valid-jwt", db=db_session)
    assert exc.value.status_code == 401
