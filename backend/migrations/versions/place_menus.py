"""place menus table

Revision ID: place_menus
Revises: place_categories_multitag
Create Date: 2026-08-16

Creates `place_menus` for the admin-managed menu list on the place-detail
screen. Deliberately 1:N (no unique on place_id) so a place can carry
many menu items. `image_url` column is provisioned now so the later
photo-upload feature does not need another migration.

Downgrade drops both the table and the FK index it creates.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "place_menus"
down_revision: Union[str, Sequence[str], None] = "place_categories_multitag"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "place_menus",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "place_id",
            sa.Integer(),
            sa.ForeignKey("places.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("name", sa.String(length=100), nullable=False),
        sa.Column("price", sa.Integer(), nullable=True),
        sa.Column(
            "is_signature",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("false"),
        ),
        sa.Column("image_url", sa.String(length=500), nullable=True),
        sa.Column(
            "sort_order",
            sa.Integer(),
            nullable=False,
            server_default=sa.text("0"),
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
    )
    op.create_index("ix_place_menus_place_id", "place_menus", ["place_id"])


def downgrade() -> None:
    op.drop_index("ix_place_menus_place_id", table_name="place_menus")
    op.drop_table("place_menus")
