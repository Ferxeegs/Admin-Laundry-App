"""Master data addon (layanan tambahan)."""

from datetime import datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict, field_validator


class AddonBase(BaseModel):
    name: str
    price: float
    description: Optional[str] = None
    is_active: bool = True

    @field_validator("name")
    @classmethod
    def name_strip(cls, v: str) -> str:
        t = v.strip()
        if not t:
            raise ValueError("Nama addon wajib diisi")
        return t

    @field_validator("price")
    @classmethod
    def price_non_negative(cls, v: float) -> float:
        if v < 0:
            raise ValueError("Harga tidak boleh negatif")
        return v


class AddonCreate(AddonBase):
    pass


class AddonUpdate(BaseModel):
    name: Optional[str] = None
    price: Optional[float] = None
    description: Optional[str] = None
    is_active: Optional[bool] = None

    @field_validator("name")
    @classmethod
    def name_strip_opt(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return None
        t = v.strip()
        if not t:
            raise ValueError("Nama tidak boleh kosong")
        return t

    @field_validator("price")
    @classmethod
    def price_opt(cls, v: Optional[float]) -> Optional[float]:
        if v is None:
            return None
        if v < 0:
            raise ValueError("Harga tidak boleh negatif")
        return v


class AddonRead(AddonBase):
    id: str
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)
