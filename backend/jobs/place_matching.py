"""Place matching pipeline — Phase 1 skeleton.

Matches MFDS-imported businesses against Kakao / Naver place candidates and
records the result in `place_matching_jobs`. Scoring is a weighted average of
five criteria (name, road address, distance, phone, category); the resulting
score is banded into one of three statuses.

CLI:
    python -m jobs.place_matching --file tests/fixtures/mfds_sample.csv --dry-run
    python -m jobs.place_matching --file tests/fixtures/mfds_sample.csv

Phase 1 stops short of hitting external APIs — the candidate stream is
provided by `_stub_candidates()` so the bands are exercisable end-to-end.
When the real job ships, swap that stub for actual Kakao/Naver Local API
calls; nothing else in this module should need to change.
"""
from __future__ import annotations

import argparse
import asyncio
import csv
import math
import re
import sys
from dataclasses import dataclass
from difflib import SequenceMatcher
from pathlib import Path
from typing import Iterable

BACKEND_DIR = Path(__file__).resolve().parent.parent
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from sqlalchemy.ext.asyncio import AsyncSession  # noqa: E402

from app.database import engine  # noqa: E402
from app.models.place_matching_job import (  # noqa: E402
    PlaceMatchingJob,
    PlaceMatchingStatus,
)


# ─── Domain types ──────────────────────────────────────────────────────────


@dataclass(frozen=True)
class MfdsRow:
    mfds_id: str
    name: str
    road_address: str | None
    phone: str | None
    latitude: float | None
    longitude: float | None
    category: str | None


@dataclass(frozen=True)
class CandidatePlace:
    source: str  # "kakao" | "naver"
    external_id: str
    name: str
    road_address: str | None
    phone: str | None
    latitude: float | None
    longitude: float | None
    category: str | None


# ─── Scoring ───────────────────────────────────────────────────────────────


# Sum to 1.0; tuned conservatively for Phase 1. Calibrate against real
# Kakao/Naver responses before promoting auto_matched results to ground truth.
WEIGHTS = {
    "name": 0.30,
    "road": 0.25,
    "distance": 0.20,
    "phone": 0.15,
    "category": 0.10,
}


def _name_sim(a: str, b: str) -> float:
    if not a or not b:
        return 0.0
    return SequenceMatcher(None, a, b).ratio()


def _norm_address(s: str | None) -> str | None:
    if not s:
        return None
    return re.sub(r"\s+", " ", s).strip()


def _norm_phone(s: str | None) -> str | None:
    if not s:
        return None
    digits = re.sub(r"\D", "", s)
    return digits or None


