"""Fix quick filter columns nullable/default contradiction

Revision ID: 004_fix_quick_filter_nullable
Revises: 003_add_quick_filters
Create Date: 2026-04-05

Migration 003 created exclude_lots, raw_only, base_only as nullable=True
with default=False, which allows NULL values despite having a default.
This migration backfills existing NULLs to 0 and makes the columns NOT NULL.
"""
from alembic import op
import sqlalchemy as sa

# revision identifiers
revision = '004_fix_quick_filter_nullable'
down_revision = '003_add_quick_filters'
branch_labels = None
depends_on = None


def upgrade():
    # Backfill any existing NULL values to 0 (False)
    op.execute("UPDATE cards SET exclude_lots = 0 WHERE exclude_lots IS NULL")
    op.execute("UPDATE cards SET raw_only = 0 WHERE raw_only IS NULL")
    op.execute("UPDATE cards SET base_only = 0 WHERE base_only IS NULL")

    # Alter columns to NOT NULL with server_default
    with op.batch_alter_table('cards') as batch_op:
        batch_op.alter_column('exclude_lots', nullable=False, server_default='0')
        batch_op.alter_column('raw_only', nullable=False, server_default='0')
        batch_op.alter_column('base_only', nullable=False, server_default='0')


def downgrade():
    with op.batch_alter_table('cards') as batch_op:
        batch_op.alter_column('exclude_lots', nullable=True, server_default=None)
        batch_op.alter_column('raw_only', nullable=True, server_default=None)
        batch_op.alter_column('base_only', nullable=True, server_default=None)
