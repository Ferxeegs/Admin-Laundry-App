"""
Dormitory management endpoints.
"""

from typing import Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from sqlalchemy import or_
from sqlalchemy.exc import IntegrityError

from app.api.deps import get_db, get_current_active_user
from app.models.auth import User
from app.models.order import Dormitory
from app.schemas.common import WebResponse
from app.schemas.dormitory import DormitoryRead, DormitoryCreate, DormitoryUpdate
from app.core.exceptions import NotFoundException, ConflictException

router = APIRouter()


@router.get("/", response_model=WebResponse[dict])
def get_all_dormitories(
    page: int = Query(1, ge=1),
    limit: int = Query(10, ge=1, le=100),
    search: Optional[str] = Query(None),
    db: Session = Depends(get_db),
):
    query = db.query(Dormitory)

    # Optional soft-delete filtering if AuditMixin is used
    if hasattr(Dormitory, "deleted_at"):
        query = query.filter(Dormitory.deleted_at.is_(None))

    if search:
        term = f"%{search}%"
        query = query.filter(
            or_(
                Dormitory.name.ilike(term),
                Dormitory.description.ilike(term),
            )
        )

    total = query.count()
    offset = (page - 1) * limit
    dorms = (
        query.order_by(Dormitory.created_at.desc())
        .offset(offset)
        .limit(limit)
        .all()
    )

    total_pages = (total + limit - 1) // limit if limit > 0 else 0

    return WebResponse(
        status="success",
        data={
            "dormitories": [
                DormitoryRead.model_validate(d).model_dump() for d in dorms
            ],
            "pagination": {
                "page": page,
                "limit": limit,
                "total": total,
                "totalPages": total_pages,
            },
        },
    )


@router.post("/", response_model=WebResponse[dict])
def create_dormitory(
    dormitory_data: DormitoryCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    existing = db.query(Dormitory).filter(Dormitory.name == dormitory_data.name).first()
    if existing:
        raise ConflictException(f"Dormitory '{dormitory_data.name}' already exists")

    dorm = Dormitory(
        name=dormitory_data.name,
        description=dormitory_data.description,
        created_by=current_user.id,
        updated_by=current_user.id,
    )
    db.add(dorm)
    db.commit()
    db.refresh(dorm)

    return WebResponse(
        status="success",
        message="Dormitory created successfully",
        data=DormitoryRead.model_validate(dorm).model_dump(),
    )


@router.put("/{dormitory_id}", response_model=WebResponse[dict])
def update_dormitory(
    dormitory_id: str,
    dormitory_update: DormitoryUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    dorm = db.query(Dormitory).filter(Dormitory.id == dormitory_id).first()
    if not dorm:
        raise NotFoundException(f"Dormitory '{dormitory_id}' not found")

    # Prevent unique `name` constraint collisions on update.
    # (Create flow already checks this explicitly.)
    if dormitory_update.name is not None:
        existing = (
            db.query(Dormitory)
            .filter(Dormitory.name == dormitory_update.name, Dormitory.id != dormitory_id)
            .first()
        )
        if existing:
            raise ConflictException(f"Dormitory '{dormitory_update.name}' already exists")

    update_data = dormitory_update.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(dorm, field, value)

    dorm.updated_by = current_user.id
    try:
        db.commit()
    except IntegrityError as e:
        # Fallback for race conditions / other DB constraint failures.
        db.rollback()
        raise ConflictException("Dormitory update failed due to a uniqueness constraint") from e
    db.refresh(dorm)

    return WebResponse(
        status="success",
        message="Dormitory updated successfully",
        data=DormitoryRead.model_validate(dorm).model_dump(),
    )


@router.delete("/{dormitory_id}", response_model=WebResponse[dict])
def delete_dormitory(
    dormitory_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    dorm = db.query(Dormitory).filter(Dormitory.id == dormitory_id).first()
    if not dorm:
        raise NotFoundException(f"Dormitory '{dormitory_id}' not found")

    # Hard delete is OK because qr_codes.dormitory_id uses ON DELETE SET NULL
    db.delete(dorm)
    db.commit()

    return WebResponse(
        status="success",
        message="Dormitory deleted successfully",
        data={"id": dormitory_id},
    )

