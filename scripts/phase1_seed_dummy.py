"""Phase 1 dummy seed — exact 15-row mix from spec section 3-1.

Inserts 15 places via create_place_with_default_policy() (the only sanctioned
Place creation path in Phase 1+), then updates each auto-created pet_policy
to the target (verification, pet_allowed) combo for that case.

Run from the project root:
    cd backend && source .venv/bin/activate && set -a && source .env && set +a
    python ../scripts/phase1_seed_dummy.py

Expected after seeding:
    SELECT COUNT(*) FROM places         -> 15
    SELECT COUNT(*) FROM pet_policies   -> 15
    GET /places/nearby  (default)       -> 7  rows (cases 1+2+3)
    GET /places/nearby  include_unverified=true  -> 10 rows (cases 1+2+3+4+6)
"""
import asyncio
import sys
from pathlib import Path

# Make `app.*` importable when invoked from project root.
BACKEND_DIR = Path(__file__).resolve().parent.parent / "backend"
sys.path.insert(0, str(BACKEND_DIR))

from sqlalchemy import select  # noqa: E402
from sqlalchemy.ext.asyncio import AsyncSession  # noqa: E402

from app.database import engine  # noqa: E402
from app.models.place import PlaceCategory, VisibilityStatus  # noqa: E402
from app.models.pet_policy import (  # noqa: E402
    PetPolicy,
    PetAllowedStatus,
    VerificationStatus,
)
from app.services.places import create_place_with_default_policy  # noqa: E402


# Spread dummy lat/lng over a ~1km square around Seoul City Hall so each row
# is distinguishable and the distance filter (radius_km=50) trivially passes.
_BASE_LAT = 37.5665
_BASE_LNG = 126.9780


# (count, label, verification, pet_allowed, category, visibility, display_name)
DUMMY_CASES = [
    (3, "1", VerificationStatus.OFFICIAL_VERIFIED, PetAllowedStatus.ALLOWED,
     PlaceCategory.RESTAURANT, VisibilityStatus.VISIBLE,
     "Restaurant Official Allowed"),
    (2, "2", VerificationStatus.OWNER_VERIFIED, PetAllowedStatus.LIMITED,
     PlaceCategory.CAFE, VisibilityStatus.VISIBLE,
     "Cafe Owner Limited"),
    (2, "3", VerificationStatus.ADMIN_VERIFIED, PetAllowedStatus.ALLOWED,
     PlaceCategory.RESTAURANT, VisibilityStatus.VISIBLE,
     "Restaurant Admin Allowed"),
    (2, "4", VerificationStatus.USER_REPORTED, PetAllowedStatus.ALLOWED,
     PlaceCategory.CAFE, VisibilityStatus.VISIBLE,
     "Cafe UserReported Allowed"),
    (2, "5", VerificationStatus.UNKNOWN, PetAllowedStatus.UNKNOWN,
     PlaceCategory.RESTAURANT, VisibilityStatus.VISIBLE,
     "Restaurant Unknown Unknown"),
    (1, "6", VerificationStatus.UNDER_REVIEW, PetAllowedStatus.LIMITED,
     PlaceCategory.CAFE, VisibilityStatus.VISIBLE,
     "Cafe UnderReview Limited"),
    (1, "7", VerificationStatus.OFFICIAL_VERIFIED, PetAllowedStatus.NOT_ALLOWED,
     PlaceCategory.RESTAURANT, VisibilityStatus.VISIBLE,
     "Restaurant Official NotAllowed"),
    (1, "8", VerificationStatus.OFFICIAL_VERIFIED, PetAllowedStatus.ALLOWED,
     PlaceCategory.PARK, VisibilityStatus.VISIBLE,
     "Park Official Allowed"),
    (1, "9", VerificationStatus.OFFICIAL_VERIFIED, PetAllowedStatus.ALLOWED,
     PlaceCategory.RESTAURANT, VisibilityStatus.HIDDEN,
     "Restaurant Official Allowed Hidden"),
]


async def seed(session: AsyncSession) -> int:
    serial = 0
    for count, label, verification, pet_allowed, category, visibility, display in DUMMY_CASES:
        for i in range(count):
            serial += 1
            # Small offset per row keeps coordinates distinct without leaving
            # central Seoul. 0.0008° ≈ ~80m.
            lat = _BASE_LAT + (serial * 0.0008)
            lng = _BASE_LNG + (serial * 0.0008)
            place = await create_place_with_default_policy(session, {
                "name": f"[Phase1 Test] {display} {i + 1}",
                "category": category,
                "latitude": lat,
                "longitude": lng,
                "address": f"[Phase1 Test] case{label} dummy addr {serial}",
                "visibility_status": visibility,
            })
            policy = (await session.execute(
                select(PetPolicy).where(PetPolicy.place_id == place.id)
            )).scalar_one()
            policy.pet_allowed_status = pet_allowed
            policy.verification_status = verification
            await session.flush()
    return serial


async def main() -> None:
    async with AsyncSession(engine, expire_on_commit=False) as session:
        async with session.begin():
            count = await seed(session)
    print(f"Inserted {count} dummy places (with 1:1 pet_policies).")


if __name__ == "__main__":
    asyncio.run(main())
