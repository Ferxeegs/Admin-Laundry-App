"""align monthly_quota default to 28 for weekly laundry quota

Revision ID: d3e4f5a6b7c8
Revises: b1a2c3d4e5f6
Create Date: 2026-04-06

"""
from alembic import op


revision = "d3e4f5a6b7c8"
down_revision = "b1a2c3d4e5f6"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Bump legacy default 4 → 28 when still at old default (admin-custom values unchanged)
    op.execute(
        """
        UPDATE settings
        SET payload = '28'::jsonb
        WHERE "group" = 'order' AND name = 'monthly_quota'
        AND (
            payload::text = '4'
            OR payload::text = '"4"'
        )
        """
    )


def downgrade() -> None:
    op.execute(
        """
        UPDATE settings
        SET payload = '4'::jsonb
        WHERE "group" = 'order' AND name = 'monthly_quota'
        AND payload::text = '28'
        """
    )
