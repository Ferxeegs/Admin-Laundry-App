"""Schemas for batch / scheduled monthly invoice generation."""

from __future__ import annotations

from datetime import date

from pydantic import BaseModel, Field


class MonthlyInvoiceGenerateBody(BaseModel):
    """Admin trigger: same core logic as cron, optional dry-run."""

    billing_period: date | None = Field(
        default=None,
        description="Tanggal 1 bulan yang ditagih (mis. 2026-02-01). Kosongkan = bulan kalender sebelumnya (sesuai timezone cron).",
    )
    dry_run: bool = Field(
        default=False,
        description="Jika true, hanya simulasi: tidak menulis ke database.",
    )


class MonthlyInvoiceStudentOutcomeRead(BaseModel):
    student_id: str
    outcome: str
    invoice_id: str | None = None
    orders_count: int = 0
    total_amount: float = 0.0
    detail: str | None = None


class MonthlyInvoiceGenerateResponse(BaseModel):
    billing_period: date
    dry_run: bool
    students_created: int
    students_skipped: int
    students_errors: int
    students_dry_run: int = 0
    outcomes: list[MonthlyInvoiceStudentOutcomeRead]
