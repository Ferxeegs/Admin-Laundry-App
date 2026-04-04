"""Menulis baris OrderAddon dari input user (snapshot harga dari master Addon)."""

from __future__ import annotations

import uuid
from collections import defaultdict
from typing import Iterable, List

from sqlalchemy.orm import Session

from app.core.exceptions import BadRequestException
from app.models.order import Addon, Order, OrderAddon
from app.schemas.order import OrderAddonLineInput


def _merged_counts(lines: Iterable[OrderAddonLineInput]) -> dict[str, int]:
    counts: dict[str, int] = defaultdict(int)
    for line in lines:
        aid = line.addon_id.strip()
        counts[aid] += line.count
    return dict(counts)


def apply_order_addon_lines(
    db: Session,
    order: Order,
    lines: List[OrderAddonLineInput],
) -> None:
    if not lines:
        return
    merged = _merged_counts(lines)
    for addon_id, cnt in merged.items():
        addon = (
            db.query(Addon)
            .filter(Addon.id == addon_id, Addon.deleted_at.is_(None))
            .first()
        )
        if addon is None:
            raise BadRequestException(f"Addon tidak ditemukan: {addon_id}")
        if not addon.is_active:
            raise BadRequestException(f"Addon tidak aktif: {addon.name}")
        db.add(
            OrderAddon(
                id=str(uuid.uuid4()),
                order_id=order.id,
                addon_id=addon.id,
                price=addon.price,
                count=cnt,
            )
        )


def replace_order_addon_lines(
    db: Session,
    order: Order,
    lines: List[OrderAddonLineInput],
) -> None:
    db.query(OrderAddon).filter(OrderAddon.order_id == order.id).delete(
        synchronize_session=False
    )
    db.flush()
    apply_order_addon_lines(db, order, lines)


def parse_addon_lines_from_json(raw: str | None) -> List[OrderAddonLineInput]:
    """Parse form field `addon_lines` (JSON array of {addon_id, count})."""
    if not raw or not str(raw).strip():
        return []
    import json

    try:
        data = json.loads(str(raw))
    except json.JSONDecodeError as e:
        raise BadRequestException(f"addon_lines JSON tidak valid: {e}") from e
    if not isinstance(data, list):
        raise BadRequestException("addon_lines harus berupa array JSON")
    out: List[OrderAddonLineInput] = []
    for i, item in enumerate(data):
        if not isinstance(item, dict):
            raise BadRequestException(f"addon_lines[{i}] harus berupa object")
        aid = item.get("addon_id")
        if not aid:
            raise BadRequestException(f"addon_lines[{i}].addon_id wajib")
        cnt = item.get("count", 1)
        try:
            cnt_int = int(cnt)
        except (TypeError, ValueError):
            raise BadRequestException(f"addon_lines[{i}].count harus angka") from None
        out.append(OrderAddonLineInput(addon_id=str(aid), count=cnt_int))
    return out
