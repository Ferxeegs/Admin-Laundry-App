"""initial schema

Revision ID: 000000000001
Revises: 
Create Date: 2026-03-25 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '000000000001'
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    # --- Auth Tables ---
    op.create_table('roles',
    sa.Column('id', sa.BigInteger(), autoincrement=True, nullable=False),
    sa.Column('name', sa.String(length=255), nullable=False),
    sa.Column('guard_name', sa.String(length=255), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True),
    sa.Column('updated_at', sa.DateTime(timezone=True), nullable=True),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('name')
    )
    
    op.create_table('permissions',
    sa.Column('id', sa.BigInteger(), autoincrement=True, nullable=False),
    sa.Column('name', sa.String(length=255), nullable=False),
    sa.Column('guard_name', sa.String(length=255), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True),
    sa.Column('updated_at', sa.DateTime(timezone=True), nullable=True),
    sa.PrimaryKeyConstraint('id')
    )
    
    op.create_table('users',
    sa.Column('id', sa.String(length=36), nullable=False),
    sa.Column('username', sa.String(length=255), nullable=False),
    sa.Column('firstname', sa.String(length=255), nullable=False),
    sa.Column('lastname', sa.String(length=255), nullable=False),
    sa.Column('fullname', sa.String(length=255), nullable=True),
    sa.Column('phone_number', sa.String(length=255), nullable=True),
    sa.Column('email', sa.String(length=255), nullable=False),
    sa.Column('email_verified_at', sa.DateTime(), nullable=True),
    sa.Column('password', sa.String(length=255), nullable=False),
    sa.Column('remember_token', sa.String(length=100), nullable=True),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True),
    sa.Column('updated_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('created_by', sa.String(length=36), nullable=True),
    sa.Column('updated_by', sa.String(length=36), nullable=True),
    sa.Column('deleted_by', sa.String(length=36), nullable=True),
    sa.Column('deleted_at', sa.DateTime(timezone=True), nullable=True),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_users_email'), 'users', ['email'], unique=True)
    op.create_index(op.f('ix_users_username'), 'users', ['username'], unique=True)
    
    op.create_table('role_has_permissions',
    sa.Column('permission_id', sa.BigInteger(), nullable=False),
    sa.Column('role_id', sa.BigInteger(), nullable=False),
    sa.ForeignKeyConstraint(['permission_id'], ['permissions.id'], ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['role_id'], ['roles.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('permission_id', 'role_id')
    )
    
    op.create_table('user_roles',
    sa.Column('id', sa.BigInteger(), autoincrement=True, nullable=False),
    sa.Column('user_id', sa.String(length=36), nullable=True),
    sa.Column('role_id', sa.BigInteger(), nullable=True),
    sa.ForeignKeyConstraint(['role_id'], ['roles.id'], ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('user_id', 'role_id', name='uq_user_role')
    )
    
    op.create_table('password_reset_tokens',
    sa.Column('email', sa.String(length=255), nullable=False),
    sa.Column('token', sa.String(length=255), nullable=False),
    sa.Column('created_at', sa.DateTime(), server_default=sa.text('now()'), nullable=True),
    sa.PrimaryKeyConstraint('email')
    )
    
    # --- Core Business Tables ---
    op.create_table('students',
    sa.Column('id', sa.String(length=36), nullable=False),
    sa.Column('fullname', sa.String(length=255), nullable=False),
    sa.Column('phone_number', sa.String(length=255), nullable=True),
    sa.Column('guardian_name', sa.String(length=255), nullable=True),
    sa.Column('national_id_number', sa.String(length=255), nullable=False), # Will be dropped in 2f45b5b57567
    sa.Column('qr_code', sa.String(length=255), nullable=True), # Will be dropped in 2f45b5b57567
    sa.Column('dormitory', sa.String(length=255), nullable=True), # Will be dropped in 2f45b5b57567
    sa.Column('unique_code', sa.String(length=255), nullable=True), # Will be dropped in 2f45b5b57567
    sa.Column('grade_level', sa.String(length=255), nullable=True), # Will be dropped in 2f45b5b57567
    sa.Column('is_active', sa.Boolean(), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True),
    sa.Column('updated_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('created_by', sa.String(length=36), nullable=True),
    sa.Column('updated_by', sa.String(length=36), nullable=True),
    sa.Column('deleted_by', sa.String(length=36), nullable=True),
    sa.Column('deleted_at', sa.DateTime(timezone=True), nullable=True),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_students_fullname'), 'students', ['fullname'], unique=False)
    op.create_index(op.f('ix_students_is_active'), 'students', ['is_active'], unique=False)
    # Re-adding dropped indexes for consistency in downgrade back to here
    op.create_index('ix_students_national_id_number', 'students', ['national_id_number'], unique=False)
    op.create_index('ix_students_qr_code', 'students', ['qr_code'], unique=False)
    op.create_index('ix_students_unique_code', 'students', ['unique_code'], unique=False)
    
    op.create_table('orders',
    sa.Column('id', sa.String(length=36), nullable=False),
    sa.Column('student_id', sa.String(length=36), nullable=False),
    sa.Column('order_number', sa.String(length=255), nullable=False),
    sa.Column('total_items', sa.Integer(), nullable=False),
    sa.Column('free_items_used', sa.Integer(), nullable=False),
    sa.Column('paid_items_count', sa.Integer(), nullable=False),
    sa.Column('additional_fee', sa.Numeric(precision=10, scale=2), nullable=False),
    sa.Column('current_status', sa.Enum('RECEIVED', 'WASHING_DRYING', 'IRONING', 'COMPLETED', 'PICKED_UP', name='orderstatus', native_enum=False, length=50), nullable=False),
    sa.Column('notes', sa.Text(), nullable=True),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True),
    sa.Column('updated_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('created_by', sa.String(length=36), nullable=True),
    sa.Column('updated_by', sa.String(length=36), nullable=True),
    sa.Column('deleted_by', sa.String(length=36), nullable=True),
    sa.Column('deleted_at', sa.DateTime(timezone=True), nullable=True),
    sa.ForeignKeyConstraint(['student_id'], ['students.id'], name='orders_student_id_fkey', ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_orders_current_status'), 'orders', ['current_status'], unique=False)
    op.create_index(op.f('ix_orders_order_number'), 'orders', ['order_number'], unique=True)
    op.create_index(op.f('ix_orders_student_id'), 'orders', ['student_id'], unique=False)
    
    op.create_table('order_trackings',
    sa.Column('id', sa.String(length=36), nullable=False),
    sa.Column('order_id', sa.String(length=36), nullable=False),
    sa.Column('staff_id', sa.String(length=36), nullable=True),
    sa.Column('status_to', sa.String(length=255), nullable=False),
    sa.Column('notes', sa.Text(), nullable=True),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.ForeignKeyConstraint(['order_id'], ['orders.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_order_trackings_created_at'), 'order_trackings', ['created_at'], unique=False)
    op.create_index(op.f('ix_order_trackings_order_id'), 'order_trackings', ['order_id'], unique=False)
    op.create_index(op.f('ix_order_trackings_staff_id'), 'order_trackings', ['staff_id'], unique=False)
    
    # --- Common Tables ---
    op.create_table('media',
    sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
    sa.Column('model_type', sa.String(length=255), nullable=False),
    sa.Column('model_id', sa.String(length=36), nullable=False),
    sa.Column('collection', sa.String(length=255), nullable=True),
    sa.Column('url', sa.String(length=255), nullable=False),
    sa.Column('file_name', sa.String(length=255), nullable=False),
    sa.Column('name', sa.String(length=255), nullable=False),
    sa.Column('mime_type', sa.String(length=255), nullable=False),
    sa.Column('size', sa.Integer(), nullable=False),
    sa.Column('created_at', sa.DateTime(), server_default=sa.text('now()'), nullable=True),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index('idx_media_model', 'media', ['model_type', 'model_id'], unique=False)
    
    op.create_table('settings',
    sa.Column('id', sa.BigInteger(), autoincrement=True, nullable=False),
    sa.Column('group', sa.String(length=255), nullable=False),
    sa.Column('name', sa.String(length=255), nullable=False),
    sa.Column('locked', sa.Integer(), nullable=True),
    sa.Column('payload', sa.JSON(), nullable=True),
    sa.Column('created_at', sa.DateTime(), server_default=sa.text('now()'), nullable=True),
    sa.Column('updated_at', sa.DateTime(), nullable=True),
    sa.PrimaryKeyConstraint('id')
    )


def downgrade() -> None:
    op.drop_table('settings')
    op.drop_index('idx_media_model', table_name='media')
    op.drop_table('media')
    op.drop_index(op.f('ix_order_trackings_staff_id'), table_name='order_trackings')
    op.drop_index(op.f('ix_order_trackings_order_id'), table_name='order_trackings')
    op.drop_index(op.f('ix_order_trackings_created_at'), table_name='order_trackings')
    op.drop_table('order_trackings')
    op.drop_index(op.f('ix_orders_student_id'), table_name='orders')
    op.drop_index(op.f('ix_orders_order_number'), table_name='orders')
    op.drop_index(op.f('ix_orders_current_status'), table_name='orders')
    op.drop_table('orders')
    op.drop_index('ix_students_unique_code', table_name='students')
    op.drop_index('ix_students_qr_code', table_name='students')
    op.drop_index('ix_students_national_id_number', table_name='students')
    op.drop_index(op.f('ix_students_is_active'), table_name='students')
    op.drop_index(op.f('ix_students_fullname'), table_name='students')
    op.drop_table('students')
    op.drop_table('password_reset_tokens')
    op.drop_table('user_roles')
    op.drop_table('role_has_permissions')
    op.drop_index(op.f('ix_users_username'), table_name='users')
    op.drop_index(op.f('ix_users_email'), table_name='users')
    op.drop_table('users')
    op.drop_table('permissions')
    op.drop_table('roles')
