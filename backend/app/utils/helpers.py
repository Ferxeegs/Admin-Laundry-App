"""
Helper utility functions.
"""
from typing import Any, Dict
from datetime import datetime


def format_datetime(dt: datetime) -> str:
    """Format datetime to ISO format string."""
    return dt.isoformat() if dt else None


def remove_none_values(data: Dict[str, Any]) -> Dict[str, Any]:
    """Remove None values from dictionary."""
    return {k: v for k, v in data.items() if v is not None}

