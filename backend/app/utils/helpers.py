"""
Helper utility functions.
"""
import secrets
import hashlib
import re
from typing import Any, Dict, Optional
from datetime import datetime


def format_datetime(dt: datetime) -> str:
    """Format datetime to ISO format string."""
    return dt.isoformat() if dt else None


def remove_none_values(data: Dict[str, Any]) -> Dict[str, Any]:
    """Remove None values from dictionary."""
    return {k: v for k, v in data.items() if v is not None}


def generate_unique_code(dormitory: Optional[str], grade_level: Optional[str], fullname: str) -> str:
    """
    Generate unique code from dormitory, grade_level, and fullname.
    Format: ASR-KLS-NAM (shortened version)
    
    Args:
        dormitory: Asrama name (optional)
        grade_level: Kelas name (optional)
        fullname: Full name of student
        
    Returns:
        Unique code string (e.g., "ASR1-X-ABD")
    """
    # Helper function to get abbreviation from string
    def abbreviate(text: str, max_length: int = 3) -> str:
        if not text:
            return ""
        # Remove special characters and spaces, convert to uppercase
        cleaned = re.sub(r'[^a-zA-Z0-9]', '', text.upper())
        if len(cleaned) <= max_length:
            return cleaned
        # Take first max_length characters
        return cleaned[:max_length]
    
    # Get abbreviations
    asrama_abbr = abbreviate(dormitory or "", 3) or "XXX"
    # Kelas tetap penuh, tidak disingkat
    kelas_full = (grade_level or "").strip().upper() or "X"
    # Remove special characters from kelas but keep it full
    kelas_clean = re.sub(r'[^a-zA-Z0-9\s]', '', kelas_full).strip() or "X"
    
    # For name, take first letter of each word (max 3 words)
    name_parts = fullname.split()[:3]
    name_abbr = "".join([part[0].upper() for part in name_parts if part])[:3]
    if not name_abbr:
        # Fallback: take first 3 characters of fullname
        name_abbr = abbreviate(fullname, 3) or "XXX"
    
    # Combine: ASR-KELAS-NAM (kelas tetap penuh)
    unique_code = f"{asrama_abbr}-{kelas_clean}-{name_abbr}"
    
    return unique_code


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


def ensure_unique_code_uniqueness(base_code: str, db, Student, exclude_id: Optional[str] = None) -> str:
    """
    Ensure unique_code is unique by appending number if needed.
    
    Args:
        base_code: Base unique code
        db: Database session
        Student: Student model class
        exclude_id: Student ID to exclude from check (for updates)
        
    Returns:
        Unique code that doesn't exist in database
    """
    unique_code = base_code
    counter = 1
    
    while True:
        query = db.query(Student).filter(
            Student.unique_code == unique_code,
            Student.deleted_at.is_(None)
        )
        
        if exclude_id:
            query = query.filter(Student.id != exclude_id)
        
        existing = query.first()
        
        if not existing:
            break
        
        # Append counter to make it unique
        unique_code = f"{base_code}-{counter}"
        counter += 1
        
        # Safety limit
        if counter > 999:
            # Fallback: add random suffix
            random_suffix = secrets.token_hex(2).upper()
            unique_code = f"{base_code}-{random_suffix}"
            break
    
    return unique_code

