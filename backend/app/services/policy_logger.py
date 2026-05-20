"""pet_policies mutation helper + automatic policy_change_logs writer.

Phase 2A-7 invariant: **every pet_policies write goes through
`update_pet_policy_with_logging`**. The helper diffs old vs new on the
whitelisted columns and emits one PolicyChangeLog row per actually-changed
field inside the same transaction.

Direct `policy.field = value` mutations are forbidden in new code; the
existing trust_engine and admin-correction-request paths route through
this helper. Adding new mutation paths without this helper will silently
break the audit trail.

`changed_by` convention (string, NOT NULL):
    "admin:{user_id}"          — admin role user (PATCH approve)
    "user:{user_id}"           — non-admin user (owner direct edits, Phase 4)
    "system:trust_engine"      — apply_trust_evaluation()
    "system:mfds_import"       — MFDS import job
    "system:{job_name}"        — other system jobs

`reason` is free-form text. Common patterns:
    f"correction_request:{request_id}"
    "auto_reevaluation"
    f"mfds_import:{batch_id}"
"""
from __future__ import annotations

from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.pet_policy import PetPolicy
from app.models.policy_change_log import PolicyChangeLog


# Every column write that should be audited. verification_status is in here
# because the trust engine flips it via this helper. The admin route uses a
# different (stricter) whitelist so admins can't bypass the trust engine.
_LOGGABLE_FIELDS: frozenset[str] = frozenset({
    "pet_allowed_status",
    "verification_status",
    "indoor_allowed",
    "outdoor_allowed",
    "dog_allowed",
    "cat_allowed",
    "max_weight_kg",
    "leash_required",
    "carrier_required",
    "vaccination_required",
    "notes",
    "policy_source",
    "confidence_score",
})


def _stringify(value: Any) -> str | None:
    if value is None:
        return None
    # Enum members already stringify to "ClassName.MEMBER"; prefer the .value
    # form so the log is queryable as plain text.
    inner = getattr(value, "value", value)
    return str(inner)


async def update_pet_policy_with_logging(
    db: AsyncSession,
    place_id: int,
    *,
    changes: dict[str, Any],
    changed_by: str,
    reason: str | None = None,
) -> PetPolicy:
    """Apply `changes` to pet_policies.<place_id> and emit one
    policy_change_logs row per actually-changed loggable field.

    - Fields outside `_LOGGABLE_FIELDS` are silently ignored (callers are
      responsible for their own input validation before they get here).
    - A change whose new value equals the existing value is a no-op (no
      log row).
    - All inserts/updates happen on the caller's session inside the
      caller's transaction; the helper only calls `db.flush()` at the end.
    """
    policy = (await db.execute(
        select(PetPolicy).where(PetPolicy.place_id == place_id)
    )).scalar_one_or_none()
    if policy is None:
        raise ValueError(
            f"pet_policies row missing for place_id={place_id}; "
            "create_place_with_default_policy invariant was violated."
        )

    for field, new_value in changes.items():
        if field not in _LOGGABLE_FIELDS:
            continue
        old_value = getattr(policy, field)
        if old_value == new_value:
            continue
        db.add(PolicyChangeLog(
            place_id=place_id,
            field_name=field,
            before_value=_stringify(old_value),
            after_value=_stringify(new_value),
            changed_by=changed_by,
            reason=reason,
        ))
        setattr(policy, field, new_value)

    await db.flush()
    return policy
