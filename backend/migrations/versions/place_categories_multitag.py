"""place categories multi-tag schema

Revision ID: place_categories_multitag
Revises: email_verification_columns
Create Date: 2026-07-06

Creates the schema for the flat, multi-tag category system:

  - `categories`: 23 tag definitions (code / group / sort_order). The
    23 rows are seeded here so the app can rely on their presence.
  - `place_categories`: composite-PK association between places and
    categories. ondelete=CASCADE on both FKs.

Deliberately does NOT touch `places.category` (the legacy scalar enum
column) or backfill anything from it. Later commits handle:
  - service-layer switch to reading from `place_categories`
  - initial backfill from `places.category` into `place_categories`
  - eventual drop of the legacy column + PlaceCategory enum

Downgrade drops both tables, no data preserved (the seed rows are code
under version control anyway).
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "place_categories_multitag"
down_revision: Union[str, Sequence[str], None] = "email_verification_columns"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


# Order == sort_order. Groups follow the Phase-2 category spec:
#   food (9) → coffee_dessert (5) → drink (5) → space_tag (4) = 23 total.
_SEED_ROWS: list[tuple[str, str]] = [
    # food
    ("korean", "food"),
    ("japanese", "food"),
    ("chinese", "food"),
    ("western", "food"),
    ("asian", "food"),
    ("bbq_grill", "food"),
    ("seafood", "food"),
    ("bunsik", "food"),
    ("burger_pizza_fastfood", "food"),
    # coffee_dessert
    ("cafe", "coffee_dessert"),
    ("bakery", "coffee_dessert"),
    ("dessert", "coffee_dessert"),
    ("brunch", "coffee_dessert"),
    ("traditional_tea", "coffee_dessert"),
    # drink
    ("bar_hof", "drink"),
    ("izakaya", "drink"),
    ("wine_bar", "drink"),
    ("cocktail_bar", "drink"),
    ("pub_brewpub", "drink"),
    # space_tag
    ("rooftop_terrace", "space_tag"),
    ("large_group", "space_tag"),
    ("fine_dining", "space_tag"),
    ("pet_specialized", "space_tag"),
]


def upgrade() -> None:
    categories = op.create_table(
        "categories",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("code", sa.String(length=50), nullable=False),
        sa.Column("group", sa.String(length=50), nullable=False),
        sa.Column("sort_order", sa.Integer(), nullable=False),
        sa.UniqueConstraint("code", name="uq_categories_code"),
    )
    op.create_index("ix_categories_code", "categories", ["code"])

    op.create_table(
        "place_categories",
        sa.Column(
            "place_id",
            sa.Integer(),
            sa.ForeignKey("places.id", ondelete="CASCADE"),
            primary_key=True,
        ),
        sa.Column(
            "category_id",
            sa.Integer(),
            sa.ForeignKey("categories.id", ondelete="CASCADE"),
            primary_key=True,
        ),
    )

    op.bulk_insert(
        categories,
        [
            {"code": code, "group": group, "sort_order": i}
            for i, (code, group) in enumerate(_SEED_ROWS, start=1)
        ],
    )


def downgrade() -> None:
    op.drop_table("place_categories")
    op.drop_index("ix_categories_code", table_name="categories")
    op.drop_table("categories")
