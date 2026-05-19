"""phase2a user role

Revision ID: phase2a_user_role
Revises: phase1_schema_overhaul
Create Date: 2026-05-19

Adds the `userrole` enum + `users.role` column. Follows the Phase 1 pattern:
- create_type=False on the PGEnum, with explicit raw-SQL CREATE/DROP TYPE
- lowercase enum values to match the values_callable on the model side
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import ENUM as PGEnum


revision: str = "phase2a_user_role"
down_revision: Union[str, Sequence[str], None] = "phase1_schema_overhaul"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


user_role_enum = PGEnum(
    "user", "admin", name="userrole", create_type=False,
)


def upgrade() -> None:
    op.execute("CREATE TYPE userrole AS ENUM ('user', 'admin')")
    op.add_column(
        "users",
        sa.Column(
            "role",
            user_role_enum,
            server_default="user",
            nullable=False,
        ),
    )
    op.create_index("ix_users_role", "users", ["role"])


def downgrade() -> None:
    op.drop_index("ix_users_role", table_name="users")
    op.drop_column("users", "role")
    op.execute("DROP TYPE IF EXISTS userrole")
