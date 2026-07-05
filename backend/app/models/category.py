"""Flat, multi-tag category system for places.

Replaces the single-value `Place.category` enum with a many-to-many so a
single place can wear multiple tags (e.g. a Korean gastropub is both
`korean` and `pub_brewpub`). This module lands the schema only — the
existing enum column stays in place for now, and no code path reads from
this new table yet. Migration + backfill + service-layer switch happen
in later commits.

Labels are NOT stored here — the frontend i18n bundle owns them, keyed
off `Category.code`. That's why there's no `name` column.
"""
from sqlalchemy import Column, ForeignKey, Integer, String, Table
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


# Association table for the Place ↔ Category many-to-many. Composite PK
# (place_id, category_id) is also the natural uniqueness constraint —
# tagging the same category twice on the same place makes no sense.
# ondelete="CASCADE" on both sides so removing a place or a category
# doesn't leave dangling rows here. (Nothing removes categories in
# practice, but wiring cascade in from day one avoids future surprises.)
place_categories = Table(
    "place_categories",
    Base.metadata,
    Column(
        "place_id",
        ForeignKey("places.id", ondelete="CASCADE"),
        primary_key=True,
    ),
    Column(
        "category_id",
        ForeignKey("categories.id", ondelete="CASCADE"),
        primary_key=True,
    ),
)


class Category(Base):
    """A single tag a place can wear.

    `code` is the wire form (e.g. "korean") — same identifier used in
    the frontend i18n key. `group` is a coarse bucket ("food",
    "coffee_dessert", "drink", "space_tag") for filter-panel grouping.
    `sort_order` is the render order inside the filter panel; keeping it
    as an integer column (rather than deriving from an enum) lets an
    admin reorder without a code change.
    """

    __tablename__ = "categories"

    id: Mapped[int] = mapped_column(primary_key=True)
    code: Mapped[str] = mapped_column(String(50), unique=True, index=True)
    # `group` is a PostgreSQL reserved word but SQLAlchemy auto-quotes it
    # in generated SQL, so leaving the attribute+column name as `group`
    # is safe. Keeping the same word for both the model field and the DB
    # column so the wire form and the ORM stay aligned.
    group: Mapped[str] = mapped_column(String(50))
    sort_order: Mapped[int] = mapped_column(Integer)
