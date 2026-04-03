from pydantic import BaseModel, ConfigDict, field_validator
from typing import Optional
from datetime import datetime


class DormitoryBase(BaseModel):
    name: str
    description: Optional[str] = None

    @field_validator("name")
    @classmethod
    def validate_name(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("Dormitory name is required")
        return v


class DormitoryCreate(DormitoryBase):
    pass


class DormitoryUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None

    @field_validator("name")
    @classmethod
    def validate_name(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return v
        v = v.strip()
        if not v:
            raise ValueError("Dormitory name cannot be empty")
        return v


class DormitoryRead(DormitoryBase):
    id: str
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    # audit fields
    created_by: Optional[str] = None
    updated_by: Optional[str] = None
    deleted_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)

