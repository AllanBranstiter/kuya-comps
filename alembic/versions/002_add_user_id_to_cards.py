"""add user_id to cards table

Revision ID: 002_add_user_id_to_cards
Revises: 001_collections_phase2
Create Date: 2026-01-22 02:56:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '002_add_user_id_to_cards'
down_revision = '001_collections_phase2'
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Add user_id column to cards table for simplified queries."""
    
    # Step 1: Add user_id column (nullable initially to allow data migration)
    op.add_column('cards', sa.Column('user_id', sa.String(length=100), nullable=True))
    
    # Step 2: Populate user_id from binders table (data migration)
    op.execute("""
        UPDATE cards
        SET user_id = (
            SELECT user_id
            FROM binders
            WHERE binders.id = cards.binder_id
        )
    """)
    
    # Step 3: Make user_id non-nullable using batch mode (SQLite compatibility)
    # SQLite doesn't support ALTER COLUMN, so we use batch_alter_table
    with op.batch_alter_table('cards', schema=None) as batch_op:
        batch_op.alter_column('user_id', existing_type=sa.String(length=100), nullable=False)
    
    # Step 4: Add indexes for performance
    op.create_index('ix_cards_user_id', 'cards', ['user_id'])
    op.create_index('idx_card_user_id_auto_update', 'cards', ['user_id', 'auto_update'])


def downgrade() -> None:
    """Remove user_id column from cards table."""
    
    # Drop indexes first
    op.drop_index('idx_card_user_id_auto_update', 'cards')
    op.drop_index('ix_cards_user_id', 'cards')
    
    # Drop column
    op.drop_column('cards', 'user_id')
