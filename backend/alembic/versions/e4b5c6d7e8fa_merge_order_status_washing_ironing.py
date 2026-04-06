"""merge WASHING_DRYING + IRONING into WASHING_IRONING

Revision ID: e4b5c6d7e8fa
Revises: d3e4f5a6b7c8
Create Date: 2026-04-06

"""
from alembic import op


revision = "e4b5c6d7e8fa"
down_revision = "d3e4f5a6b7c8"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        UPDATE orders SET current_status = 'WASHING_IRONING'
        WHERE current_status IN ('WASHING_DRYING', 'IRONING')
        """
    )
    op.execute(
        """
        UPDATE order_trackings SET status_to = 'WASHING_IRONING'
        WHERE status_to IN ('WASHING_DRYING', 'IRONING')
        """
    )


def downgrade() -> None:
    # Lossy: gabungan dikembalikan ke tahap cuci saja
    op.execute(
        """
        UPDATE orders SET current_status = 'WASHING_DRYING'
        WHERE current_status = 'WASHING_IRONING'
        """
    )
    op.execute(
        """
        UPDATE order_trackings SET status_to = 'WASHING_DRYING'
        WHERE status_to = 'WASHING_IRONING'
        """
    )
