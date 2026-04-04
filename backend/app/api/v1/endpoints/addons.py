"""Master data addon (layanan tambahan pada order)."""

from fastapi import APIRouter, Depends, Query, status

from sqlalchemy.orm import Session

from app.api.deps import get_db, get_current_active_user
from app.core.deps_permission import require_permission
from app.core.exceptions import NotFoundException
from app.models.auth import User
from app.models.order import Addon
from app.schemas.addon import AddonCreate, AddonRead, AddonUpdate
from app.schemas.common import WebResponse
from app.utils.helpers import get_now_local

router = APIRouter()


@router.get("/", response_model=WebResponse[dict])
def list_addons(
    page: int = Query(1, ge=1),
    limit: int = Query(100, ge=1, le=500),
    active_only: bool = Query(True, description="Hanya addon aktif"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    q = db.query(Addon).filter(Addon.deleted_at.is_(None))
    if active_only:
        q = q.filter(Addon.is_active.is_(True))
    total = q.count()
    offset = (page - 1) * limit
    rows = q.order_by(Addon.name.asc()).offset(offset).limit(limit).all()
    total_pages = (total + limit - 1) // limit if limit > 0 else 0
    return WebResponse(
        status="success",
        data={
            "addons": [AddonRead.model_validate(a).model_dump() for a in rows],
            "pagination": {
                "page": page,
                "limit": limit,
                "total": total,
                "totalPages": total_pages,
            },
        },
    )


@router.post(
    "/",
    response_model=WebResponse[AddonRead],
    status_code=status.HTTP_201_CREATED,
)
def create_addon(
    body: AddonCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("update_order")),
):
    import uuid

    row = Addon(
        id=str(uuid.uuid4()),
        name=body.name,
        price=body.price,
        description=body.description,
        is_active=body.is_active,
        created_by=current_user.id,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return WebResponse(
        status="success",
        message="Addon berhasil dibuat",
        data=AddonRead.model_validate(row),
    )


@router.put("/{addon_id}", response_model=WebResponse[AddonRead])
def update_addon(
    addon_id: str,
    body: AddonUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("update_order")),
):
    row = db.query(Addon).filter(Addon.id == addon_id, Addon.deleted_at.is_(None)).first()
    if not row:
        raise NotFoundException("Addon tidak ditemukan")
    data = body.model_dump(exclude_unset=True)
    for k, v in data.items():
        setattr(row, k, v)
    row.updated_by = current_user.id
    row.updated_at = get_now_local()
    db.commit()
    db.refresh(row)
    return WebResponse(
        status="success",
        message="Addon diperbarui",
        data=AddonRead.model_validate(row),
    )
