"""
Helper utility functions.
"""
import secrets
from typing import Any, Dict, Optional
from datetime import datetime, timezone, timedelta
from zoneinfo import ZoneInfo


def get_now_local() -> datetime:
    """Get current datetime in Asia/Jakarta (WIB) timezone."""
    try:
        return datetime.now(ZoneInfo("Asia/Jakarta"))
    except Exception:
        # Fallback to UTC+7 if ZoneInfo fails
        return datetime.now(timezone.utc) + timedelta(hours=7)


def get_start_of_day_local(dt: Optional[datetime] = None) -> datetime:
    """
    Get 00:00:00 of the given datetime (or now) in local timezone.
    Returns a timezone-aware datetime.
    """
    if dt is None:
        dt = get_now_local()
    
    # If dt is not aware, assume it is local or convert to local
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=ZoneInfo("Asia/Jakarta"))
    
    return dt.replace(hour=0, minute=0, second=0, microsecond=0)


def get_start_of_week_local_monday(dt: Optional[datetime] = None) -> datetime:
    """
    Monday 00:00:00 Asia/Jakarta for the week containing `dt` (ISO week: Mon–Sun).
    Quota resets at this instant (when Sunday becomes Monday in WIB).
    """
    if dt is None:
        dt = get_now_local()
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=ZoneInfo("Asia/Jakarta"))
    day_start = get_start_of_day_local(dt)
    return day_start - timedelta(days=day_start.weekday())


def get_week_range_local_monday(dt: Optional[datetime] = None) -> tuple[datetime, datetime]:
    """Return (week_start_monday_00:00, next_monday_00:00) in Asia/Jakarta."""
    start = get_start_of_week_local_monday(dt)
    return start, start + timedelta(days=7)


def format_datetime(dt: datetime) -> Optional[str]:
    """Format datetime to ISO format string."""
    return dt.isoformat() if dt else None


def remove_none_values(data: Dict[str, Any]) -> Dict[str, Any]:
    """Remove None values from dictionary."""
    return {k: v for k, v in data.items() if v is not None}


def generate_qr_code_token() -> str:
    """
    Generate a secure random token for QR code.
    Uses secrets module for cryptographically strong random tokens.
    
    Returns:
        Secure random token string (32 characters, URL-safe)
    """
    # Generate a secure random token (32 bytes = 43 characters in base64)
    token = secrets.token_urlsafe(32)
    
    # Add a prefix to make it identifiable as QR code
    # Format: QR-<token>
    return f"QR-{token}"
