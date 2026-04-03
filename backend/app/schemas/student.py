"""
Student schemas for API requests and responses.
"""
from pydantic import BaseModel, ConfigDict, field_validator
from typing import Optional
from datetime import datetime


class StudentBase(BaseModel):
    """Base schema for Student with common fields."""
    student_number: str
    fullname: str
    phone_number: Optional[str] = None
    guardian_name: Optional[str] = None
    is_active: bool = True

    @field_validator('student_number')
    @classmethod
    def validate_student_number(cls, v: str) -> str:
        if not v or len(v.strip()) == 0:
            raise ValueError('Student number is required')
        return v.strip()

    @field_validator('fullname')
    @classmethod
    def validate_fullname(cls, v: str) -> str:
        if not v or len(v.strip()) < 2:
            raise ValueError('Fullname must be at least 2 characters')
        return v.strip()


class StudentCreate(StudentBase):
    """Schema for creating a new student."""
    pass


class StudentUpdate(BaseModel):
    """Schema for updating a student."""
    student_number: Optional[str] = None
    fullname: Optional[str] = None
    phone_number: Optional[str] = None
    guardian_name: Optional[str] = None
    is_active: Optional[bool] = None

    @field_validator('student_number')
    @classmethod
    def validate_student_number(cls, v: Optional[str]) -> Optional[str]:
        if v is not None and len(v.strip()) == 0:
            raise ValueError('Student number cannot be empty')
        return v.strip() if v else v

    @field_validator('fullname')
    @classmethod
    def validate_fullname(cls, v: Optional[str]) -> Optional[str]:
        if v is not None and len(v.strip()) < 2:
            raise ValueError('Fullname must be at least 2 characters')
        return v.strip() if v else v


class StudentRead(StudentBase):
    """Schema for reading student data."""
    id: str
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None
    deleted_at: Optional[datetime] = None
    created_by: Optional[str] = None
    deleted_by: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)
