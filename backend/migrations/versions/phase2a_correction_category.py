"""phase2a correction category

Revision ID: phase2a_correction_category
Revises: phase2a_user_role
Create Date: 2026-05-19

- Drops the legacy free-form `request_type` VARCHAR column (no data yet, so
  swapping it for the enum-backed category is cheap and avoids two
  parallel intents living on the same row).
- Adds the `correctionrequestcategory` enum + `request_category` column on
  correction_requests.

Phase 1 enum conventions: PGEnum(create_type=False) + raw-SQL
CREATE/DROP TYPE so add_column and create_table never double-emit.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import ENUM as PGEnum


revision: str = "phase2a_correction_category"
down_revision: Union[str, Sequence[str], None] = "phase2a_user_role"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


correction_category_enum = PGEnum(
    "pet_allowed_wrong",
    "closed_down",
    "address_changed",
    "phone_changed",
    "info_outdated",
    "other",
    name="correctionrequestcategory",
    create_type=False,
)


def upgrade() -> None:
    # 1. Drop the legacy free-form column first (no data exists, safe).
    op.drop_column("correction_requests", "request_type")

    # 2. Create the enum type via raw SQL so add_column never tries to
    #    double-emit CREATE TYPE.
    op.execute(
        "CREATE TYPE correctionrequestcategory AS ENUM ("
        "'pet_allowed_wrong', 'closed_down', 'address_changed', "
        "'phone_changed', 'info_outdated', 'other')"
    )

    # 3. Add the new typed column.
    op.add_column(
        "correction_requests",
        sa.Column(
            "request_category",
            correction_category_enum,
            server_default="other",
            nullable=False,
        ),
    )
    op.create_index(
        "ix_correction_requests_request_category",
        "correction_requests",
        ["request_category"],
    )


def downgrade() -> None:
    op.drop_index(
        "ix_correction_requests_request_category",
        table_name="correction_requests",
    )
    op.drop_column("correction_requests", "request_category")
    op.execute("DROP TYPE IF EXISTS correctionrequestcategory")

    # Restore legacy column so the downgrade round-trips back to the
    # phase2a_user_role schema. The original column was NOT NULL; we bring
    # it back nullable because there is no data to backfill in dev.
    op.add_column(
        "correction_requests",
        sa.Column("request_type", sa.String(length=50), nullable=True),
    )
