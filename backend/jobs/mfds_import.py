"""MFDS (식약처) place import — Phase 1 skeleton.

CLI:
    python -m jobs.mfds_import --file tests/fixtures/mfds_sample.csv --dry-run
    python -m jobs.mfds_import --file tests/fixtures/mfds_sample.csv

Reads a CSV of MFDS-sourced businesses, normalizes name/address/phone, and
either reports projected counts (--dry-run) or inserts new rows via the
sanctioned services/places.create_place_with_default_policy() helper so each
Place lands with a default pet_policies row whose policy_source is set to
'mfds'. Duplicate detection keys off official_mfds_id.

This is a skeleton: it parses CSV well enough to drive the round-trip and
emit honest stats, but the official_mfds_id taxonomy, MFDS column names,
and category mapping will be refined when the real dataset arrives.
"""
from __future__ import annotations

import argparse
import asyncio
import csv
import re
import sys
from pathlib import Path
from typing import Iterable

# Make `app.*` importable whether invoked as a script or via `python -m`.
BACKEND_DIR = Path(__file__).resolve().parent.parent
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from sqlalchemy import select  # noqa: E402
from sqlalchemy.ext.asyncio import AsyncSession  # noqa: E402

from app.database import engine  # noqa: E402
from app.models.place import Place, PlaceCategory  # noqa: E402
from app.models.pet_policy import PetPolicy, PolicySource  # noqa: E402
from app.services.places import create_place_with_default_policy  # noqa: E402


# ─── Normalizers ────────────────────────────────────────────────────────────


def normalize_name(raw: str | None) -> str | None:
    if not raw:
        return None
    cleaned = re.sub(r"\s+", " ", raw).strip()
    return cleaned or None


def normalize_address(raw: str | None) -> str | None:
    if not raw:
        return None
    cleaned = re.sub(r"\s+", " ", raw).strip()
    return cleaned or None


def normalize_phone(raw: str | None) -> str | None:
    """Strip everything except digits and reformat into hyphen form.
    Returns None when the input has no digits at all.
    """
    if not raw:
        return None
    digits = re.sub(r"\D", "", raw)
    if not digits:
        return None
    if digits.startswith("02") and len(digits) in (9, 10):
        return f"{digits[:2]}-{digits[2:-4]}-{digits[-4:]}"
    if len(digits) in (10, 11):
        return f"{digits[:-8]}-{digits[-8:-4]}-{digits[-4:]}"
    return digits


def _parse_category(raw: str | None) -> PlaceCategory:
    """Phase 1 only consumes restaurant / cafe rows; anything else falls
    back to RESTAURANT so the row still lands behind the visibility=visible
    + verification filter combo. Refine when MFDS classification codes are
    finalised.
    """
    val = (raw or "").strip().lower()
    if val == "cafe":
        return PlaceCategory.CAFE
    return PlaceCategory.RESTAURANT


def _parse_float(raw: str | None) -> float | None:
    if raw in (None, ""):
        return None
    try:
        return float(raw)
    except ValueError:
        return None


# ─── CSV reader ─────────────────────────────────────────────────────────────


def parse_csv(path: Path) -> list[dict]:
    with path.open("r", encoding="utf-8") as fh:
        return list(csv.DictReader(fh))


# ─── Core import ────────────────────────────────────────────────────────────


async def _load_existing_mfds_ids(session: AsyncSession) -> set[str]:
    rows = (await session.execute(
        select(Place.official_mfds_id).where(Place.official_mfds_id.isnot(None))
    )).all()
    return {r[0] for r in rows}


async def import_rows(rows: Iterable[dict], *, dry_run: bool) -> dict[str, int]:
    """Parse and (optionally) insert MFDS rows.

    A row is considered parseable iff it has a non-empty mfds_id, name,
    and address after normalization. Rows without lat/lng default to 0/0
    which is intentional for the skeleton — real MFDS rows will carry
    coordinates and Phase1-11 will reconcile any missing ones via the
    place-matching pipeline.
    """
    stats = {"inserted": 0, "duplicate": 0, "parse_error": 0}
    parsed: list[dict] = []

    for row in rows:
        try:
            mfds_id = (row.get("mfds_id") or "").strip()
            name = normalize_name(row.get("name"))
            addr = normalize_address(row.get("address"))
            if not (mfds_id and name and addr):
                stats["parse_error"] += 1
                continue
            parsed.append({
                "mfds_id": mfds_id,
                "name": name,
                "address": addr,
                "road_address": normalize_address(row.get("road_address")),
                "phone": normalize_phone(row.get("phone")),
                "latitude": _parse_float(row.get("latitude")) or 0.0,
                "longitude": _parse_float(row.get("longitude")) or 0.0,
                "category": _parse_category(row.get("category")),
            })
        except Exception:
            stats["parse_error"] += 1

    if dry_run:
        # No DB connection in dry-run — duplicate detection is best-effort
        # against the in-memory batch only.
        seen: set[str] = set()
        for p in parsed:
            if p["mfds_id"] in seen:
                stats["duplicate"] += 1
            else:
                seen.add(p["mfds_id"])
                stats["inserted"] += 1
        return stats

    async with AsyncSession(engine, expire_on_commit=False) as session:
        async with session.begin():
            seen = await _load_existing_mfds_ids(session)
            for p in parsed:
                if p["mfds_id"] in seen:
                    stats["duplicate"] += 1
                    continue
                place = await create_place_with_default_policy(session, {
                    "name": p["name"],
                    "category": p["category"],
                    "latitude": p["latitude"],
                    "longitude": p["longitude"],
                    "address": p["address"],
                    "road_address": p["road_address"],
                    "phone": p["phone"],
                    "official_mfds_id": p["mfds_id"],
                })
                # Mark the auto-created policy as MFDS-sourced. Phase1-11
                # place-matching can later promote verification_status.
                policy = (await session.execute(
                    select(PetPolicy).where(PetPolicy.place_id == place.id)
                )).scalar_one()
                policy.policy_source = PolicySource.MFDS
                await session.flush()
                seen.add(p["mfds_id"])
                stats["inserted"] += 1
    return stats


# ─── CLI ────────────────────────────────────────────────────────────────────


def main() -> int:
    parser = argparse.ArgumentParser(description="Import MFDS place data.")
    parser.add_argument(
        "--file", required=True, type=Path,
        help="Path to MFDS CSV. JSON support is planned; Phase 1 is CSV only.",
    )
    parser.add_argument(
        "--dry-run", action="store_true",
        help="Parse only; report would-be insert/duplicate/parse_error counts.",
    )
    args = parser.parse_args()

    if not args.file.exists():
        print(f"file not found: {args.file}", file=sys.stderr)
        return 2
    if args.file.suffix.lower() != ".csv":
        print(f"unsupported format: {args.file.suffix} (Phase 1 is CSV only)",
              file=sys.stderr)
        return 2

    rows = parse_csv(args.file)
    stats = asyncio.run(import_rows(rows, dry_run=args.dry_run))
    mode = "DRY-RUN" if args.dry_run else "WRITE"
    print(
        f"[{mode}] inserted={stats['inserted']} "
        f"duplicate={stats['duplicate']} parse_error={stats['parse_error']}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
