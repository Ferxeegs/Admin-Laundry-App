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
    deleted_only: bool = Query(False, description="Hanya addon yang dihapus"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    if deleted_only:
        q = db.query(Addon).filter(Addon.deleted_at.is_not(None))
    else:
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
    current_user: User = Depends(require_permission("create_addon")),
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
    current_user: User = Depends(require_permission("update_addon")),
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


@router.delete("/{addon_id}", response_model=WebResponse[None])
def delete_addon(
    addon_id: str,
    force: bool = False,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("delete_addon")),
):
    row = db.query(Addon).filter(Addon.id == addon_id).first()
    if not row:
        raise NotFoundException("Addon tidak ditemukan")
    
    if force:
        db.delete(row)
        message = "Addon berhasil dihapus permanen"
    else:
        if row.deleted_at is not None:
            raise BadRequestException("Addon sudah di tong sampah. Gunakan force=true untuk menghapus permanen.")
        
        from app.utils.helpers import get_now_local
        row.deleted_at = get_now_local()
        row.deleted_by = current_user.id
        message = "Addon berhasil dihapus"
    
    db.commit()
    
    return WebResponse(
        status="success",
        message=message,
        data=None,
    )


@router.post("/{addon_id}/restore", response_model=WebResponse[AddonRead])
def restore_addon(
    addon_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("update_addon")),
):
    row = db.query(Addon).filter(Addon.id == addon_id).first()
    if not row:
        raise NotFoundException("Addon tidak ditemukan")
    
    row.deleted_at = None
    row.deleted_by = None
    db.commit()
    db.refresh(row)
    
    return WebResponse(
        status="success",
        message="Addon berhasil dipulihkan",
        data=AddonRead.model_validate(row),
    )
