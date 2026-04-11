"""
Payment model for Xendit payment gateway integration.
Tracks payment transactions linked to invoices.
"""

import uuid
from enum import Enum as PyEnum

from sqlalchemy import Column, String, DateTime, Numeric, Enum, ForeignKey, Text
from sqlalchemy.orm import relationship

from app.db.base_class import Base
from .base import TimestampMixin


class PaymentStatus(PyEnum):
    """Status pembayaran dari Xendit."""

    PENDING = "PENDING"
    PAID = "PAID"
    EXPIRED = "EXPIRED"
    FAILED = "FAILED"


class Payment(Base, TimestampMixin):
    """
    Model untuk tracking pembayaran via Xendit.
    Setiap invoice bisa punya beberapa attempt pembayaran,
    tapi hanya satu yang PAID.
    """

    __tablename__ = "payments"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))

    # Link ke invoice internal
    invoice_id = Column(
        String(36),
        ForeignKey("invoices.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    # Xendit identifiers
    xendit_invoice_id = Column(String(255), nullable=True, unique=True, index=True)
    xendit_invoice_url = Column(Text, nullable=True)
    external_id = Column(String(255), nullable=False, unique=True, index=True)

    # Payment details
    amount = Column(Numeric(10, 2), nullable=False)
    status = Column(
        Enum(PaymentStatus, native_enum=False, length=50),
        default=PaymentStatus.PENDING,
        nullable=False,
        index=True,
    )

    # Filled from webhook callback
    payment_method = Column(String(100), nullable=True)
    payment_channel = Column(String(100), nullable=True)
    paid_at = Column(DateTime(timezone=True), nullable=True)

    # Raw callback data for audit trail
    xendit_callback_data = Column(Text, nullable=True)

    # ORM relationships
    invoice = relationship("Invoice", back_populates="payments")

    def __repr__(self):
        return (
            f"<Payment(id={self.id}, external_id={self.external_id}, "
            f"status={self.status.value})>"
        )
