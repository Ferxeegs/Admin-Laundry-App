"""
QR Code schemas for API requests and responses.
"""
from pydantic import BaseModel, ConfigDict, field_validator
from typing import Optional
from datetime import datetime


class ColorBase(BaseModel):
    """Base schema for Color."""
    name: str
    color_code: Optional[str] = None

class ColorCreate(ColorBase):
    """Schema for creating a new Color."""
    pass

class ColorUpdate(BaseModel):
    """Schema for updating a Color."""
    name: Optional[str] = None
    color_code: Optional[str] = None

class ColorRead(ColorBase):
    """Schema for reading Color data."""
    id: str
    model_config = ConfigDict(from_attributes=True)

class QRBase(BaseModel):
    """Base schema for QR with common fields."""
    token_qr: str
    dormitory: Optional[str] = None
    color: Optional[str] = None
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
    color_id: Optional[str] = None


class QRUpdate(BaseModel):
    """Schema for updating a QR code."""
    dormitory: Optional[str] = None
    color: Optional[str] = None
    color_id: Optional[str] = None
    qr_number: Optional[str] = None
    unique_code: Optional[str] = None


class QRRead(QRBase):
    """Schema for reading QR data."""
    id: str
    student_id: Optional[str] = None
    color_id: Optional[str] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    # Nested info
    student: Optional[dict] = None
    color_details: Optional[ColorRead] = None

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
    """

    dormitory: str
    color_id: Optional[str] = None
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
