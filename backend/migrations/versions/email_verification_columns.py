"""email verification columns

Revision ID: email_verification_columns
Revises: 02a7ba243f99
Create Date: 2026-06-19

Adds short-lived email-verification state to users:
  - verification_code (one-time code; 6-10 chars)
  - verification_code_expires_at (UTC; null when no active code)
  - verification_attempts (lockout counter; non-null default 0)
  - last_verification_sent_at (rate-limit floor for resend; null when never sent)

`is_verified` already exists on the model (default false). To prevent the
new verification gate from locking out users created before this migration,
the upgrade sets is_verified = true for every existing row.

The downgrade only drops the four new columns; it does NOT revert the
is_verified backfill (those users are already "verified" in spirit by
having predated the feature, so leaving the flag set on rollback is the
honest state).
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "email_verification_columns"
down_revision: Union[str, Sequence[str], None] = "02a7ba243f99"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column("verification_code", sa.String(length=10), nullable=True),
    )
    op.add_column(
        "users",
        sa.Column(
            "verification_code_expires_at",
            sa.DateTime(timezone=True),
            nullable=True,
        ),
    )
    op.add_column(
        "users",
        sa.Column(
            "verification_attempts",
            sa.Integer(),
            server_default="0",
            nullable=False,
        ),
    )
    op.add_column(
        "users",
        sa.Column(
            "last_verification_sent_at",
            sa.DateTime(timezone=True),
            nullable=True,
        ),
    )

    # Grandfather existing accounts: anyone who registered before this
    # column existed gets is_verified flipped to true in the same
    # transaction so the new gate cannot lock them out.
    op.execute("UPDATE users SET is_verified = true")


def downgrade() -> None:
    op.drop_column("users", "last_verification_sent_at")
    op.drop_column("users", "verification_attempts")
    op.drop_column("users", "verification_code_expires_at")
    op.drop_column("users", "verification_code")
