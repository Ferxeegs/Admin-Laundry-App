import uuid
from enum import Enum as PyEnum

from sqlalchemy import Column, String, Date, ForeignKey, DateTime, Numeric, Enum, UniqueConstraint
from sqlalchemy.orm import relationship

from app.db.base_class import Base
from .base import TimestampMixin, AuditMixin


class InvoiceStatus(PyEnum):
    """Status invoice bulanan."""

    UNPAID = "unpaid"
    WAITING_CONFIRMATION = "waiting_confirmation"
    PAID = "paid"
    CANCELLED = "cancelled"


class Invoice(Base, TimestampMixin, AuditMixin):
    """
    Model rangkuman tagihan bulanan untuk setiap siswa.
    created_at terisi otomatis saat cron job membuat invoice ini.
    """

    __tablename__ = "invoices"
    __table_args__ = (
        UniqueConstraint("student_id", "billing_period", name="uq_invoices_student_billing_period"),
    )

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))

    # Relationships
    student_id = Column(
        String(36),
        ForeignKey("students.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    # Invoice properties
    invoice_number = Column(String(255), nullable=False, unique=True, index=True)
    billing_period = Column(Date, nullable=False, index=True)  # contoh: 2024-03-01
    total_amount = Column(Numeric(10, 2), default=0.00, nullable=False)
    status = Column(
        Enum(InvoiceStatus, native_enum=False, length=50),
        default=InvoiceStatus.UNPAID,
        nullable=False,
        index=True,
    )
    paid_at = Column(DateTime(timezone=True), nullable=True)

    # ORM relationships
    student = relationship("Student", back_populates="invoices")
    orders = relationship("Order", back_populates="invoice")

    def __repr__(self):
        return f"<Invoice(id={self.id}, invoice_number={self.invoice_number}, status={self.status.value})>"

