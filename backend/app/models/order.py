import uuid
from enum import Enum as PyEnum
from sqlalchemy import Column, String, Integer, Boolean, DateTime, ForeignKey, Text, Enum, Numeric
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.db.base_class import Base
from .base import TimestampMixin, AuditMixin
from .invoice import Invoice


# --- Enum untuk Status Laundry ---
class OrderStatus(PyEnum):
    """Status order laundry"""
    RECEIVED = "RECEIVED"
    WASHING_DRYING = "WASHING_DRYING"
    IRONING = "IRONING"
    COMPLETED = "COMPLETED"
    PICKED_UP = "PICKED_UP"


# --- Model Student ---
class Student(Base, TimestampMixin, AuditMixin):
    """
    Model untuk data siswa pondok
    """
    __tablename__ = "students"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    student_number = Column(String(255), nullable=False, unique=True, index=True)
    fullname = Column(String(255), nullable=False, index=True)
    phone_number = Column(String(255), nullable=True)
    guardian_name = Column(String(255), nullable=True)
    is_active = Column(Boolean, default=True, nullable=False, index=True)

    # Relationships
    orders = relationship("Order", back_populates="student")
    invoices = relationship(Invoice, back_populates="student")

    qr_code = relationship("QR", back_populates="student", uselist=False, cascade="all, delete-orphan")

    def __repr__(self):
        return f"<Student(id={self.id}, fullname={self.fullname})>"


# --- Model Dormitory ---
class Dormitory(Base, TimestampMixin, AuditMixin):
    """
    Model untuk asrama.
    Dipisahkan dari QR codes agar asrama punya metadata (name, description).
    """

    __tablename__ = "dormitories"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    name = Column(String(255), nullable=False, unique=True, index=True)
    description = Column(Text, nullable=True)

    qrs = relationship("QR", back_populates="dormitory_rel")

    def __repr__(self):
        return f"<Dormitory(id={self.id}, name={self.name})>"

# --- Model QR ---
class QR(Base, TimestampMixin, AuditMixin):
    """
    Model untuk data QR Code dan informasi asrama siswa
    """
    __tablename__ = "qr_codes"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    student_id = Column(String(36), ForeignKey("students.id", ondelete="CASCADE"), nullable=True, unique=True, index=True)
    token_qr = Column(String(255), unique=True, nullable=False, index=True) # Data unik dari QR
    dormitory_id = Column(String(36), ForeignKey("dormitories.id", ondelete="SET NULL"), nullable=True, index=True)
    qr_number = Column(String(50), nullable=True)
    unique_code = Column(String(50), nullable=True)

    # Relationships
    student = relationship("Student", back_populates="qr_code")
    dormitory_rel = relationship("Dormitory", back_populates="qrs")

    @property
    def dormitory(self) -> str | None:
        """Backwards-compatible accessor for QRRead.dormitory (asrama name)."""
        return self.dormitory_rel.name if self.dormitory_rel else None

    def __repr__(self):
        return (
            f"<QR(id={self.id}, token_qr={self.token_qr}, dormitory={self.dormitory}, "
            f"qr_number={self.qr_number}, unique_code={self.unique_code})>"
        )

# --- Model Order ---
class Order(Base, TimestampMixin, AuditMixin):
    """
    Model untuk order laundry
    created_by: ID Petugas Penerima [cite: 137]
    """
    __tablename__ = "orders"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    student_id = Column(String(36), ForeignKey("students.id", ondelete="RESTRICT"), nullable=False, index=True)
    invoice_id = Column(String(36), ForeignKey("invoices.id", ondelete="SET NULL"), nullable=True, index=True)
    order_number = Column(String(255), unique=True, nullable=False, index=True)

    # Item & Quota Management [cite: 159, 169]
    total_items = Column(Integer, default=0, nullable=False)
    free_items_used = Column(Integer, default=0, nullable=False)  # Gratis sesuai kuota harian (setting)
    paid_items_count = Column(Integer, default=0, nullable=False)
    additional_fee = Column(Numeric(10, 2), default=0.00, nullable=False)

    # Status & Tracking [cite: 171]
    current_status = Column(Enum(OrderStatus, native_enum=False, length=50), default=OrderStatus.RECEIVED, nullable=False, index=True)
    notes = Column(Text, nullable=True)

    # Relationships
    student = relationship("Student", back_populates="orders")
    invoice = relationship(Invoice, back_populates="orders")
    trackings = relationship("OrderTracking", back_populates="order", cascade="all, delete-orphan", order_by="OrderTracking.created_at")

    def __repr__(self):
        return f"<Order(id={self.id}, order_number={self.order_number}, status={self.current_status.value})>"


# --- Model Order Tracking ---
class OrderTracking(Base):
    """
    Model untuk tracking perubahan status order
    staff_id: ID Petugas yang memproses [cite: 32]
    """
    __tablename__ = "order_trackings"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    order_id = Column(String(36), ForeignKey("orders.id", ondelete="CASCADE"), nullable=False, index=True)
    staff_id = Column(String(36), nullable=True, index=True)  # ID Petugas yang memproses [cite: 32]
    status_to = Column(String(255), nullable=False)  # e.g., 'WASHING_DRYING'
    notes = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False, index=True)

    # Relationships
    order = relationship("Order", back_populates="trackings")

    def __repr__(self):
        return f"<OrderTracking(id={self.id}, order_id={self.order_id}, status_to={self.status_to})>"

