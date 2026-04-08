from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session

from app.api.deps import get_db
from app.core.deps_permission import require_permission
from app.models.auth import User
from app.models.order import Color, QR
from app.schemas.qr import ColorRead, ColorCreate, ColorUpdate
from app.schemas.common import WebResponse
from app.core.exceptions import (
    NotFoundException, BadRequestException, ConflictException
)
from app.utils.helpers import get_now_local

router = APIRouter()

@router.get("/", response_model=WebResponse[List[ColorRead]])
def get_colors(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("view_color"))
):
    """
    Get all colors.
    """
    colors = db.query(Color).order_by(Color.name.asc()).all()
    return WebResponse(
        status="success",
        data=[ColorRead.model_validate(c) for c in colors]
    )

@router.post("/", response_model=WebResponse[ColorRead], status_code=status.HTTP_201_CREATED)
def create_color(
    color_in: ColorCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("create_color"))
):
    """
    Create a new color.
    """
    # Check if color name or code already exists
    existing = db.query(Color).filter(
        (Color.name.ilike(color_in.name)) | (Color.color_code.ilike(color_in.color_code))
    ).first()
    if existing:
        raise ConflictException("Warna dengan nama atau kode tersebut sudah ada")

    color = Color(
        name=color_in.name,
        color_code=color_in.color_code,
        created_by=current_user.id,
        updated_by=current_user.id
    )
    db.add(color)
    db.commit()
    db.refresh(color)
    return WebResponse(
        status="success",
        message="Warna berhasil ditambahkan",
        data=ColorRead.model_validate(color)
    )

@router.put("/{color_id}", response_model=WebResponse[ColorRead])
def update_color(
    color_id: str,
    color_in: ColorUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("update_color"))
):
    """
    Update a color.
    """
    color = db.query(Color).filter(Color.id == color_id).first()
    if not color:
        raise NotFoundException(f"Warna dengan ID {color_id} tidak ditemukan")

    update_data = color_in.model_dump(exclude_unset=True)
    
    # Check if new name or code conflicts with others
    if "name" in update_data:
        existing = db.query(Color).filter(
            Color.name.ilike(update_data["name"]), 
            Color.id != color_id
        ).first()
        if existing:
            raise ConflictException("Nama warna sudah digunakan")
    
    if "color_code" in update_data:
        existing = db.query(Color).filter(
            Color.color_code.ilike(update_data["color_code"]), 
            Color.id != color_id
        ).first()
        if existing:
            raise ConflictException("Kode warna sudah digunakan")

    for field, value in update_data.items():
        setattr(color, field, value)

    color.updated_at = get_now_local()
    color.updated_by = current_user.id
    
    db.commit()
    db.refresh(color)
    return WebResponse(
        status="success",
        message="Warna berhasil diperbarui",
        data=ColorRead.model_validate(color)
    )

@router.delete("/{color_id}", response_model=WebResponse[dict])
def delete_color(
    color_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("delete_color"))
):
    """
    Delete a color.
    """
    color = db.query(Color).filter(Color.id == color_id).first()
    if not color:
        raise NotFoundException(f"Warna dengan ID {color_id} tidak ditemukan")

    # Check if color is used by any QR
    used = db.query(QR).filter(QR.color_id == color_id).first()
    if used:
        raise BadRequestException("Tidak bisa menghapus warna yang masih digunakan oleh QR Code")

    db.delete(color)
    db.commit()
    return WebResponse(
        status="success",
        message="Warna berhasil dihapus"
    )
