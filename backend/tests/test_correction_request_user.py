"""User-side /correction-requests endpoints."""
import pytest
from fastapi import HTTPException
from sqlalchemy import select

from app.models.correction_request import (
    CorrectionRequest,
    CorrectionRequestCategory,
    CorrectionRequestStatus,
)
from app.models.place import PlaceCategory
from app.models.user import User
from app.routers.correction_requests import (
    submit_correction_request,
    list_my_correction_requests,
)
from app.schemas.correction_request import CorrectionRequestCreate
from app.services.places import create_place_with_default_policy


async def _make_user(db, email: str) -> User:
    u = User(email=email, name="cr-test")
    db.add(u)
    await db.flush()
    return u


async def _make_place(db, name: str):
    return await create_place_with_default_policy(db, {
        "name": name,
        "category": PlaceCategory.CAFE,
        "latitude": 37.5,
        "longitude": 127.0,
        "address": "addr",
    })


async def test_submit_creates_pending_row(db_session):
    user = await _make_user(db_session, "cr-1@test.com")
    place = await _make_place(db_session, "p1")
    payload = CorrectionRequestCreate(
        place_id=place.id,
        request_category=CorrectionRequestCategory.PET_ALLOWED_WRONG,
        description="actually not allowed",
        requested_info={"pet_allowed_status": "not_allowed"},
    )
    result = await submit_correction_request(payload, current_user=user, db=db_session)
    assert result.status == CorrectionRequestStatus.PENDING
    assert result.user_id == user.id
    assert result.place_id == place.id
    assert result.request_category == CorrectionRequestCategory.PET_ALLOWED_WRONG


async def test_submit_404_when_place_unknown(db_session):
    user = await _make_user(db_session, "cr-2@test.com")
    payload = CorrectionRequestCreate(
        place_id=999_999,
        description="x",
    )
    with pytest.raises(HTTPException) as exc:
        await submit_correction_request(payload, current_user=user, db=db_session)
    assert exc.value.status_code == 404


async def test_list_only_returns_own_requests(db_session):
    alice = await _make_user(db_session, "alice@test.com")
    bob = await _make_user(db_session, "bob@test.com")
    place = await _make_place(db_session, "p2")

    # Alice submits two, Bob submits one.
    for desc in ("alice-1", "alice-2"):
        await submit_correction_request(
            CorrectionRequestCreate(place_id=place.id, description=desc),
            current_user=alice, db=db_session,
        )
    await submit_correction_request(
        CorrectionRequestCreate(place_id=place.id, description="bob-1"),
        current_user=bob, db=db_session,
    )

    alice_view = await list_my_correction_requests(
        current_user=alice, db=db_session, status_filter=None, page=1, page_size=20,
    )
    assert alice_view.total == 2
    assert {r.description for r in alice_view.items} == {"alice-1", "alice-2"}

    bob_view = await list_my_correction_requests(
        current_user=bob, db=db_session, status_filter=None, page=1, page_size=20,
    )
    assert bob_view.total == 1
    assert bob_view.items[0].description == "bob-1"


async def test_response_includes_place_mini_projection(db_session):
    """Phase 2D contract: every correction-request response carries the
    embedded `place` object (id + name + category) so the mobile "my
    corrections" list can render the place name without an extra fetch.
    """
    from app.schemas.correction_request import CorrectionRequestResponse

    user = await _make_user(db_session, "place-mini@test.com")
    place = await _make_place(db_session, "place-mini-cafe")
    req = await submit_correction_request(
        CorrectionRequestCreate(place_id=place.id, description="check place mini"),
        current_user=user, db=db_session,
    )

    # The router's submit path runs db.refresh(req, ["place"]); validating
    # through pydantic asserts the projection serialises without an async
    # lazy-load surprise.
    payload = CorrectionRequestResponse.model_validate(req)
    assert payload.place.id == place.id
    assert payload.place.name == "place-mini-cafe"
    assert payload.place.category == place.category

    # Same coverage via the list endpoint.
    listed = await list_my_correction_requests(
        current_user=user, db=db_session,
        status_filter=None, page=1, page_size=20,
    )
    assert len(listed.items) == 1
    assert listed.items[0].place.name == "place-mini-cafe"


async def test_list_status_filter(db_session):
    alice = await _make_user(db_session, "filter@test.com")
    place = await _make_place(db_session, "p3")
    req = await submit_correction_request(
        CorrectionRequestCreate(place_id=place.id, description="x"),
        current_user=alice, db=db_session,
    )

    # Manually flip one to approved so we can verify the filter.
    row = (await db_session.execute(
        select(CorrectionRequest).where(CorrectionRequest.id == req.id)
    )).scalar_one()
    row.status = CorrectionRequestStatus.APPROVED
    await db_session.flush()

    pending = await list_my_correction_requests(
        current_user=alice, db=db_session,
        status_filter=CorrectionRequestStatus.PENDING, page=1, page_size=20,
    )
    assert pending.total == 0
    approved = await list_my_correction_requests(
        current_user=alice, db=db_session,
        status_filter=CorrectionRequestStatus.APPROVED, page=1, page_size=20,
    )
    assert approved.total == 1
