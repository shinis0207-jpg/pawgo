"""initial

Revision ID: 7f60891796d2
Revises:
Create Date: 2026-05-06 13:41:23.207394

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '7f60891796d2'
down_revision: Union[str, Sequence[str], None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table('users',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('email', sa.String(length=255), nullable=False),
    sa.Column('name', sa.String(length=100), nullable=False),
    sa.Column('hashed_password', sa.String(length=255), nullable=True),
    sa.Column('auth_provider', sa.Enum('EMAIL', 'KAKAO', 'GOOGLE', 'APPLE', name='authprovider'), nullable=False),
    sa.Column('oauth_id', sa.String(length=255), nullable=True),
    sa.Column('language', sa.Enum('KO', 'EN', 'JA', 'ZH', name='language'), nullable=False),
    sa.Column('profile_image_url', sa.String(length=500), nullable=True),
    sa.Column('is_active', sa.Boolean(), nullable=False),
    sa.Column('is_verified', sa.Boolean(), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_users_email'), 'users', ['email'], unique=True)
    op.create_table('pets',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('user_id', sa.Integer(), nullable=False),
    sa.Column('name', sa.String(length=50), nullable=False),
    sa.Column('type', sa.String(length=50), nullable=False),
    sa.Column('breed', sa.String(length=100), nullable=True),
    sa.Column('weight_kg', sa.Float(), nullable=True),
    sa.Column('birth_date', sa.Date(), nullable=True),
    sa.Column('chip_id', sa.String(length=50), nullable=True),
    sa.Column('photo_url', sa.String(length=500), nullable=True),
    sa.Column('vaccination_records', sa.JSON(), nullable=True),
    sa.Column('notes', sa.String(length=1000), nullable=True),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('chip_id')
    )
    op.create_index(op.f('ix_pets_user_id'), 'pets', ['user_id'], unique=False)
    op.create_table('places',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('name', sa.String(length=200), nullable=False),
    sa.Column('category', sa.Enum('ACCOMMODATION', 'RESTAURANT', 'CAFE', 'PARK', 'VET', name='placecategory'), nullable=False),
    sa.Column('latitude', sa.Float(), nullable=False),
    sa.Column('longitude', sa.Float(), nullable=False),
    sa.Column('address', sa.String(length=500), nullable=False),
    sa.Column('address_detail', sa.String(length=200), nullable=True),
    sa.Column('city', sa.String(length=100), nullable=True),
    sa.Column('province', sa.String(length=100), nullable=True),
    sa.Column('phone', sa.String(length=20), nullable=True),
    sa.Column('website', sa.String(length=500), nullable=True),
    sa.Column('hours', sa.JSON(), nullable=True),
    sa.Column('max_weight_kg', sa.Float(), nullable=True),
    sa.Column('allows_indoor', sa.Boolean(), nullable=False),
    sa.Column('allows_outdoor', sa.Boolean(), nullable=False),
    sa.Column('has_parking', sa.Boolean(), nullable=False),
    sa.Column('entrance_fee', sa.String(length=200), nullable=True),
    sa.Column('description', sa.Text(), nullable=True),
    sa.Column('thumbnail_url', sa.String(length=500), nullable=True),
    sa.Column('rating', sa.Float(), nullable=False),
    sa.Column('review_count', sa.Integer(), nullable=False),
    sa.Column('is_verified', sa.Boolean(), nullable=False),
    sa.Column('is_active', sa.Boolean(), nullable=False),
    sa.Column('owner_user_id', sa.Integer(), nullable=True),
    sa.Column('external_id', sa.String(length=100), nullable=True),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.ForeignKeyConstraint(['owner_user_id'], ['users.id'], ondelete='SET NULL'),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_places_category'), 'places', ['category'], unique=False)
    op.create_index(op.f('ix_places_city'), 'places', ['city'], unique=False)
    op.create_index(op.f('ix_places_name'), 'places', ['name'], unique=False)
    op.create_table('place_photos',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('place_id', sa.Integer(), nullable=False),
    sa.Column('url', sa.String(length=500), nullable=False),
    sa.Column('caption', sa.String(length=200), nullable=True),
    sa.Column('is_primary', sa.Boolean(), nullable=False),
    sa.Column('uploaded_by', sa.Integer(), nullable=True),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.ForeignKeyConstraint(['place_id'], ['places.id'], ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['uploaded_by'], ['users.id'], ondelete='SET NULL'),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_place_photos_place_id'), 'place_photos', ['place_id'], unique=False)
    op.create_table('place_translations',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('place_id', sa.Integer(), nullable=False),
    sa.Column('language', sa.String(length=5), nullable=False),
    sa.Column('name', sa.String(length=200), nullable=False),
    sa.Column('description', sa.Text(), nullable=True),
    sa.Column('address', sa.String(length=500), nullable=True),
    sa.ForeignKeyConstraint(['place_id'], ['places.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_place_translations_language'), 'place_translations', ['language'], unique=False)
    op.create_index(op.f('ix_place_translations_place_id'), 'place_translations', ['place_id'], unique=False)
    op.create_table('reviews',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('place_id', sa.Integer(), nullable=False),
    sa.Column('user_id', sa.Integer(), nullable=False),
    sa.Column('pet_id', sa.Integer(), nullable=True),
    sa.Column('rating', sa.Float(), nullable=False),
    sa.Column('content', sa.Text(), nullable=True),
    sa.Column('visit_date', sa.String(length=20), nullable=True),
    sa.Column('is_helpful_count', sa.Integer(), nullable=False),
    sa.Column('is_verified_visit', sa.Boolean(), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.ForeignKeyConstraint(['pet_id'], ['pets.id'], ondelete='SET NULL'),
    sa.ForeignKeyConstraint(['place_id'], ['places.id'], ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_reviews_place_id'), 'reviews', ['place_id'], unique=False)
    op.create_index(op.f('ix_reviews_user_id'), 'reviews', ['user_id'], unique=False)
    op.create_table('vet_hospitals',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('place_id', sa.Integer(), nullable=False),
    sa.Column('is_24h', sa.Boolean(), nullable=False),
    sa.Column('emergency', sa.Boolean(), nullable=False),
    sa.Column('night_hours', sa.String(length=100), nullable=True),
    sa.Column('specialties', sa.JSON(), nullable=True),
    sa.Column('license_number', sa.String(length=50), nullable=True),
    sa.Column('doctor_count', sa.Integer(), nullable=True),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.ForeignKeyConstraint(['place_id'], ['places.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_vet_hospitals_place_id'), 'vet_hospitals', ['place_id'], unique=True)
    op.create_table('review_photos',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('review_id', sa.Integer(), nullable=False),
    sa.Column('url', sa.String(length=500), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.ForeignKeyConstraint(['review_id'], ['reviews.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_review_photos_review_id'), 'review_photos', ['review_id'], unique=False)


def downgrade() -> None:
    op.drop_index(op.f('ix_review_photos_review_id'), table_name='review_photos')
    op.drop_table('review_photos')
    op.drop_index(op.f('ix_vet_hospitals_place_id'), table_name='vet_hospitals')
    op.drop_table('vet_hospitals')
    op.drop_index(op.f('ix_reviews_user_id'), table_name='reviews')
    op.drop_index(op.f('ix_reviews_place_id'), table_name='reviews')
    op.drop_table('reviews')
    op.drop_index(op.f('ix_place_translations_place_id'), table_name='place_translations')
    op.drop_index(op.f('ix_place_translations_language'), table_name='place_translations')
    op.drop_table('place_translations')
    op.drop_index(op.f('ix_place_photos_place_id'), table_name='place_photos')
    op.drop_table('place_photos')
    op.drop_index(op.f('ix_places_name'), table_name='places')
    op.drop_index(op.f('ix_places_city'), table_name='places')
    op.drop_index(op.f('ix_places_category'), table_name='places')
    op.drop_table('places')
    op.drop_index(op.f('ix_pets_user_id'), table_name='pets')
    op.drop_table('pets')
    op.drop_index(op.f('ix_users_email'), table_name='users')
    op.drop_table('users')
