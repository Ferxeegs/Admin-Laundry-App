"""
API dependencies (re-export from core for convenience).
"""
from app.core.dependencies import (
    get_db,
    get_current_user,
    get_current_active_user
)

__all__ = [
    "get_db",
    "get_current_user",
    "get_current_active_user"
]

