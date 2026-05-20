"""Admin-side /admin/correction-requests endpoints + approve/reject flow."""
import pytest
from fastapi import HTTPException
from sqlalchemy import select

from app.models.correction_request import (
    CorrectionRequest,
    CorrectionRequestCategory,
    CorrectionRequestStatus,
)
from app.models.pet_policy import (
    PetAllowedStatus,
    PetPolicy,
    PolicySource,
    VerificationStatus,
)
from app.models.place import Place, PlaceCategory
from app.models.policy_change_log import PolicyChangeLog
from app.models.user import User, UserRole
from app.routers.admin_correction_requests import (
    list_admin_queue,
    admin_resolve,
)
from app.routers.correction_requests import submit_correction_request
from app.schemas.correction_request import (
    AdminCorrectionAction,
    CorrectionRequestCreate,
)
from app.services.auth import require_admin
from app.services.places import create_place_with_default_policy


async def _admin(db, email="admin-cr@test.com") -> User:
    u = User(email=email, name="admin", role=UserRole.ADMIN)
    db.add(u)
    await db.flush()
    return u


async def _regular(db, email="reg-cr@test.com") -> User:
    u = User(email=email, name="reg", role=UserRole.USER)
    db.add(u)
    await db.flush()
    return u


async def _place(db, name: str, **extras):
    return await create_place_with_default_policy(db, {
        "name": name,
        "category": PlaceCategory.CAFE,
        "latitude": 37.5,
        "longitude": 127.0,
        "address": "addr",
        **extras,
    })


async def _submit(db, user, place, **fields) -> CorrectionRequest:
    payload = CorrectionRequestCreate(
        place_id=place.id,
        description=fields.get("description", "x"),
        request_category=fields.get(
            "request_category", CorrectionRequestCategory.PET_ALLOWED_WRONG,
        ),
        requested_info=fields.get("requested_info"),
    )
    return await submit_correction_request(payload, current_user=user, db=db)


# ─── require_admin gate via the dependency ──────────────────────────────


async def test_require_admin_blocks_regular_user_at_dependency(db_session):
    user = await _regular(db_session)
    with pytest.raises(HTTPException) as exc:
        await require_admin(current_user=user)
    assert exc.value.status_code == 403


# ─── GET admin queue ────────────────────────────────────────────────────


async def test_admin_sees_all_requests(db_session):
    admin = await _admin(db_session)
    a = await _regular(db_session, "rega@test.com")
    b = await _regular(db_session, "regb@test.com")
    place = await _place(db_session, "queue-place")
    await _submit(db_session, a, place, description="a-1")
    await _submit(db_session, b, place, description="b-1")
    await _submit(db_session, a, place, description="a-2")

    queue = await list_admin_queue(
        admin=admin, db=db_session,
        status_filter=None, request_category=None, place_id=None,
        page=1, page_size=20,
    )
    assert queue.total == 3
    assert {r.description for r in queue.items} == {"a-1", "b-1", "a-2"}


# ─── PATCH approve / reject ─────────────────────────────────────────────


async def test_admin_reject_sets_status_and_admin_note(db_session):
    admin = await _admin(db_session)
    user = await _regular(db_session)
    place = await _place(db_session, "reject-place")
    req = await _submit(db_session, user, place)

    payload = AdminCorrectionAction(action="reject", admin_note="not enough evidence")
    result = await admin_resolve(req.id, payload, admin=admin, db=db_session)
    assert result.status == CorrectionRequestStatus.REJECTED
    assert result.admin_note == "not enough evidence"
    assert result.resolved_at is not None


