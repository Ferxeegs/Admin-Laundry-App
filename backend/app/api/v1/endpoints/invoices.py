"""
Invoice management endpoints.
"""

from __future__ import annotations

from datetime import datetime, timezone, date
from typing import Optional
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.orm import Session, joinedload

from app.api.deps import get_db, get_current_active_user
from app.core.config import settings
from app.core.exceptions import (
    NotFoundException,
    BadRequestException,
    ForbiddenException,
)
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
from app.services.billing_period import (
    get_month_range,
    first_day_of_previous_calendar_month,
    parse_billing_timezone,
)
from app.services.monthly_invoice_generation import generate_monthly_invoices
from app.core.permissions import has_superadmin_role
from app.schemas.invoice_generation import (
    MonthlyInvoiceGenerateBody,
    MonthlyInvoiceGenerateResponse,
    MonthlyInvoiceStudentOutcomeRead,
)

router = APIRouter()


def _billing_tz() -> ZoneInfo:
    return parse_billing_timezone(settings.INVOICE_CRON_TIMEZONE)


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

    period_start, period_end = get_month_range(billing_period, _billing_tz())

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


@router.post(
    "/admin/generate-monthly",
    response_model=WebResponse[MonthlyInvoiceGenerateResponse],
    status_code=status.HTTP_200_OK,
)
def admin_generate_monthly_invoices(
    body: MonthlyInvoiceGenerateBody,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """
    Fail-safe / uji coba: jalankan logika yang sama dengan cron (per siswa, commit terpisah).
    Hanya superadmin. `dry_run=true` tidak menulis database.
    """
    if not has_superadmin_role(current_user, db):
        raise ForbiddenException("Hanya superadmin yang dapat menjalankan generate invoice bulanan.")

    if body.billing_period is not None:
        bp = body.billing_period
        if bp.day != 1:
            raise BadRequestException("billing_period harus tanggal 1 (awal bulan).")
    else:
        bp = first_day_of_previous_calendar_month(datetime.now(_billing_tz()).date())

    summary = generate_monthly_invoices(
        db,
        billing_period=bp,
        dry_run=body.dry_run,
        created_by=current_user.id,
    )

    payload = MonthlyInvoiceGenerateResponse(
        billing_period=summary.billing_period,
        dry_run=summary.dry_run,
        students_created=summary.students_created,
        students_skipped=summary.students_skipped,
        students_errors=summary.students_errors,
        students_dry_run=summary.students_dry_run,
        outcomes=[
            MonthlyInvoiceStudentOutcomeRead(
                student_id=o.student_id,
                outcome=o.outcome,
                invoice_id=o.invoice_id,
                orders_count=o.orders_count,
                total_amount=o.total_amount,
                detail=o.detail,
            )
            for o in summary.outcomes
        ],
    )

    return WebResponse(
        status="success",
        message="Generate invoice bulanan selesai."
        if not body.dry_run
        else "Simulasi (dry run) selesai — tidak ada perubahan database.",
        data=payload,
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

    period_start, period_end = get_month_range(invoice_create.billing_period, _billing_tz())

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

