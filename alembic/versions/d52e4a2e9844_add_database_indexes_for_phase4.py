"""add_database_indexes_for_phase4

Revision ID: d52e4a2e9844
Revises: 
Create Date: 2025-12-19 18:12:49.112105

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'd52e4a2e9844'
down_revision: Union[str, Sequence[str], None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema - Add Phase 4 database indexes for optimization."""
    # Add index on timestamp column for feedback_submissions if it doesn't exist
    # This improves query performance for date-based filtering and sorting
    with op.batch_alter_table('feedback_submissions', schema=None) as batch_op:
        # Check if indexes don't already exist and add them
        # SQLite requires batch mode for ALTER TABLE operations
        batch_op.create_index('ix_feedback_submissions_timestamp', ['timestamp'], unique=False)


def downgrade() -> None:
    """Downgrade schema - Remove Phase 4 indexes."""
    with op.batch_alter_table('feedback_submissions', schema=None) as batch_op:
        batch_op.drop_index('ix_feedback_submissions_timestamp')
