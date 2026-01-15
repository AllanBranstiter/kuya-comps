"""add collections binders schema phase2

Revision ID: 001_collections_phase2
Revises: d52e4a2e9844
Create Date: 2026-01-15 04:02:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = '001_collections_phase2'
down_revision = 'd52e4a2e9844'
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Create binders, cards, and price_history tables for Phase 2."""
    
    # Create binders table
    op.create_table(
        'binders',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('user_id', sa.String(length=100), nullable=False),
        sa.Column('name', sa.String(length=200), nullable=False),
        sa.Column('cover_card_id', sa.Integer(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.text('CURRENT_TIMESTAMP')),
        sa.Column('updated_at', sa.DateTime(), nullable=False, server_default=sa.text('CURRENT_TIMESTAMP')),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index('ix_binders_user_id', 'binders', ['user_id'])
    op.create_index('ix_binders_created_at', 'binders', ['created_at'])
    op.create_index('idx_binder_user_created', 'binders', ['user_id', 'created_at'])
    
    # Create cards table
    op.create_table(
        'cards',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('binder_id', sa.Integer(), nullable=False),
        sa.Column('year', sa.String(length=10), nullable=True),
        sa.Column('set_name', sa.String(length=200), nullable=True),
        sa.Column('athlete', sa.String(length=200), nullable=False),
        sa.Column('card_number', sa.String(length=50), nullable=True),
        sa.Column('variation', sa.String(length=200), nullable=True),
        sa.Column('grading_company', sa.String(length=50), nullable=True),
        sa.Column('grade', sa.String(length=20), nullable=True),
        sa.Column('image_url', sa.Text(), nullable=True),
        sa.Column('search_query_string', sa.Text(), nullable=False),
        sa.Column('auto_update', sa.Boolean(), nullable=False, server_default='1'),
        sa.Column('last_updated_at', sa.DateTime(), nullable=True),
        sa.Column('purchase_price', sa.Numeric(precision=10, scale=2), nullable=True),
        sa.Column('purchase_date', sa.DateTime(), nullable=True),
        sa.Column('current_fmv', sa.Numeric(precision=10, scale=2), nullable=True),
        sa.Column('review_required', sa.Boolean(), nullable=False, server_default='0'),
        sa.Column('review_reason', sa.Text(), nullable=True),
        sa.Column('no_recent_sales', sa.Boolean(), nullable=False, server_default='0'),
        sa.Column('tags', sa.Text(), nullable=True),
        sa.Column('notes', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.text('CURRENT_TIMESTAMP')),
        sa.Column('updated_at', sa.DateTime(), nullable=False, server_default=sa.text('CURRENT_TIMESTAMP')),
        sa.ForeignKeyConstraint(['binder_id'], ['binders.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index('ix_cards_binder_id', 'cards', ['binder_id'])
    op.create_index('ix_cards_athlete', 'cards', ['athlete'])
    op.create_index('ix_cards_auto_update', 'cards', ['auto_update'])
    op.create_index('ix_cards_last_updated_at', 'cards', ['last_updated_at'])
    op.create_index('ix_cards_review_required', 'cards', ['review_required'])
    op.create_index('idx_card_binder_athlete', 'cards', ['binder_id', 'athlete'])
    op.create_index('idx_card_auto_update_stale', 'cards', ['auto_update', 'last_updated_at'])
    op.create_index('idx_card_review_required', 'cards', ['review_required'])
    
    # Create price_history table
    op.create_table(
        'price_history',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('card_id', sa.Integer(), nullable=False),
        sa.Column('value', sa.Numeric(precision=10, scale=2), nullable=False),
        sa.Column('date_recorded', sa.DateTime(), nullable=False, server_default=sa.text('CURRENT_TIMESTAMP')),
        sa.Column('num_sales', sa.Integer(), nullable=True),
        sa.Column('confidence', sa.String(length=20), nullable=True),
        sa.ForeignKeyConstraint(['card_id'], ['cards.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index('ix_price_history_card_id', 'price_history', ['card_id'])
    op.create_index('ix_price_history_date_recorded', 'price_history', ['date_recorded'])
    op.create_index('idx_price_history_card_date', 'price_history', ['card_id', 'date_recorded'])
    
    # Add foreign key constraint for cover_card_id (must be done after cards table exists)
    op.create_foreign_key(
        'fk_binders_cover_card_id',
        'binders',
        'cards',
        ['cover_card_id'],
        ['id'],
        ondelete='SET NULL'
    )


def downgrade() -> None:
    """Drop collections tables."""
    
    # Drop foreign key constraint first
    op.drop_constraint('fk_binders_cover_card_id', 'binders', type_='foreignkey')
    
    # Drop tables in reverse order
    op.drop_table('price_history')
    op.drop_table('cards')
    op.drop_table('binders')
