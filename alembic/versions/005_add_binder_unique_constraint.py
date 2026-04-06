"""Add unique constraint on binders (user_id, name)

Revision ID: 005_add_binder_unique_constraint
Revises: 004_fix_quick_filter_nullable
Create Date: 2026-04-05

Prevents duplicate binder names per user. Checks for existing duplicates
and appends a suffix before adding the constraint.
"""
from alembic import op
import sqlalchemy as sa

# revision identifiers
revision = '005_add_binder_unique_constraint'
down_revision = '004_fix_quick_filter_nullable'
branch_labels = None
depends_on = None


def upgrade():
    # First, resolve any existing duplicate binder names per user
    # by appending a numeric suffix
    conn = op.get_bind()
    duplicates = conn.execute(sa.text("""
        SELECT b1.id, b1.user_id, b1.name
        FROM binders b1
        INNER JOIN (
            SELECT user_id, name
            FROM binders
            GROUP BY user_id, name
            HAVING COUNT(*) > 1
        ) b2 ON b1.user_id = b2.user_id AND b1.name = b2.name
        ORDER BY b1.user_id, b1.name, b1.created_at
    """)).fetchall()

    if duplicates:
        seen = {}
        for row in duplicates:
            key = (row.user_id, row.name)
            if key not in seen:
                seen[key] = 0  # First occurrence keeps original name
            else:
                seen[key] += 1
                new_name = f"{row.name} ({seen[key]})"
                conn.execute(
                    sa.text("UPDATE binders SET name = :new_name WHERE id = :id"),
                    {"new_name": new_name, "id": row.id}
                )

    # Add unique constraint
    with op.batch_alter_table('binders') as batch_op:
        batch_op.create_unique_constraint('uq_binder_user_name', ['user_id', 'name'])


def downgrade():
    with op.batch_alter_table('binders') as batch_op:
        batch_op.drop_constraint('uq_binder_user_name', type_='unique')
