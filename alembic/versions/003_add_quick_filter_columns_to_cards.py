"""Add quick filter columns to cards table

Revision ID: 003_add_quick_filters
Revises: 002_add_user_id_to_cards
Create Date: 2026-01-24

"""
from alembic import op
import sqlalchemy as sa

# revision identifiers
revision = '003_add_quick_filters'
down_revision = '002_add_user_id_to_cards'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('cards', sa.Column('exclude_lots', sa.Boolean(), nullable=True, default=False))
    op.add_column('cards', sa.Column('raw_only', sa.Boolean(), nullable=True, default=False))
    op.add_column('cards', sa.Column('base_only', sa.Boolean(), nullable=True, default=False))


def downgrade():
    op.drop_column('cards', 'exclude_lots')
    op.drop_column('cards', 'raw_only')
    op.drop_column('cards', 'base_only')
