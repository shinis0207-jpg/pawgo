"""Email sending service for PawGo verification flow.

Uses stdlib smtplib so we add no new dependency. The blocking SMTP work
runs inside asyncio.to_thread so the FastAPI event loop isn't held up by
the SMTP round-trip.

Verification policy constants live here so the router/service layer can
import a single source of truth for length, TTL, attempt cap, and resend
cooldown.
"""
from __future__ import annotations

import asyncio
import secrets
import smtplib
from email.message import EmailMessage

from app.config import get_settings


# ── Verification policy constants ──────────────────────────────────────
CODE_LENGTH = 6              # digits
CODE_TTL_MIN = 10            # minutes a code stays valid after issue
MAX_ATTEMPTS = 5             # wrong tries before the code is invalidated
RESEND_COOLDOWN_SEC = 60     # min seconds between successive resend calls


def generate_code() -> str:
    """Return a zero-padded CODE_LENGTH-digit numeric code.

    Uses `secrets` (CSPRNG) rather than `random`. Overkill for a 10-minute
    6-digit code, but cheap and removes one class of "why didn't you" later.
    """
    return f"{secrets.randbelow(10 ** CODE_LENGTH):0{CODE_LENGTH}d}"


def _send_sync(to_email: str, code: str) -> None:
    """Blocking SMTP submission. Runs inside a worker thread.

    Settings are read here (not at module load) so a misconfig surfaces at
    send time with a clear error rather than at import time as a startup
    crash for unrelated routes.
    """
    settings = get_settings()
    if not settings.smtp_host:
        raise RuntimeError("SMTP_HOST is not configured")
    if not settings.smtp_user:
        raise RuntimeError("SMTP_USER is not configured")
    if not settings.smtp_password:
        raise RuntimeError("SMTP_PASSWORD is not configured")

    msg = EmailMessage()
    msg["From"] = f"{settings.email_from_name} <{settings.smtp_user}>"
    msg["To"] = to_email
    msg["Subject"] = "PawGo 이메일 인증 코드"
    msg.set_content(
        "PawGo 가입을 환영합니다.\n"
        "\n"
        f"인증 코드: {code}\n"
        "\n"
        f"코드는 {CODE_TTL_MIN}분 안에 입력하세요.\n"
        "본인이 가입을 시도하지 않았다면 이 메일은 무시해도 됩니다.\n"
    )

    with smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=15) as s:
        s.starttls()
        s.login(settings.smtp_user, settings.smtp_password)
        s.send_message(msg)


async def send_verification_email(to_email: str, code: str) -> None:
    """Send a one-time verification code to `to_email`.

    Raises on misconfig / SMTP / network errors so the caller (router) can
    translate to an HTTP error response.
    """
    await asyncio.to_thread(_send_sync, to_email, code)
