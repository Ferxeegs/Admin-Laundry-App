"""
Invoice management endpoints.
"""

from __future__ import annotations

from datetime import datetime, timezone, date
from typing import Optional

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.orm import Session, joinedload

from app.api.deps import get_db, get_current_active_user
from app.core.exceptions import NotFoundException, BadRequestException, ConflictException
from app.models.auth import User
from app.models.invoice import Invoice, InvoiceStatus
from app.models.order import Order, OrderAddon
from app.schemas.common import WebResponse
from app.schemas.invoice import (
    InvoiceCreate,
    InvoiceUpdate,
    InvoiceRead,
    InvoiceWithOrdersRead,
)
from app.services.order_serialization import (
    serialize_order_read,
    serialize_order_with_tracking,
    order_addon_total,
)

router = APIRouter()


def get_month_range(billing_period: date) -> tuple[datetime, datetime]:
    """
    Convert billing_period date (YYYY-MM-01) to UTC month start/end datetimes.
    """

    period_start = datetime(billing_period.year, billing_period.month, 1, tzinfo=timezone.utc)
    if billing_period.month == 12:
        period_end = datetime(billing_period.year + 1, 1, 1, tzinfo=timezone.utc)
    else:
        period_end = datetime(billing_period.year, billing_period.month + 1, 1, tzinfo=timezone.utc)
    return period_start, period_end


@router.get("/eligible-orders", response_model=WebResponse[dict])
def get_eligible_orders(
    student_id: str = Query(...),
    billing_period: date = Query(...),  # YYYY-MM-01
    db: Session = Depends(get_db),
    # current_user: User = Depends(get_current_active_user),
):
    """
    Get orders for a student and billing month where Order.invoice_id is still NULL,
    so creating invoice won't duplicate orders.
    """

    period_start, period_end = get_month_range(billing_period)

    orders = (
        db.query(Order)
        .options(
            joinedload(Order.student),
            joinedload(Order.addons).joinedload(OrderAddon.addon),
        )
        .filter(
            Order.student_id == student_id,
            Order.invoice_id.is_(None),  # Avoid duplicate invoicing
            Order.created_at >= period_start,
            Order.created_at < period_end,
        )
        .order_by(Order.created_at.asc())
        .all()
    )

    total_amount = float(
        sum(float(o.additional_fee) + order_addon_total(o) for o in orders)
    )

    orders_data = [serialize_order_read(o).model_dump() for o in orders]

    return WebResponse(
        status="success",
        data={
            "orders": orders_data,
            "total_amount": total_amount,
        },
    )


@router.get("/", response_model=WebResponse[dict])
def get_all_invoices(
    page: int = Query(1, ge=1),
    limit: int = Query(10, ge=1, le=100),
    student_id: Optional[str] = Query(None),
    billing_period: Optional[date] = Query(None),
    db: Session = Depends(get_db),
    # current_user: User = Depends(get_current_active_user),
):
    query = db.query(Invoice)

    if student_id:
        query = query.filter(Invoice.student_id == student_id)
    if billing_period:
        query = query.filter(Invoice.billing_period == billing_period)

    total = query.count()
    offset = (page - 1) * limit

    invoices = (
        query.options(joinedload(Invoice.student))
        .order_by(Invoice.created_at.desc())
        .offset(offset)
        .limit(limit)
        .all()
    )

    total_pages = (total + limit - 1) // limit if limit > 0 else 0

    invoices_data = [InvoiceRead.model_validate(inv).model_dump() for inv in invoices]

    return WebResponse(
        status="success",
        data={
            "invoices": invoices_data,
            "pagination": {
                "page": page,
                "limit": limit,
                "total": total,
                "totalPages": total_pages,
            },
        },
    )


@router.get("/{invoice_id}", response_model=WebResponse[InvoiceWithOrdersRead])
def get_invoice_by_id(
    invoice_id: str,
    db: Session = Depends(get_db),
    # current_user: User = Depends(get_current_active_user),
):
    invoice = (
        db.query(Invoice)
        .options(
            joinedload(Invoice.student),
            joinedload(Invoice.orders).joinedload(Order.student),
            joinedload(Invoice.orders).joinedload(Order.addons).joinedload(OrderAddon.addon),
            joinedload(Invoice.orders).joinedload(Order.trackings),
        )
        .filter(Invoice.id == invoice_id)
        .first()
    )

    if not invoice:
        raise NotFoundException(f"Invoice with ID {invoice_id} not found")

    inv_payload = InvoiceRead.model_validate(invoice).model_dump()
    inv_payload["orders"] = [
        serialize_order_with_tracking(o).model_dump() for o in (invoice.orders or [])
    ]

    return WebResponse(
        status="success",
        data=InvoiceWithOrdersRead.model_validate(inv_payload),
    )


