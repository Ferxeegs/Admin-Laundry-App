"""
Batch monthly invoice generation (cron + manual admin).

One transaction per student: create invoice + attach orders, then commit.
Failures for one student do not roll back other students.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from datetime import date
from typing import Literal

from sqlalchemy.orm import Session, joinedload

from app.models.invoice import Invoice, InvoiceStatus
from app.models.order import Order, OrderAddon
from app.core.config import settings
from app.services.billing_period import get_month_range, parse_billing_timezone
from app.services.order_serialization import order_addon_total

logger = logging.getLogger(__name__)

Outcome = Literal[
    "created",
    "dry_run_preview",
    "skipped_no_orders",
    "skipped_existing_invoice",
    "error",
]


def _order_line_total(order: Order) -> float:
    return float(order.additional_fee) + order_addon_total(order)


@dataclass
class StudentInvoiceOutcome:
    student_id: str
    outcome: Outcome
    invoice_id: str | None = None
    orders_count: int = 0
    total_amount: float = 0.0
    detail: str | None = None


@dataclass
class MonthlyInvoiceGenerationResult:
    billing_period: date
    dry_run: bool
    outcomes: list[StudentInvoiceOutcome] = field(default_factory=list)
    students_created: int = 0
    students_skipped: int = 0
    students_errors: int = 0
    students_dry_run: int = 0


def generate_monthly_invoices(
    db: Session,
    *,
    billing_period: date,
    dry_run: bool = False,
    created_by: str | None = None,
) -> MonthlyInvoiceGenerationResult:
    """
    For each student with eligible orders (invoice_id NULL, created_at in billing month):
    create one UNPAID invoice and set orders.invoice_id.

    billing_period must be the first day of a month (e.g. 2026-02-01).

    Order window: one full calendar month in ``settings.INVOICE_CRON_TIMEZONE`` (same as
    cron), converted to UTC for ``Order.created_at`` comparison: ``[start, end)``.

    If an invoice already exists for (student_id, billing_period), that student is skipped
    (idempotent / safe for re-runs after partial failure).
    """
    if billing_period.day != 1:
        raise ValueError("billing_period must be the first day of a month")

    bill_tz = parse_billing_timezone(settings.INVOICE_CRON_TIMEZONE)
    period_start, period_end = get_month_range(billing_period, bill_tz)

    orders: list[Order] = (
        db.query(Order)
        .options(joinedload(Order.addons).joinedload(OrderAddon.addon))
        .filter(
            Order.invoice_id.is_(None),
            Order.created_at >= period_start,
            Order.created_at < period_end,
        )
        .order_by(Order.student_id.asc(), Order.created_at.asc())
        .all()
    )

    by_student: dict[str, list[Order]] = {}
    for o in orders:
        by_student.setdefault(o.student_id, []).append(o)

    result = MonthlyInvoiceGenerationResult(billing_period=billing_period, dry_run=dry_run)

    for student_id, student_orders in sorted(by_student.items(), key=lambda x: x[0]):
        total_amount = sum(_order_line_total(o) for o in student_orders)
        n = len(student_orders)

        existing = (
            db.query(Invoice)
            .filter(
                Invoice.student_id == student_id,
                Invoice.billing_period == billing_period,
            )
            .first()
        )
        if existing is not None:
            result.outcomes.append(
                StudentInvoiceOutcome(
                    student_id=student_id,
                    outcome="skipped_existing_invoice",
                    invoice_id=existing.id,
                    orders_count=n,
                    total_amount=total_amount,
                    detail="Invoice already exists for this student and billing_period",
                )
            )
            result.students_skipped += 1
            continue

        if dry_run:
            result.outcomes.append(
                StudentInvoiceOutcome(
                    student_id=student_id,
                    outcome="dry_run_preview",
                    orders_count=n,
                    total_amount=total_amount,
                )
            )
            result.students_dry_run += 1
            continue

        try:
            sequence = (
                db.query(Invoice).filter(Invoice.billing_period == billing_period).count() + 1
            )
            invoice_number = (
                f"INV/{billing_period.year}/{billing_period.month:02d}/{sequence:03d}"
            )
            inv = Invoice(
                student_id=student_id,
                billing_period=billing_period,
                invoice_number=invoice_number,
                total_amount=total_amount,
                status=InvoiceStatus.UNPAID,
                created_by=created_by,
            )
            db.add(inv)
            db.flush()

            for o in student_orders:
                o.invoice_id = inv.id

            db.commit()
            db.refresh(inv)

            result.outcomes.append(
                StudentInvoiceOutcome(
                    student_id=student_id,
                    outcome="created",
                    invoice_id=inv.id,
                    orders_count=n,
                    total_amount=total_amount,
                )
            )
            result.students_created += 1
            logger.info(
                "Monthly invoice created student_id=%s invoice_id=%s period=%s orders=%s",
                student_id,
                inv.id,
                billing_period.isoformat(),
                n,
            )
        except Exception as exc:  # noqa: BLE001 — log and isolate per student
            db.rollback()
            logger.exception(
                "Monthly invoice failed for student_id=%s period=%s: %s",
                student_id,
                billing_period.isoformat(),
                exc,
            )
            result.outcomes.append(
                StudentInvoiceOutcome(
                    student_id=student_id,
                    outcome="error",
                    orders_count=n,
                    total_amount=total_amount,
                    detail=str(exc),
                )
            )
            result.students_errors += 1

    return result


def run_scheduled_monthly_generation() -> None:
    """
    APScheduler entry (opens its own DB session).

    Intended to run at **day=1, 00:00** in ``INVOICE_CRON_TIMEZONE``. Uses *today's* date
    in that zone, takes the **previous calendar month's** first day as ``billing_period``,
    then attaches all orders with ``invoice_id`` NULL whose ``created_at`` falls in that
    full month (month boundaries in the same timezone).
    """
    from datetime import datetime

    from app.core.config import settings
    from app.db.session import SessionLocal
    from app.services.billing_period import (
        first_day_of_previous_calendar_month,
        parse_billing_timezone,
    )

    if not settings.INVOICE_CRON_ENABLED:
        return

    bill_tz = parse_billing_timezone(settings.INVOICE_CRON_TIMEZONE)
    today_local = datetime.now(bill_tz).date()
    billing_period = first_day_of_previous_calendar_month(today_local)

    db = SessionLocal()
    try:
        summary = generate_monthly_invoices(
            db,
            billing_period=billing_period,
            dry_run=False,
            created_by=None,
        )
        logger.info(
            "Scheduled monthly invoices period=%s created=%s skipped=%s errors=%s",
            billing_period.isoformat(),
            summary.students_created,
            summary.students_skipped,
            summary.students_errors,
        )
    finally:
        db.close()
