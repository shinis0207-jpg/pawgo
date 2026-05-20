"""Verification-status decision engine.

Pure-evaluation helper + an apply-helper that writes the result back into
pet_policies. Per Phase 2A plan, this is called explicitly from any code
path that mutates the inputs (admin approve, future MFDS import, future
owner_claim verification). No SQLAlchemy event listeners — same pattern
as the Phase 1 create_place_with_default_policy helper.

Priority (high → low):
  1. official_verified  — places.official_mfds_id IS NOT NULL
                           OR pet_policies.policy_source = 'mfds'
  2. owner_verified     — owner_claims row with verification_status='verified'
  3. admin_verified     — most-recent policy_change_logs entry for the place
                           was made by an admin user (changed_by='admin:N')
  4. user_reported      — 3+ approved correction_requests for this place
                           within the last 90 days. SUPPLEMENTARY: this band
                           only wins when priorities 1/2/3 are all absent.
  5. unknown            — none of the above

Conflict detection → under_review:
  A. priority 1 says pet_allowed='allowed', but 3+ APPROVED user reports
     in the last 90 days requested pet_allowed='not_allowed'.
  B. priority 1 (MFDS) and priority 2 (owner_verified) disagree on
     pet_allowed_status. NOTE: Phase 2A's data model holds a single
     pet_policies row per place, so "MFDS-says-X vs owner-says-Y" cannot
     be represented today. The check is wired in for Phase 4 when
     owner_claims grows its own pet_allowed signal; right now it is a
     no-op in practice.
  C. priorities 1/2 absent but admin_verified is in play AND there are
     3+ recent user reports requesting the opposite pet_allowed value.
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.correction_request import CorrectionRequest, CorrectionRequestStatus
from app.models.owner_claim import OwnerClaim, OwnerClaimStatus
from app.models.pet_policy import (
    PetPolicy,
    PetAllowedStatus,
    PolicySource,
    VerificationStatus,
)
from app.models.place import Place
from app.models.policy_change_log import PolicyChangeLog


USER_REPORT_WINDOW_DAYS = 90
USER_REPORT_THRESHOLD = 3


async def _get_place_and_policy(
    db: AsyncSession, place_id: int
) -> tuple[Place | None, PetPolicy | None]:
    place = (await db.execute(
        select(Place).where(Place.id == place_id)
    )).scalar_one_or_none()
    policy = (await db.execute(
        select(PetPolicy).where(PetPolicy.place_id == place_id)
    )).scalar_one_or_none()
    return place, policy


def _has_mfds_signal(place: Place | None, policy: PetPolicy | None) -> bool:
    if place and place.official_mfds_id:
        return True
    if policy and policy.policy_source == PolicySource.MFDS:
        return True
    return False


async def _has_owner_signal(db: AsyncSession, place_id: int) -> bool:
    row = (await db.execute(
        select(OwnerClaim.id).where(
            OwnerClaim.place_id == place_id,
            OwnerClaim.verification_status == OwnerClaimStatus.VERIFIED,
        ).limit(1)
    )).first()
    return row is not None


async def _has_admin_change_signal(db: AsyncSession, place_id: int) -> bool:
    """The most-recent policy_change_logs row for this place must be by
    an admin (changed_by starts with 'admin:'). Phase 2A-7 fills the
    logs; this engine only reads them.
    """
    row = (await db.execute(
        select(PolicyChangeLog.changed_by)
        .where(PolicyChangeLog.place_id == place_id)
        .order_by(PolicyChangeLog.created_at.desc())
        .limit(1)
    )).scalar_one_or_none()
    return bool(row and row.startswith("admin:"))


async def _count_recent_approved_reports(
    db: AsyncSession, place_id: int
) -> int:
    cutoff = datetime.now(timezone.utc) - timedelta(days=USER_REPORT_WINDOW_DAYS)
    return (await db.execute(
        select(func.count(CorrectionRequest.id)).where(
            CorrectionRequest.place_id == place_id,
            CorrectionRequest.status == CorrectionRequestStatus.APPROVED,
            CorrectionRequest.resolved_at >= cutoff,
        )
    )).scalar_one()


async def _count_recent_reports_requesting_pet_allowed(
    db: AsyncSession, place_id: int, pet_allowed_value: PetAllowedStatus
) -> int:
    """Count APPROVED reports within the window whose requested_info
    says pet_allowed_status == <pet_allowed_value>. requested_info is JSON
    so we filter in Python after pulling the (small) candidate set.
    """
    cutoff = datetime.now(timezone.utc) - timedelta(days=USER_REPORT_WINDOW_DAYS)
    rows = (await db.execute(
        select(CorrectionRequest).where(
            CorrectionRequest.place_id == place_id,
            CorrectionRequest.status == CorrectionRequestStatus.APPROVED,
            CorrectionRequest.resolved_at >= cutoff,
        )
    )).scalars().all()
    target = pet_allowed_value.value
    return sum(
        1 for r in rows
        if isinstance(r.requested_info, dict)
        and r.requested_info.get("pet_allowed_status") == target
    )


async def evaluate_verification_status(
    db: AsyncSession, place_id: int
) -> VerificationStatus:
    """Pure evaluation — does not mutate the DB. See module docstring for
    the priority cascade and conflict rules.
    """
    place, policy = await _get_place_and_policy(db, place_id)

    is_mfds = _has_mfds_signal(place, policy)
    is_owner = await _has_owner_signal(db, place_id)
    is_admin_change = await _has_admin_change_signal(db, place_id)
    user_report_count = await _count_recent_approved_reports(db, place_id)

    # Conflict B — wired in for Phase 4. Today MFDS and owner share the
    # same pet_policies row so this disagreement cannot be observed; the
    # branch stays here so the rule is documented in code.
    if is_mfds and is_owner and policy is not None:
        # Placeholder: when owner_claims carries an independent
        # pet_allowed signal, compare it against policy.pet_allowed_status
        # here and return UNDER_REVIEW on mismatch.
        pass

    # Conflict A — MFDS-allowed contradicted by recent not_allowed reports.
    if is_mfds and policy is not None and policy.pet_allowed_status == PetAllowedStatus.ALLOWED:
        opposing = await _count_recent_reports_requesting_pet_allowed(
            db, place_id, PetAllowedStatus.NOT_ALLOWED
        )
        if opposing >= USER_REPORT_THRESHOLD:
            return VerificationStatus.UNDER_REVIEW

    # Priority cascade.
    if is_mfds:
        return VerificationStatus.OFFICIAL_VERIFIED
    if is_owner:
        return VerificationStatus.OWNER_VERIFIED
    if is_admin_change:
        # Conflict C — admin verdict vs. an organised user contradiction.
        if policy is not None and policy.pet_allowed_status in (
            PetAllowedStatus.ALLOWED, PetAllowedStatus.NOT_ALLOWED
        ):
            opposite = (
                PetAllowedStatus.NOT_ALLOWED
                if policy.pet_allowed_status == PetAllowedStatus.ALLOWED
                else PetAllowedStatus.ALLOWED
            )
            opposing = await _count_recent_reports_requesting_pet_allowed(
                db, place_id, opposite
            )
            if opposing >= USER_REPORT_THRESHOLD:
                return VerificationStatus.UNDER_REVIEW
        return VerificationStatus.ADMIN_VERIFIED
    if user_report_count >= USER_REPORT_THRESHOLD:
        return VerificationStatus.USER_REPORTED

    return VerificationStatus.UNKNOWN


async def apply_trust_evaluation(
    db: AsyncSession, place_id: int
) -> VerificationStatus:
    """Compute the verification status AND write it onto pet_policies
    if it changed. Returns the new (or unchanged) value.

    The Phase 2A integration contract: every code path that mutates
    pet_policies / correction_requests / owner_claims / policy_change_logs
    for a given place_id calls this helper before its outer transaction
    commits, so the trust band reflects the new inputs immediately.

    The actual write goes through update_pet_policy_with_logging so the
    verification_status flip is audited just like any other field change.
    """
    # Local import avoids a circular pulled by policy_logger's downstream
    # dependence on trust_engine in some future tests.
    from app.services.policy_logger import update_pet_policy_with_logging

    new_status = await evaluate_verification_status(db, place_id)
    policy = (await db.execute(
        select(PetPolicy).where(PetPolicy.place_id == place_id)
    )).scalar_one_or_none()
    if policy is not None and policy.verification_status != new_status:
        await update_pet_policy_with_logging(
            db, place_id,
            changes={"verification_status": new_status},
            changed_by="system:trust_engine",
            reason="auto_reevaluation",
        )
    return new_status