@router.post("/", response_model=WebResponse[InvoiceRead], status_code=status.HTTP_201_CREATED)
def create_invoice(
    invoice_create: InvoiceCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """
    Create an invoice for a student and month by attaching eligible orders
    (Order.invoice_id is NULL, and Order.created_at within billing month).
    """

    existing_invoice = (
        db.query(Invoice)
        .filter(
            Invoice.student_id == invoice_create.student_id,
            Invoice.billing_period == invoice_create.billing_period,
        )
        .first()
    )

    if existing_invoice and existing_invoice.status != InvoiceStatus.CANCELLED:
        raise ConflictException("Invoice for this student & month already exists")

    period_start, period_end = get_month_range(invoice_create.billing_period)

    orders = (
        db.query(Order)
        .options(joinedload(Order.addons).joinedload(OrderAddon.addon))
        .filter(
            Order.student_id == invoice_create.student_id,
            Order.invoice_id.is_(None),
            Order.created_at >= period_start,
            Order.created_at < period_end,
        )
        .order_by(Order.created_at.asc())
        .all()
    )

    if not orders:
        raise BadRequestException("No eligible orders found for creating invoice")

    total_amount = float(
        sum(float(o.additional_fee) + order_addon_total(o) for o in orders)
    )

    if existing_invoice:
        # Reuse the existing invoice record if it was cancelled.
        invoice = existing_invoice
        invoice.total_amount = total_amount
        invoice.status = InvoiceStatus.UNPAID
        invoice.paid_at = None
        invoice.updated_by = current_user.id
        invoice.updated_at = datetime.now(timezone.utc)
    else:
        sequence = (
            db.query(Invoice)
            .filter(Invoice.billing_period == invoice_create.billing_period)
            .count()
            + 1
        )

        invoice_number = f"INV/{invoice_create.billing_period.year}/{invoice_create.billing_period.month:02d}/{sequence:03d}"

        invoice = Invoice(
            student_id=invoice_create.student_id,
            billing_period=invoice_create.billing_period,
            invoice_number=invoice_number,
            total_amount=total_amount,
            status=InvoiceStatus.UNPAID,
            created_by=current_user.id,
        )

        db.add(invoice)
        db.flush()  # Ensure invoice.id is available

    for order in orders:
        order.invoice_id = invoice.id

    db.commit()
    db.refresh(invoice)

    return WebResponse(
        status="success",
        message="Invoice created successfully",
        data=InvoiceRead.model_validate(invoice),
    )


@router.put("/{invoice_id}", response_model=WebResponse[InvoiceRead])
def update_invoice(
    invoice_id: str,
    invoice_update: InvoiceUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    invoice = db.query(Invoice).filter(Invoice.id == invoice_id).first()
    if not invoice:
        raise NotFoundException(f"Invoice with ID {invoice_id} not found")

    invoice.status = invoice_update.status
    invoice.updated_by = current_user.id
    invoice.updated_at = datetime.now(timezone.utc)

    if invoice_update.status == InvoiceStatus.PAID:
        invoice.paid_at = invoice_update.paid_at or datetime.now(timezone.utc)
    else:
        invoice.paid_at = None

    # If invoice is cancelled, detach orders so they become eligible again
    if invoice_update.status == InvoiceStatus.CANCELLED:
        for order in invoice.orders or []:
            order.invoice_id = None

    db.commit()
    db.refresh(invoice)

    return WebResponse(
        status="success",
        message="Invoice updated successfully",
        data=InvoiceRead.model_validate(invoice),
    )


@router.delete("/{invoice_id}", response_model=WebResponse[dict])
def delete_invoice(
    invoice_id: str,
    db: Session = Depends(get_db),
    # current_user: User = Depends(get_current_active_user),
):
    invoice = db.query(Invoice).filter(Invoice.id == invoice_id).first()
    if not invoice:
        raise NotFoundException(f"Invoice with ID {invoice_id} not found")

    # Detach associated orders first (avoid FK constraints surprises)
    for order in invoice.orders or []:
        order.invoice_id = None

    db.delete(invoice)
    db.commit()

    return WebResponse(
        status="success",
        message="Invoice deleted successfully",
    )

