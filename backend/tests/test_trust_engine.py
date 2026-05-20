"""Trust-engine scenarios from Phase 2A spec section 6-5.

Each test builds the minimum set of rows (place + pet_policy + the relevant
signal table) inline, then asserts evaluate_verification_status() lands in
the documented band.

NOTE on scenario "MFDS allowed + owner_verified not_allowed → under_review":
Phase 2A's data model carries a single pet_policies row per place, so
"MFDS says allowed" and "owner says not_allowed" can't be expressed at
the same time on the same row. The branch is wired in trust_engine.py
for Phase 4 (when owner_claims will carry its own pet_allowed signal),
and a placeholder test below records that limitation as XFAIL so the
intent is preserved without faking data.
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

import pytest
from sqlalchemy import select

from app.models.correction_request import (
    CorrectionRequest,
    CorrectionRequestCategory,
    CorrectionRequestStatus,
)
from app.models.owner_claim import OwnerClaim, OwnerClaimStatus
from app.models.pet_policy import (
    PetAllowedStatus,
    PetPolicy,
    PolicySource,
    VerificationStatus,
)
from app.models.place import PlaceCategory
from app.models.policy_change_log import PolicyChangeLog
from app.models.user import User
from app.services.places import create_place_with_default_policy
from app.services.trust_engine import evaluate_verification_status


async def _make_user(db, *, email: str) -> User:
    user = User(email=email, name="trust-test-user")
    db.add(user)
    await db.flush()
    return user


_LAT = 37.5665
_LNG = 126.9780


async def _make_place(db, *, name: str = "trust-test", official_mfds_id: str | None = None):
    return await create_place_with_default_policy(db, {
        "name": name,
        "category": PlaceCategory.RESTAURANT,
        "latitude": _LAT,
        "longitude": _LNG,
        "address": "addr",
        "official_mfds_id": official_mfds_id,
    })


async def _policy(db, place_id: int) -> PetPolicy:
    return (await db.execute(
        select(PetPolicy).where(PetPolicy.place_id == place_id)
    )).scalar_one()


async def _mark_mfds(db, place_id: int, pet_allowed: PetAllowedStatus = PetAllowedStatus.ALLOWED):
    p = await _policy(db, place_id)
    p.policy_source = PolicySource.MFDS
    p.pet_allowed_status = pet_allowed
    await db.flush()


async def _add_approved_report(
    db,
    place_id: int,
    *,
    days_ago: int,
    pet_allowed: PetAllowedStatus | None = None,
):
    """Insert an APPROVED correction_request resolved <days_ago> days ago."""
    resolved = datetime.now(timezone.utc) - timedelta(days=days_ago)
    requested_info = (
        {"pet_allowed_status": pet_allowed.value} if pet_allowed is not None else None
    )
    db.add(CorrectionRequest(
        place_id=place_id,
        user_id=None,
        request_category=CorrectionRequestCategory.PET_ALLOWED_WRONG,
        description="test report",
        requested_info=requested_info,
        status=CorrectionRequestStatus.APPROVED,
        resolved_at=resolved,
    ))
    await db.flush()


async def _add_admin_change_log(db, place_id: int, *, admin_user_id: int = 1):
    db.add(PolicyChangeLog(
        place_id=place_id,
        field_name="pet_allowed_status",
        before_value="unknown",
        after_value="allowed",
        changed_by=f"admin:{admin_user_id}",
        reason="test admin verdict",
    ))
    await db.flush()


# ─── Single-signal scenarios ────────────────────────────────────────────


async def test_mfds_only_returns_official_verified(db_session):
    place = await _make_place(db_session, official_mfds_id="MFDS_TEST_1")
    await _mark_mfds(db_session, place.id)
    assert await evaluate_verification_status(db_session, place.id) == \
        VerificationStatus.OFFICIAL_VERIFIED


async def test_owner_claim_only_returns_owner_verified(db_session):
    place = await _make_place(db_session)
    owner = await _make_user(db_session, email="owner-only@test")
    db_session.add(OwnerClaim(
        place_id=place.id,
        owner_user_id=owner.id,
        verification_method="business_license",
        verification_status=OwnerClaimStatus.VERIFIED,
    ))
    await db_session.flush()
    assert await evaluate_verification_status(db_session, place.id) == \
        VerificationStatus.OWNER_VERIFIED


async def test_admin_change_log_only_returns_admin_verified(db_session):
    place = await _make_place(db_session)
    await _add_admin_change_log(db_session, place.id)
    assert await evaluate_verification_status(db_session, place.id) == \
        VerificationStatus.ADMIN_VERIFIED


async def test_three_recent_reports_return_user_reported(db_session):
    place = await _make_place(db_session)
    for _ in range(3):
        await _add_approved_report(db_session, place.id, days_ago=10)
    assert await evaluate_verification_status(db_session, place.id) == \
        VerificationStatus.USER_REPORTED


async def test_two_recent_reports_return_unknown(db_session):
    place = await _make_place(db_session)
    for _ in range(2):
        await _add_approved_report(db_session, place.id, days_ago=10)
    assert await evaluate_verification_status(db_session, place.id) == \
        VerificationStatus.UNKNOWN


async def test_old_reports_outside_window_return_unknown(db_session):
    place = await _make_place(db_session)
    for _ in range(5):
        await _add_approved_report(db_session, place.id, days_ago=120)
    assert await evaluate_verification_status(db_session, place.id) == \
        VerificationStatus.UNKNOWN


# ─── Conflict scenarios ─────────────────────────────────────────────────


async def test_mfds_allowed_vs_three_not_allowed_reports_returns_under_review(db_session):
    place = await _make_place(db_session, official_mfds_id="MFDS_TEST_2")
    await _mark_mfds(db_session, place.id, pet_allowed=PetAllowedStatus.ALLOWED)
    for _ in range(3):
        await _add_approved_report(
            db_session, place.id, days_ago=10,
            pet_allowed=PetAllowedStatus.NOT_ALLOWED,
        )
    assert await evaluate_verification_status(db_session, place.id) == \
        VerificationStatus.UNDER_REVIEW


@pytest.mark.xfail(
    reason=(
        "Phase 2A data model holds one pet_policies row per place, so 'MFDS "
        "allowed vs owner-verified not_allowed' cannot be observed yet. "
        "Branch is wired in trust_engine.py for Phase 4 when owner_claims "
        "gains its own pet_allowed signal."
    ),
    strict=True,
)
async def test_mfds_allowed_vs_owner_not_allowed_returns_under_review(db_session):
    place = await _make_place(db_session, official_mfds_id="MFDS_TEST_3")
    await _mark_mfds(db_session, place.id, pet_allowed=PetAllowedStatus.ALLOWED)
    owner = await _make_user(db_session, email="mfds-vs-owner@test")
    db_session.add(OwnerClaim(
        place_id=place.id,
        owner_user_id=owner.id,
        verification_method="business_license",
        verification_status=OwnerClaimStatus.VERIFIED,
    ))
    # NOTE: cannot also set pet_policy to not_allowed for the "owner side"
    # — same row as MFDS side. Branch returns OFFICIAL_VERIFIED today.
    await db_session.flush()
    assert await evaluate_verification_status(db_session, place.id) == \
        VerificationStatus.UNDER_REVIEW
