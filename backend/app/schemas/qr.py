"""
QR Code schemas for API requests and responses.
"""
from pydantic import BaseModel, ConfigDict, field_validator
from typing import Optional
from datetime import datetime


class QRBase(BaseModel):
    """Base schema for QR with common fields."""
    token_qr: str
    dormitory: Optional[str] = None
    qr_number: Optional[str] = None
    unique_code: Optional[str] = None

    @field_validator('token_qr')
    @classmethod
    def validate_token_qr(cls, v: str) -> str:
        if not v or len(v.strip()) == 0:
            raise ValueError('Token QR is required')
        return v.strip()


class QRCreate(QRBase):
    """Schema for creating a new QR code."""
    pass


class QRUpdate(BaseModel):
    """Schema for updating a QR code."""
    dormitory: Optional[str] = None
    qr_number: Optional[str] = None
    unique_code: Optional[str] = None


class QRRead(QRBase):
    """Schema for reading QR data."""
    id: str
    student_id: Optional[str] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    # Nested student info (when QR is assigned)
    student: Optional[dict] = None

    model_config = ConfigDict(from_attributes=True)


class QRAssign(BaseModel):
    """Schema for assigning a QR to a student."""
    student_id: str

    @field_validator('student_id')
    @classmethod
    def validate_student_id(cls, v: str) -> str:
        if not v or len(v.strip()) == 0:
            raise ValueError('Student ID is required')
        return v.strip()


class QRBulkGenerate(BaseModel):
    """
    Bulk-generate QR codes for a dormitory.

    - token_qr will be generated automatically
    - qr_number will be sequential per dormitory, starting from 1
      (or max(existing)+1 when appending)
    - unique_code will be generated as: {3-letter dormitory prefix}-{qr_number}
    """

    dormitory: str
    count: int

    @field_validator("dormitory")
    @classmethod
    def validate_dormitory(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("Dormitory is required")
        return v

    @field_validator("count")
    @classmethod
    def validate_count(cls, v: int) -> int:
        if v < 1:
            raise ValueError("Count must be at least 1")
        # Reasonable safety to avoid accidental huge inserts
        if v > 5000:
            raise ValueError("Count too large (max 5000)")
        return v
