"""PATCH /admin/places/{id} category edits + related cache invalidation.

Follows the existing db_session-fixture, direct-router-call style used in
test_correction_request_admin.py — no TestClient, no httpx. The cache
helper is monkeypatched at the router module's local binding so tests can
observe the exact glob patterns invoked, without hitting Redis.
"""
import pytest
from pydantic import ValidationError
from sqlalchemy import select

from app.models.place import Place, PlaceCategory
from app.models.user import User, UserRole
from app.routers import admin_categories, admin_places
from app.routers.admin_categories import admin_replace_place_categories
from app.routers.admin_places import admin_update_place
from app.schemas.place import (
    PlaceAdminPatchRequest,
    PlaceCategoriesReplaceRequest,
)
from app.services.places import create_place_with_default_policy


async def _admin(db) -> User:
    u = User(email="admin-cat@test.com", name="admin", role=UserRole.ADMIN)
    db.add(u)
    await db.flush()
    return u


async def _place(
    db, name: str, category: PlaceCategory = PlaceCategory.RESTAURANT,
) -> Place:
    return await create_place_with_default_policy(db, {
        "name": name,
        "category": category,
        "latitude": 37.5,
        "longitude": 127.0,
        "address": "addr",
    })


class _CacheRecorder:
    """Stand-in for cache_delete_pattern that records every glob passed
    to it, in call order, so assertions can compare against an exact list.
    Async-callable — matches the real helper's signature."""

    def __init__(self) -> None:
        self.calls: list[str] = []

    async def __call__(self, pattern: str) -> None:
        self.calls.append(pattern)


@pytest.fixture
def cache_admin_places(monkeypatch):
    rec = _CacheRecorder()
    # Patch the name AS IMPORTED into the router module, not the
    # services.cache module — from-imports create a fresh local binding
    # and only that binding is looked up when the router calls the helper.
    monkeypatch.setattr(admin_places, "cache_delete_pattern", rec)
    return rec


@pytest.fixture
def cache_admin_categories(monkeypatch):
    rec = _CacheRecorder()
    monkeypatch.setattr(admin_categories, "cache_delete_pattern", rec)
    return rec


# ─── PlaceAdminPatchRequest schema — category validation ─────────────────


def test_schema_accepts_restaurant():
    body = PlaceAdminPatchRequest(category="restaurant")
    assert body.category is PlaceCategory.RESTAURANT


def test_schema_accepts_cafe():
    body = PlaceAdminPatchRequest(category="cafe")
    assert body.category is PlaceCategory.CAFE


def test_schema_omitting_category_leaves_it_unset():
    # exclude_unset=True is how the router keys off "was this field
    # actually supplied" — this test guards the contract that letting
    # the field default keeps it out of the setattr loop entirely.
    body = PlaceAdminPatchRequest(name="only-name")
    assert "category" not in body.model_dump(exclude_unset=True)


def test_schema_rejects_null_category():
    with pytest.raises(ValidationError):
        PlaceAdminPatchRequest(category=None)


def test_schema_rejects_empty_string_category():
    with pytest.raises(ValidationError):
        PlaceAdminPatchRequest(category="")


def test_schema_rejects_park_even_though_enum_member():
    # park is a valid PlaceCategory member but is not writable via this
    # admin path — only the two map-display values are allowed.
    with pytest.raises(ValidationError):
        PlaceAdminPatchRequest(category="park")


def test_schema_rejects_unknown_string():
    with pytest.raises(ValidationError):
        PlaceAdminPatchRequest(category="bar_hof")


# ─── admin_update_place — scalar update ──────────────────────────────────


async def test_category_restaurant_to_cafe_updates_scalar(
    db_session, cache_admin_places,
):
    admin = await _admin(db_session)
    place = await _place(db_session, "flip-r-to-c", PlaceCategory.RESTAURANT)

    body = PlaceAdminPatchRequest(category=PlaceCategory.CAFE)
    resp = await admin_update_place(
        place_id=place.id, data=body, admin=admin, db=db_session,
    )
    assert resp["category"] is PlaceCategory.CAFE
    fresh = (await db_session.execute(
        select(Place.category).where(Place.id == place.id)
    )).scalar_one()
    assert fresh is PlaceCategory.CAFE


async def test_category_cafe_to_restaurant_updates_scalar(
    db_session, cache_admin_places,
):
    admin = await _admin(db_session)
    place = await _place(db_session, "flip-c-to-r", PlaceCategory.CAFE)

    body = PlaceAdminPatchRequest(category=PlaceCategory.RESTAURANT)
    await admin_update_place(
        place_id=place.id, data=body, admin=admin, db=db_session,
    )
    fresh = (await db_session.execute(
        select(Place.category).where(Place.id == place.id)
    )).scalar_one()
    assert fresh is PlaceCategory.RESTAURANT


async def test_omitting_category_keeps_current_value(
    db_session, cache_admin_places,
):
    admin = await _admin(db_session)
    place = await _place(db_session, "keep-cat", PlaceCategory.RESTAURANT)

    # Body carries a name change but no category — Place.category must
    # not move.
    body = PlaceAdminPatchRequest(name="renamed-keep")
    await admin_update_place(
        place_id=place.id, data=body, admin=admin, db=db_session,
    )
    fresh = (await db_session.execute(
        select(Place.category).where(Place.id == place.id)
    )).scalar_one()
    assert fresh is PlaceCategory.RESTAURANT


# ─── admin_update_place — cache invalidation ─────────────────────────────


async def test_category_edit_invalidates_detail_and_nearby(
    db_session, cache_admin_places,
):
    admin = await _admin(db_session)
    place = await _place(db_session, "cache-cat", PlaceCategory.RESTAURANT)

    body = PlaceAdminPatchRequest(category=PlaceCategory.CAFE)
    await admin_update_place(
        place_id=place.id, data=body, admin=admin, db=db_session,
    )
    assert cache_admin_places.calls == [
        f"place:{place.id}:*",
        "places:nearby:*",
    ]


async def test_name_only_edit_leaves_nearby_cache_alone(
    db_session, cache_admin_places,
):
    """Pre-existing behavior — non-category edits don't blow the whole
    /places/nearby family. Guard-test so a future refactor doesn't
    silently start invalidating list caches on every name change.
    """
    admin = await _admin(db_session)
    place = await _place(db_session, "cache-name", PlaceCategory.RESTAURANT)

    body = PlaceAdminPatchRequest(name="renamed-cache")
    await admin_update_place(
        place_id=place.id, data=body, admin=admin, db=db_session,
    )
    assert cache_admin_places.calls == [f"place:{place.id}:*"]


# ─── admin_replace_place_categories — cache invalidation ─────────────────


async def test_replace_categories_invalidates_detail_and_nearby(
    db_session, cache_admin_categories,
):
    admin = await _admin(db_session)
    place = await _place(db_session, "cache-tags", PlaceCategory.CAFE)

    body = PlaceCategoriesReplaceRequest(codes=[])
    await admin_replace_place_categories(
        place_id=place.id, data=body, admin=admin, db=db_session,
    )
    assert cache_admin_categories.calls == [
        f"place:{place.id}:*",
        "places:nearby:*",
    ]
