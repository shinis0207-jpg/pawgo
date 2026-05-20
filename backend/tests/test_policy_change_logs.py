"""policy_change_logs auto-logging — verifies update_pet_policy_with_logging
emits one row per actually-changed loggable field and that the trust engine
goes through the same helper for its verification_status flip.
"""
from sqlalchemy import select

from app.models.pet_policy import (
    PetAllowedStatus,
    PetPolicy,
    PolicySource,
    VerificationStatus,
)
from app.models.place import PlaceCategory
from app.models.policy_change_log import PolicyChangeLog
from app.services.places import create_place_with_default_policy
from app.services.policy_logger import update_pet_policy_with_logging
from app.services.trust_engine import apply_trust_evaluation


_LAT = 37.5665
_LNG = 126.9780


async def _make_place(db, name: str = "log-test", **extras):
    return await create_place_with_default_policy(db, {
        "name": name,
        "category": PlaceCategory.RESTAURANT,
        "latitude": _LAT,
        "longitude": _LNG,
        "address": "addr",
        **extras,
    })


async def _logs_for(db, place_id: int) -> list[PolicyChangeLog]:
    return list((await db.execute(
        select(PolicyChangeLog)
        .where(PolicyChangeLog.place_id == place_id)
        .order_by(PolicyChangeLog.id)
    )).scalars().all())


# ─── update_pet_policy_with_logging core behaviour ─────────────────────


async def test_helper_logs_one_row_per_changed_field(db_session):
    place = await _make_place(db_session)
    await update_pet_policy_with_logging(
        db_session, place.id,
        changes={
            "pet_allowed_status": PetAllowedStatus.ALLOWED,
            "indoor_allowed": True,
        },
        changed_by="admin:1",
        reason="test",
    )
    logs = await _logs_for(db_session, place.id)
    assert len(logs) == 2
    fields = sorted(l.field_name for l in logs)
    assert fields == ["indoor_allowed", "pet_allowed_status"]
    for l in logs:
        assert l.changed_by == "admin:1"
        assert l.reason == "test"
        assert l.before_value is not None or l.after_value is not None


async def test_helper_skips_unchanged_value(db_session):
    place = await _make_place(db_session)
    # Initial pet_allowed_status is UNKNOWN; setting it to UNKNOWN again
    # must not produce a log.
    await update_pet_policy_with_logging(
        db_session, place.id,
        changes={"pet_allowed_status": PetAllowedStatus.UNKNOWN},
        changed_by="admin:1",
    )
    logs = await _logs_for(db_session, place.id)
    assert logs == []


async def test_helper_silently_drops_non_loggable_fields(db_session):
    place = await _make_place(db_session)
    # 'rating' is on places (and not in the loggable set); the helper
    # should ignore it without raising.
    await update_pet_policy_with_logging(
        db_session, place.id,
        changes={
            "pet_allowed_status": PetAllowedStatus.ALLOWED,
            "rating": 4.5,        # not a pet_policies column at all
        },
        changed_by="admin:1",
    )
    logs = await _logs_for(db_session, place.id)
    assert [l.field_name for l in logs] == ["pet_allowed_status"]


async def test_helper_captures_before_and_after_as_strings(db_session):
    place = await _make_place(db_session)
    await update_pet_policy_with_logging(
        db_session, place.id,
        changes={"pet_allowed_status": PetAllowedStatus.ALLOWED},
        changed_by="admin:1",
    )
    log = (await _logs_for(db_session, place.id))[0]
    assert log.before_value == "unknown"
    assert log.after_value == "allowed"


# ─── Trust engine writes via the same helper ───────────────────────────


async def test_trust_engine_verification_flip_is_logged(db_session):
    place = await _make_place(db_session, official_mfds_id="MFDS_LOG_1")
    # Mark MFDS source via the helper so the only verification_status flip
    # under test comes from apply_trust_evaluation itself.
    await update_pet_policy_with_logging(
        db_session, place.id,
        changes={
            "policy_source": PolicySource.MFDS,
            "pet_allowed_status": PetAllowedStatus.ALLOWED,
        },
        changed_by="system:mfds_import",
        reason="seed",
    )
    pre_logs = await _logs_for(db_session, place.id)
    assert len(pre_logs) == 2  # policy_source + pet_allowed_status flips

    new_status = await apply_trust_evaluation(db_session, place.id)
    assert new_status == VerificationStatus.OFFICIAL_VERIFIED

    post_logs = await _logs_for(db_session, place.id)
    # One additional log for the verification_status flip.
    assert len(post_logs) == 3
    last = post_logs[-1]
    assert last.field_name == "verification_status"
    assert last.changed_by == "system:trust_engine"
    assert last.reason == "auto_reevaluation"
    assert last.before_value == "unknown"
    assert last.after_value == "official_verified"


async def test_trust_engine_no_flip_no_log(db_session):
    place = await _make_place(db_session)
    # verification_status starts at UNKNOWN; with no signals, trust engine
    # returns UNKNOWN and should write nothing.
    pre_logs = await _logs_for(db_session, place.id)
    assert pre_logs == []

    new_status = await apply_trust_evaluation(db_session, place.id)
    assert new_status == VerificationStatus.UNKNOWN

    post_logs = await _logs_for(db_session, place.id)
    assert post_logs == []
