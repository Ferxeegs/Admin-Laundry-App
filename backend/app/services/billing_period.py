"""Billing calendar: one full local month → UTC window for Order.created_at."""

from __future__ import annotations

from datetime import date, datetime, timezone
from zoneinfo import ZoneInfo


def parse_billing_timezone(tz_name: str) -> ZoneInfo:
    """IANA zone for invoice month boundaries; invalid names fall back to UTC."""
    try:
        return ZoneInfo(tz_name)
    except Exception:
        return ZoneInfo("UTC")


def get_month_range(billing_period: date, tz: ZoneInfo) -> tuple[datetime, datetime]:
    """
    billing_period: tanggal 1 bulan yang ditagih (mis. 2026-02-01 = tagihan Februari).

    Mengembalikan [period_start, period_end) dalam **UTC timezone-aware**,
    setara dengan satu bulan kalender penuh di zona `tz`:
    - period_start = 00:00:00 tanggal 1 bulan tersebut di `tz`
    - period_end   = 00:00:00 tanggal 1 bulan berikutnya di `tz`

    Dipakai agar konsisten dengan cron (tanggal 1 di timezone yang sama) dan
    agar order di ujung malam/minggu lokal masuk ke bulan yang benar.
    """
    if billing_period.day != 1:
        raise ValueError("billing_period must be the first day of a month")

    start_local = datetime(
        billing_period.year, billing_period.month, 1, 0, 0, 0, tzinfo=tz
    )
    if billing_period.month == 12:
        end_local = datetime(billing_period.year + 1, 1, 1, 0, 0, 0, tzinfo=tz)
    else:
        end_local = datetime(
            billing_period.year, billing_period.month + 1, 1, 0, 0, 0, tzinfo=tz
        )
    return start_local.astimezone(timezone.utc), end_local.astimezone(timezone.utc)


def first_day_of_previous_calendar_month(reference: date) -> date:
    """reference 2026-03-15 → 2026-02-01 (bulan kalender sebelum bulan reference)."""
    y, m = reference.year, reference.month
    if m == 1:
        return date(y - 1, 12, 1)
    return date(y, m - 1, 1)
