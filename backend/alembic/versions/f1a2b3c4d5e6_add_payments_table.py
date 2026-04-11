"""add payments table for xendit integration

Revision ID: f1a2b3c4d5e6
Revises: b9ccf537992b
Create Date: 2026-04-11 12:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'f1a2b3c4d5e6'
down_revision = 'b9ccf537992b'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table('payments',
        sa.Column('id', sa.String(length=36), nullable=False),
        sa.Column('invoice_id', sa.String(length=36), nullable=False),
        sa.Column('xendit_invoice_id', sa.String(length=255), nullable=True),
        sa.Column('xendit_invoice_url', sa.Text(), nullable=True),
        sa.Column('external_id', sa.String(length=255), nullable=False),
        sa.Column('amount', sa.Numeric(precision=10, scale=2), nullable=False),
        sa.Column('status', sa.Enum('PENDING', 'PAID', 'EXPIRED', 'FAILED', name='paymentstatus', native_enum=False, length=50), nullable=False),
        sa.Column('payment_method', sa.String(length=100), nullable=True),
        sa.Column('payment_channel', sa.String(length=100), nullable=True),
        sa.Column('paid_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('xendit_callback_data', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(['invoice_id'], ['invoices.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_payments_invoice_id'), 'payments', ['invoice_id'], unique=False)
    op.create_index(op.f('ix_payments_external_id'), 'payments', ['external_id'], unique=True)
    op.create_index(op.f('ix_payments_xendit_invoice_id'), 'payments', ['xendit_invoice_id'], unique=True)
    op.create_index(op.f('ix_payments_status'), 'payments', ['status'], unique=False)


def downgrade() -> None:
    op.drop_index(op.f('ix_payments_status'), table_name='payments')
    op.drop_index(op.f('ix_payments_xendit_invoice_id'), table_name='payments')
    op.drop_index(op.f('ix_payments_external_id'), table_name='payments')
    op.drop_index(op.f('ix_payments_invoice_id'), table_name='payments')
    op.drop_table('payments')
