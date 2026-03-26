from datetime import date, datetime
from typing import Optional, List

from pydantic import BaseModel, ConfigDict

from app.models.invoice import InvoiceStatus
from .order import OrderRead


class InvoiceBase(BaseModel):
    student_id: str
    billing_period: date  # YYYY-MM-01


class StudentMiniRead(BaseModel):
    id: str
    fullname: str
    unique_code: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)


class InvoiceCreate(InvoiceBase):
    pass


class InvoiceUpdate(BaseModel):
    status: InvoiceStatus
    paid_at: Optional[datetime] = None


class InvoiceRead(InvoiceBase):
    id: str
    invoice_number: str
    total_amount: float
    status: InvoiceStatus
    paid_at: Optional[datetime] = None

    student: Optional[StudentMiniRead] = None

    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None
    created_by: Optional[str] = None
    updated_by: Optional[str] = None
    deleted_at: Optional[datetime] = None
    deleted_by: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)


class InvoiceWithOrdersRead(InvoiceRead):
    orders: List[OrderRead] = []

