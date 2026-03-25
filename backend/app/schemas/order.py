"""
Order schemas for API requests and responses.
"""
from datetime import datetime
from typing import Optional, List

from pydantic import BaseModel, ConfigDict, field_validator

from app.models.order import OrderStatus


class OrderBase(BaseModel):
    """Base schema for Order with common fields."""
    student_id: str
    total_items: int = 0
    free_items_used: int = 0
    paid_items_count: int = 0
    additional_fee: float = 0.0
    notes: Optional[str] = None

    @field_validator("total_items")
    @classmethod
    def validate_total_items(cls, v: int) -> int:
        if v < 0:
            raise ValueError("Total items must be >= 0")
        return v

    @field_validator("free_items_used", "paid_items_count")
    @classmethod
    def validate_item_counts(cls, v: int) -> int:
        if v < 0:
            raise ValueError("Item count must be >= 0")
        return v

    @field_validator("additional_fee")
    @classmethod
    def validate_additional_fee(cls, v: float) -> float:
        if v < 0:
            raise ValueError("Additional fee must be >= 0")
        return v


class OrderCreate(BaseModel):
    """Schema for creating a new order. Staff only inputs total_items, system calculates the rest."""
    student_id: str
    total_items: int
    notes: Optional[str] = None

    @field_validator("total_items")
    @classmethod
    def validate_total_items(cls, v: int) -> int:
        if v <= 0:
            raise ValueError("Total items must be > 0")
        return v


class OrderUpdate(BaseModel):
    """Schema for updating an order (not status tracking). Staff only inputs total_items, system calculates the rest."""
    total_items: Optional[int] = None
    notes: Optional[str] = None

    @field_validator("total_items")
    @classmethod
    def validate_total_items(cls, v: Optional[int]) -> Optional[int]:
        if v is not None and v <= 0:
            raise ValueError("Total items must be > 0")
        return v


class OrderRead(OrderBase):
    """Schema for reading order data."""
    id: str
    order_number: str
    current_status: OrderStatus
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None
    created_by: Optional[str] = None
    updated_by: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)


class OrderCreated(OrderRead):
    """Response after POST /orders/; includes images queued for async persistence."""
    images_queued: int = 0


class OrderTrackingBase(BaseModel):
    """Base schema for order tracking."""
    status_to: str
    notes: Optional[str] = None


class OrderTrackingCreate(OrderTrackingBase):
    """Schema to create new tracking entry and update order status."""
    pass


class OrderTrackingRead(OrderTrackingBase):
    """Schema for reading order tracking data."""
    id: str
    order_id: str
    staff_id: Optional[str] = None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class OrderWithTrackingRead(OrderRead):
    """Order with tracking history."""
    trackings: List[OrderTrackingRead] = []