async def test_admin_approve_applies_requested_info_and_logs(db_session):
    admin = await _admin(db_session, "approve-admin@test.com")
    user = await _regular(db_session, "approve-user@test.com")
    place = await _place(db_session, "approve-place")
    req = await _submit(
        db_session, user, place,
        requested_info={
            "pet_allowed_status": "not_allowed",
            "indoor_allowed": False,
        },
    )

    result = await admin_resolve(
        req.id, AdminCorrectionAction(action="approve"),
        admin=admin, db=db_session,
    )
    assert result.status == CorrectionRequestStatus.APPROVED

    policy = (await db_session.execute(
        select(PetPolicy).where(PetPolicy.place_id == place.id)
    )).scalar_one()
    assert policy.pet_allowed_status == PetAllowedStatus.NOT_ALLOWED
    assert policy.indoor_allowed is False

    logs = list((await db_session.execute(
        select(PolicyChangeLog)
        .where(PolicyChangeLog.place_id == place.id)
        .order_by(PolicyChangeLog.id)
    )).scalars().all())
    # Admin wrote 2 fields; trust_engine flips nothing (no MFDS/owner/admin
    # log yet at the moment the engine runs, and zero approved reports
    # within window from this user yet -> verification stays unknown).
    fields = sorted(l.field_name for l in logs)
    assert "pet_allowed_status" in fields
    assert "indoor_allowed" in fields
    for l in logs:
        if l.changed_by.startswith("admin:"):
            assert l.reason == f"correction_request:{req.id}"


async def test_admin_approve_unknown_field_in_requested_info_yields_422(db_session):
    admin = await _admin(db_session, "u422-admin@test.com")
    user = await _regular(db_session, "u422-user@test.com")
    place = await _place(db_session, "u422-place")
    req = await _submit(
        db_session, user, place,
        requested_info={"not_a_real_column": True},
    )
    with pytest.raises(HTTPException) as exc:
        await admin_resolve(
            req.id, AdminCorrectionAction(action="approve"),
            admin=admin, db=db_session,
        )
    assert exc.value.status_code == 422


async def test_admin_approve_rejects_verification_status_via_requested_info(db_session):
    """verification_status is excluded from the admin whitelist; trying to
    set it through requested_info must come back as 422 so the trust
    engine remains the sole writer for that column.
    """
    admin = await _admin(db_session, "vstat-admin@test.com")
    user = await _regular(db_session, "vstat-user@test.com")
    place = await _place(db_session, "vstat-place")
    req = await _submit(
        db_session, user, place,
        requested_info={"verification_status": "admin_verified"},
    )
    with pytest.raises(HTTPException) as exc:
        await admin_resolve(
            req.id, AdminCorrectionAction(action="approve"),
            admin=admin, db=db_session,
        )
    assert exc.value.status_code == 422


async def test_admin_double_resolve_yields_409(db_session):
    admin = await _admin(db_session, "dup-admin@test.com")
    user = await _regular(db_session, "dup-user@test.com")
    place = await _place(db_session, "dup-place")
    req = await _submit(db_session, user, place)
    await admin_resolve(
        req.id, AdminCorrectionAction(action="approve"),
        admin=admin, db=db_session,
    )
    with pytest.raises(HTTPException) as exc:
        await admin_resolve(
            req.id, AdminCorrectionAction(action="reject"),
            admin=admin, db=db_session,
        )
    assert exc.value.status_code == 409


async def test_approve_with_mfds_place_triggers_trust_engine_official_verified(db_session):
    """Sanity: after admin approve on an MFDS-tagged place, trust engine
    should flip verification_status to official_verified and log it.
    """
    admin = await _admin(db_session, "te-admin@test.com")
    user = await _regular(db_session, "te-user@test.com")
    place = await _place(
        db_session, "te-place",
        official_mfds_id="MFDS_ADMIN_TEST_1",
    )
    # Submit a notification-style request (no requested_info policy edits)
    # so we isolate the trust-engine effect.
    req = await _submit(
        db_session, user, place,
        request_category=CorrectionRequestCategory.INFO_OUTDATED,
    )
    await admin_resolve(
        req.id, AdminCorrectionAction(action="approve"),
        admin=admin, db=db_session,
    )
    policy = (await db_session.execute(
        select(PetPolicy).where(PetPolicy.place_id == place.id)
    )).scalar_one()
    assert policy.verification_status == VerificationStatus.OFFICIAL_VERIFIED

    last_log = (await db_session.execute(
        select(PolicyChangeLog)
        .where(PolicyChangeLog.place_id == place.id)
        .order_by(PolicyChangeLog.id.desc())
    )).scalars().first()
    assert last_log is not None
    assert last_log.field_name == "verification_status"
    assert last_log.changed_by == "system:trust_engine"
