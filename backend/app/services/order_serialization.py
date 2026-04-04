"""Serialize Order ORM → Pydantic (hindari validasi nested ORM untuk addons / trackings)."""

from __future__ import annotations

from app.models.order import Order, OrderAddon
from app.schemas.order import (
    OrderAddonRead,
    OrderRead,
    OrderTrackingRead,
    OrderWithTrackingRead,
)


def order_addon_total(order: Order) -> float:
    return float(sum(float(oa.price) * oa.count for oa in (order.addons or [])))


def serialize_order_addon(oa: OrderAddon) -> OrderAddonRead:
    name = oa.addon.name if oa.addon is not None else ""
    price = float(oa.price)
    cnt = int(oa.count)
    return OrderAddonRead(
        id=oa.id,
        addon_id=oa.addon_id,
        name=name,
        price=price,
        count=cnt,
        subtotal=price * cnt,
    )


def serialize_order_read(order: Order) -> OrderRead:
    payload = {
        "id": order.id,
        "student_id": order.student_id,
        "invoice_id": order.invoice_id,
        "total_items": order.total_items,
        "free_items_used": order.free_items_used,
        "paid_items_count": order.paid_items_count,
        "additional_fee": float(order.additional_fee),
        "notes": order.notes,
        "order_number": order.order_number,
        "current_status": order.current_status,
        "created_at": order.created_at,
        "updated_at": order.updated_at,
        "created_by": order.created_by,
        "updated_by": order.updated_by,
        "addons": [serialize_order_addon(oa).model_dump() for oa in (order.addons or [])],
        "total_addon_fee": order_addon_total(order),
    }
    return OrderRead.model_validate(payload)


def serialize_order_with_tracking(order: Order) -> OrderWithTrackingRead:
    base = serialize_order_read(order).model_dump()
    trackings = order.trackings or []
    base["trackings"] = [
        OrderTrackingRead.model_validate(t).model_dump() for t in trackings
    ]
    return OrderWithTrackingRead.model_validate(base)
