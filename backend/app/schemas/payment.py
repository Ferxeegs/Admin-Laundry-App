"""
Pydantic schemas for payment API.
"""

from datetime import datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict

from app.models.payment import PaymentStatus


class PaymentRead(BaseModel):
    """Response schema for payment information."""

    id: str
    invoice_id: str
    external_id: str
    amount: float
    status: PaymentStatus
    xendit_invoice_url: Optional[str] = None
    payment_method: Optional[str] = None
    payment_channel: Optional[str] = None
    paid_at: Optional[datetime] = None
    created_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)


class PaymentCreateResponse(BaseModel):
    """Response setelah berhasil buat payment di Xendit."""

    payment_id: str
    xendit_invoice_url: str
    external_id: str
    status: PaymentStatus


class XenditCallbackPayload(BaseModel):
    """
    Payload dari Xendit webhook callback.
    Field yang relevan dari Invoice callback.
    """

    id: Optional[str] = None
    external_id: str
    status: str  # 'PAID', 'EXPIRED', etc.
    amount: Optional[float] = None
    payer_email: Optional[str] = None
    payment_method: Optional[str] = None
    payment_channel: Optional[str] = None
    paid_at: Optional[str] = None
    merchant_name: Optional[str] = None

    model_config = ConfigDict(extra="allow")  # Xendit may send additional fields
