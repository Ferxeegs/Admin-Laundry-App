"""replace waiting_confirmation with failed in invoice status

Revision ID: a7b8c9d0e1f2
Revises: f1a2b3c4d5e6
Create Date: 2026-04-11 12:30:00.000000

"""
from alembic import op


# revision identifiers, used by Alembic.
revision = 'a7b8c9d0e1f2'
down_revision = 'f1a2b3c4d5e6'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Since we use native_enum=False (VARCHAR), we only need to update existing data
    # Change any 'waiting_confirmation' statuses to 'unpaid' (safe fallback)
    op.execute(
        "UPDATE invoices SET status = 'unpaid' WHERE status = 'waiting_confirmation'"
    )


def downgrade() -> None:
    # Change any 'failed' statuses back to 'waiting_confirmation'
    op.execute(
        "UPDATE invoices SET status = 'waiting_confirmation' WHERE status = 'failed'"
    )