def _haversine_m(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    R = 6371000.0
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlmbd = math.radians(lng2 - lng1)
    a = math.sin(dphi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(dlmbd / 2) ** 2
    return 2 * R * math.asin(min(1.0, math.sqrt(a)))


def _distance_score(mfds: MfdsRow, candidate: CandidatePlace) -> float:
    """1.0 within 50 m, linear decay to 0 by 500 m."""
    if mfds.latitude is None or mfds.longitude is None:
        return 0.0
    if candidate.latitude is None or candidate.longitude is None:
        return 0.0
    d = _haversine_m(mfds.latitude, mfds.longitude, candidate.latitude, candidate.longitude)
    if d <= 50:
        return 1.0
    if d >= 500:
        return 0.0
    return 1.0 - (d - 50) / 450


def compute_match_score(mfds: MfdsRow, candidate: CandidatePlace) -> float:
    """Weighted score in [0.0, 1.0]."""
    name_sim = _name_sim(mfds.name, candidate.name)
    road_match = 1.0 if (
        _norm_address(mfds.road_address)
        and _norm_address(mfds.road_address) == _norm_address(candidate.road_address)
    ) else 0.0
    dist = _distance_score(mfds, candidate)
    phone_match = 1.0 if (
        _norm_phone(mfds.phone)
        and _norm_phone(mfds.phone) == _norm_phone(candidate.phone)
    ) else 0.0
    cat_match = 1.0 if (
        mfds.category
        and candidate.category
        and mfds.category.strip().lower() == candidate.category.strip().lower()
    ) else 0.0

    return (
        WEIGHTS["name"] * name_sim
        + WEIGHTS["road"] * road_match
        + WEIGHTS["distance"] * dist
        + WEIGHTS["phone"] * phone_match
        + WEIGHTS["category"] * cat_match
    )


def classify(score: float) -> PlaceMatchingStatus:
    if score >= 0.85:
        return PlaceMatchingStatus.AUTO_MATCHED
    if score >= 0.60:
        return PlaceMatchingStatus.PENDING_REVIEW
    return PlaceMatchingStatus.UNMATCHED


# ─── Candidate sourcing (Phase 1 stub) ─────────────────────────────────────


def _stub_candidates(row: MfdsRow) -> list[CandidatePlace]:
    """Phase 1 stub: emits two synthetic candidates per MFDS row so the
    pipeline can be exercised without external API access. Replace with
    real Kakao/Naver Local API calls when this job goes live.
    """
    kakao = CandidatePlace(
        source="kakao",
        external_id=f"kakao_stub_{row.mfds_id}",
        name=row.name,
        road_address=row.road_address,
        phone=row.phone,
        latitude=row.latitude,
        longitude=row.longitude,
        category=row.category,
    )
    naver = CandidatePlace(
        source="naver",
        external_id=f"naver_stub_{row.mfds_id}",
        name=f"{row.name} 본점",
        road_address=None,
        phone=None,
        latitude=(row.latitude + 0.001) if row.latitude is not None else None,
        longitude=(row.longitude + 0.001) if row.longitude is not None else None,
        category=row.category,
    )
    return [kakao, naver]


# ─── CSV reader ────────────────────────────────────────────────────────────


def _parse_float(raw: str | None) -> float | None:
    if raw in (None, ""):
        return None
    try:
        return float(raw)
    except ValueError:
        return None


def parse_mfds_csv(path: Path) -> Iterable[MfdsRow]:
    with path.open("r", encoding="utf-8") as fh:
        for row in csv.DictReader(fh):
            mfds_id = (row.get("mfds_id") or "").strip()
            name = (row.get("name") or "").strip()
            if not mfds_id or not name:
                # Caller counts these as parse errors via the returned None.
                yield None  # type: ignore[misc]
                continue
            yield MfdsRow(
                mfds_id=mfds_id,
                name=name,
                road_address=row.get("road_address") or None,
                phone=row.get("phone") or None,
                latitude=_parse_float(row.get("latitude")),
                longitude=_parse_float(row.get("longitude")),
                category=row.get("category") or None,
            )


# ─── Pipeline ──────────────────────────────────────────────────────────────


async def process(rows: Iterable[MfdsRow | None], *, dry_run: bool) -> dict[str, int]:
    stats = {
        "auto_matched": 0,
        "pending_review": 0,
        "unmatched": 0,
        "parse_error": 0,
    }
    decisions: list[tuple[MfdsRow, CandidatePlace | None, float, PlaceMatchingStatus]] = []

    for row in rows:
        if row is None:
            stats["parse_error"] += 1
            continue
        candidates = _stub_candidates(row)
        if not candidates:
            stats["unmatched"] += 1
            decisions.append((row, None, 0.0, PlaceMatchingStatus.UNMATCHED))
            continue
        scored = [(c, compute_match_score(row, c)) for c in candidates]
        best_candidate, best_score = max(scored, key=lambda t: t[1])
        status = classify(best_score)
        stats[status.value] += 1
        decisions.append((row, best_candidate, best_score, status))

    if dry_run:
        return stats

    async with AsyncSession(engine, expire_on_commit=False) as session:
        async with session.begin():
            for mfds, candidate, score, status in decisions:
                kakao_id = candidate.external_id if candidate and candidate.source == "kakao" else None
                naver_id = candidate.external_id if candidate and candidate.source == "naver" else None
                session.add(PlaceMatchingJob(
                    place_id=None,  # filled in once a Place is reconciled
                    mfds_id=mfds.mfds_id,
                    kakao_id=kakao_id,
                    naver_id=naver_id,
                    match_score=round(score, 4),
                    status=status,
                ))
    return stats


# ─── CLI ───────────────────────────────────────────────────────────────────


def main() -> int:
    parser = argparse.ArgumentParser(description="Match MFDS rows against candidate places.")
    parser.add_argument("--file", required=True, type=Path,
                        help="MFDS CSV file (same schema as mfds_import).")
    parser.add_argument("--dry-run", action="store_true",
                        help="Score only; do not write to place_matching_jobs.")
    args = parser.parse_args()

    if not args.file.exists():
        print(f"file not found: {args.file}", file=sys.stderr)
        return 2
    if args.file.suffix.lower() != ".csv":
        print(f"unsupported format: {args.file.suffix}", file=sys.stderr)
        return 2

    stats = asyncio.run(process(parse_mfds_csv(args.file), dry_run=args.dry_run))
    mode = "DRY-RUN" if args.dry_run else "WRITE"
    print(
        f"[{mode}] auto_matched={stats['auto_matched']} "
        f"pending_review={stats['pending_review']} "
        f"unmatched={stats['unmatched']} parse_error={stats['parse_error']}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
