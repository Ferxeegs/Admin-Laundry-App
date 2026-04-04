"""add addons and order_addon

Revision ID: b1a2c3d4e5f6
Revises: 8ff810dddf2b
Create Date: 2026-04-04

"""
from alembic import op
import sqlalchemy as sa


revision = "b1a2c3d4e5f6"
down_revision = "8ff810dddf2b"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "addons",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("price", sa.Numeric(precision=10, scale=2), nullable=False, server_default="0"),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_by", sa.String(length=36), nullable=True),
        sa.Column("updated_by", sa.String(length=36), nullable=True),
        sa.Column("deleted_by", sa.String(length=36), nullable=True),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_addons_is_active"), "addons", ["is_active"], unique=False)
    op.create_index(op.f("ix_addons_name"), "addons", ["name"], unique=False)

    op.create_table(
        "order_addon",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("order_id", sa.String(length=36), nullable=False),
        sa.Column("addon_id", sa.String(length=36), nullable=False),
        sa.Column("price", sa.Numeric(precision=10, scale=2), nullable=False),
        sa.Column("count", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["addon_id"], ["addons.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["order_id"], ["orders.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_order_addon_addon_id"), "order_addon", ["addon_id"], unique=False)
    op.create_index(op.f("ix_order_addon_order_id"), "order_addon", ["order_id"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_order_addon_order_id"), table_name="order_addon")
    op.drop_index(op.f("ix_order_addon_addon_id"), table_name="order_addon")
    op.drop_table("order_addon")
    op.drop_index(op.f("ix_addons_name"), table_name="addons")
    op.drop_index(op.f("ix_addons_is_active"), table_name="addons")
    op.drop_table("addons")
