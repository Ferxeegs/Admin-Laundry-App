"""
QR Code management endpoints.
QR codes belong to the laundry operator, not students.
They are temporarily assigned to students during the laundry process.
"""
import time
from typing import Optional
from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import or_
from sqlalchemy.exc import IntegrityError
from pydantic import BaseModel

from app.api.deps import get_db, get_current_active_user
from app.core.deps_permission import require_permission
from app.models.auth import User
from app.models.order import Student, QR, Dormitory, Order, OrderAddon, OrderStatus, OrderTracking
from app.schemas.qr import QRRead, QRCreate, QRUpdate, QRAssign, QRBulkGenerate
from app.schemas.common import WebResponse
from app.schemas.order import OrderWithTrackingRead, OrderTrackingCreate
from app.services.order_serialization import serialize_order_with_tracking
from app.core.exceptions import (
    NotFoundException, BadRequestException, ConflictException
)
from app.utils.helpers import generate_qr_code_token, get_now_local

router = APIRouter()

def _ensure_dormitory_id(
    db: Session,
    dormitory_name: Optional[str],
    created_by: Optional[str] = None,
):
    """
    Convert dormitory name -> dormitory_id.
    - If dormitory_name is empty/None => returns None
    - If dormitory doesn't exist => create it with description=None
    """
    if not dormitory_name:
        return None
    name = dormitory_name.strip()
    if not name:
        return None

    dorm = db.query(Dormitory).filter(Dormitory.name == name).first()
    if dorm:
        return dorm.id

    dorm = Dormitory(
        name=name,
        description=None,
        created_by=created_by,
        updated_by=created_by,
    )
    db.add(dorm)
    db.flush()
    return dorm.id


def get_next_statuses(current_status: OrderStatus):
    """
    Status flow: RECEIVED -> WASHING_DRYING -> IRONING -> COMPLETED -> PICKED_UP
    """
    status_flow = {
        OrderStatus.RECEIVED: [OrderStatus.WASHING_DRYING],
        OrderStatus.WASHING_DRYING: [OrderStatus.IRONING],
        OrderStatus.IRONING: [OrderStatus.COMPLETED],
        OrderStatus.COMPLETED: [OrderStatus.PICKED_UP],
        OrderStatus.PICKED_UP: [],
    }
    return status_flow.get(current_status, [])


def _dormitory_prefix(dormitory_name: str) -> str:
    """
    Generate 3-letter prefix from dormitory name.
    Example: "Asrama B" -> "ASR-B"? (we only keep letters/digits, then take first 3)
    """
    cleaned = "".join(ch for ch in dormitory_name.upper().strip() if ch.isalnum())
    return (cleaned[:3] if cleaned else "QR")


def _pick_unique_prefix_for_dormitory(db: Session, dormitory_id: str, base_prefix: str) -> str:
    """
    Ensure the {prefix} part in unique_code is not already used by QR codes from other dormitories.
    If there is a collision, try alternative 3-char candidates derived from dormitory_name letters.
    """
    # Candidates: start with base_prefix, then vary the 3rd character when possible.
    # Example cleaned="ASRAPONDOK" => try "ASR", "ASA", "ASR" ... depending on content.
    base_prefix = (base_prefix or "QR").upper().strip()[:3]

    # Build variations using dormitory's name as a deterministic source
    dorm = db.query(Dormitory).filter(Dormitory.id == dormitory_id).first()
    cleaned = ""
    if dorm and dorm.name:
        cleaned = "".join(ch for ch in dorm.name.upper().strip() if ch.isalnum())

    candidates: list[str] = []
    if len(base_prefix) == 3:
        candidates.append(base_prefix)

    if len(cleaned) >= 3 and candidates.count(base_prefix) == 0:
        candidates.append(cleaned[:3])

    # Vary 3rd char while keeping first two chars.
    if len(cleaned) >= 3:
        first_two = cleaned[:2]
        for i in range(2, len(cleaned)):
            cand = (first_two + cleaned[i])[:3]
            if cand not in candidates and len(cand) == 3:
                candidates.append(cand)

    # Final fallback: if still colliding, append derived suffix from dormitory_id.
    # (This might violate "3 huruf" requirement for some cases, but avoids duplicates.)
    if not candidates:
        candidates = [base_prefix]
    fallback_seed = str(abs(hash(dormitory_id)) % 1000).zfill(3)
    fallback_candidate = (base_prefix[:2] + fallback_seed[0]).upper()[:3]
    if fallback_candidate not in candidates:
        candidates.append(fallback_candidate)

    def _prefix_used_by_other(p: str) -> bool:
        # Any QR whose unique_code starts with f"{p}-" but belongs to a different dormitory_id => collision.
        # unique_code format is expected: "{prefix}-{qr_number}"
        rows = (
            db.query(QR.dormitory_id)
            .filter(QR.unique_code.isnot(None))
            .filter(QR.unique_code.ilike(f"{p}-%"))
            .distinct()
            .all()
        )
        used_ids = {r[0] for r in rows if r and r[0]}
        return len(used_ids - {dormitory_id}) > 0

    for cand in candidates:
        if not _prefix_used_by_other(cand):
            return cand

    # If everything collides, return base_prefix as last resort.
    return base_prefix


def _parse_qr_number_int(qr_number: Optional[str]) -> Optional[int]:
    if qr_number is None:
        return None
    try:
        s = str(qr_number).strip()
        if not s:
            return None
        # Only accept pure digits to avoid unexpected formats
        if not s.isdigit():
            return None
        return int(s)
    except Exception:
        return None


class QRAdvanceStatus(BaseModel):
    notes: Optional[str] = None


def _qr_to_dict(qr: QR) -> dict:
    """Convert QR model to dict with nested student info."""
    # Do not pass the ORM object directly into QRRead: `student` is typed as dict,
    # but the relationship loads a Student model instance and Pydantic validation fails (500).
    student_payload = None
    if qr.student is not None:
        student_payload = {
            "id": qr.student.id,
            "fullname": qr.student.fullname,
            "student_number": qr.student.student_number,
        }
    payload = {
        "id": qr.id,
        "token_qr": qr.token_qr,
        "dormitory": qr.dormitory,
        "qr_number": qr.qr_number,
        "unique_code": qr.unique_code,
        "student_id": qr.student_id,
        "created_at": qr.created_at,
        "updated_at": qr.updated_at,
        "student": student_payload,
    }
    return QRRead.model_validate(payload).model_dump()


@router.get("/", response_model=WebResponse[dict])
def get_all_qr_codes(
    page: int = Query(1, ge=1),
    limit: int = Query(10, ge=1, le=100),
    search: Optional[str] = Query(None),
    assigned: Optional[bool] = Query(None, description="Filter by assignment status"),
    dormitory: Optional[str] = Query(None, description="Filter by dormitory"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """
    Get all QR codes with pagination and filters.
    """
    query = db.query(QR).options(joinedload(QR.dormitory_rel))
    
    # Filter by assignment status
    if assigned is True:
        query = query.filter(QR.student_id.isnot(None))
    elif assigned is False:
        query = query.filter(QR.student_id.is_(None))
    
    # Filter by dormitory
    if dormitory:
        query = query.join(QR.dormitory_rel).filter(
            Dormitory.name.ilike(f"%{dormitory}%")
        )
    
    # Search
    if search:
        search_filter = or_(
            QR.token_qr.ilike(f"%{search}%"),
            Dormitory.name.ilike(f"%{search}%"),
            QR.qr_number.ilike(f"%{search}%"),
            QR.unique_code.ilike(f"%{search}%"),
        )
        # Join dormitory only when searching includes dormitory fields
        query = query.join(QR.dormitory_rel, isouter=True).filter(search_filter)
    
    total = query.count()
    offset = (page - 1) * limit
    qr_codes = (
        query.options(joinedload(QR.student))
        .order_by(QR.created_at.desc())
        .offset(offset)
        .limit(limit)
        .all()
    )
    
    total_pages = (total + limit - 1) // limit if limit > 0 else 0
    
    return WebResponse(
        status="success",
        data={
            "qr_codes": [_qr_to_dict(qr) for qr in qr_codes],
            "pagination": {
                "page": page,
                "limit": limit,
                "total": total,
                "totalPages": total_pages
            }
        }
    )


@router.get("/lookup/{token_qr}", response_model=WebResponse[dict])
def lookup_qr_by_token(
    token_qr: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """
    Lookup a QR code by its token value. Used by the ScanQR page.
    Returns QR info including the currently assigned student (if any).
    """
    qr = db.query(QR).options(joinedload(QR.student)).filter(
        QR.token_qr == token_qr
    ).first()
    
    if not qr:
        raise NotFoundException(f"QR dengan token '{token_qr}' tidak ditemukan")
    
    return WebResponse(
        status="success",
        data=_qr_to_dict(qr)
    )


@router.post(
    "/trackings/advance/{token_qr}",
    response_model=WebResponse[OrderWithTrackingRead],
)
def advance_order_status_by_qr_token(
    token_qr: str,
    payload: QRAdvanceStatus,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission(["update_order", "create_order"])),
):
    """
    Advance order status by scanning QR token (bag).
    Flow:
    - lookup QR -> get assigned student_id
    - find active order (not PICKED_UP)
    - compute next status and create tracking entry
    - when next status is PICKED_UP, release QR (student_id=NULL) if no other active orders exist
    """
    qr = db.query(QR).options(joinedload(QR.student)).filter(QR.token_qr == token_qr).first()
    if not qr:
        raise NotFoundException(f"QR dengan token '{token_qr}' tidak ditemukan")
    if qr.student_id is None:
        raise BadRequestException("QR ini belum terhubung dengan siswa. Kaitkan QR terlebih dahulu.")

    active_order = (
        db.query(Order)
        .filter(
            Order.student_id == qr.student_id,
            Order.current_status != OrderStatus.PICKED_UP,
        )
        .order_by(Order.created_at.desc())
        .first()
    )
    if not active_order:
        raise NotFoundException("Tidak ada order aktif untuk siswa ini.")

    next_statuses = get_next_statuses(active_order.current_status)
    if not next_statuses:
        raise BadRequestException("Order sudah diambil (PICKED_UP) atau tidak memiliki status berikutnya.")

    next_status = next_statuses[0]

    # Update order status + create tracking
    active_order.current_status = next_status
    tracking = OrderTracking(
        order_id=active_order.id,
        staff_id=current_user.id,
        status_to=next_status.value,
        notes=payload.notes.strip() if payload.notes else None,
    )
    db.add(tracking)

    active_order.updated_by = current_user.id
    active_order.updated_at = get_now_local()

    # Release QR when picked up (only if there's no other active order)
    if next_status == OrderStatus.PICKED_UP:
        other_active_order = (
            db.query(Order)
            .filter(
                Order.student_id == qr.student_id,
                Order.id != active_order.id,
                Order.current_status != OrderStatus.PICKED_UP,
            )
            .first()
        )
        if not other_active_order:
            qr.student_id = None
            qr.updated_by = current_user.id
            qr.updated_at = get_now_local()

    db.commit()
    order = (
        db.query(Order)
        .options(
            joinedload(Order.addons).joinedload(OrderAddon.addon),
            joinedload(Order.trackings),
        )
        .filter(Order.id == active_order.id)
        .first()
    )

    return WebResponse(
        status="success",
        message="Status order diperbarui",
        data=serialize_order_with_tracking(order),
    )


@router.get("/{qr_id}", response_model=WebResponse[dict])
def get_qr_by_id(
    qr_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """
    Get QR code by ID.
    """
    qr = db.query(QR).options(joinedload(QR.student)).filter(
        QR.id == qr_id
    ).first()
    
    if not qr:
        raise NotFoundException(f"QR with ID {qr_id} not found")
    
    return WebResponse(
        status="success",
        data=_qr_to_dict(qr)
    )


@router.post("/", response_model=WebResponse[dict], status_code=status.HTTP_201_CREATED)
def create_qr_code(
    qr_data: QRCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("create_student"))
):
    """
    Create a new QR code (owned by operator, not assigned to any student).
    """
    # Check if token_qr already exists
    existing_qr = db.query(QR).filter(QR.token_qr == qr_data.token_qr).first()
    if existing_qr:
        raise ConflictException(f"QR dengan token '{qr_data.token_qr}' sudah ada")
    
    qr_dict = qr_data.model_dump()
    dormitory_name = qr_dict.pop("dormitory", None)
    qr_dict["dormitory_id"] = _ensure_dormitory_id(db, dormitory_name, created_by=current_user.id)
    qr_dict["created_by"] = current_user.id
    
    qr = QR(**qr_dict)
    db.add(qr)
    db.commit()
    db.refresh(qr)
    
    return WebResponse(
        status="success",
        message="QR code berhasil dibuat",
        data=_qr_to_dict(qr)
    )


@router.post(
    "/bulk-generate",
    response_model=WebResponse[dict],
    status_code=status.HTTP_201_CREATED,
)
def bulk_generate_qr_codes(
    payload: QRBulkGenerate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("create_student")),
):
    """
    Bulk-generate QR codes for laundry bags.

    Rules:
    - token_qr generated automatically
    - qr_number sequential per dormitory
    - if existing qr_numbers found: next starts at (max + 1)
    - unique_code format: {3-letter dormitory prefix}-{qr_number}
    """
    dormitory_name = payload.dormitory.strip()
    if not dormitory_name:
        raise BadRequestException("Dormitory is required")

    dormitory_id = _ensure_dormitory_id(db, dormitory_name, created_by=current_user.id)

    existing_numbers = [
        _parse_qr_number_int(row[0])
        for row in db.query(QR.qr_number)
        .filter(QR.dormitory_id == dormitory_id)
        .filter(QR.qr_number.isnot(None))
        .all()
    ]
    existing_numbers = [n for n in existing_numbers if n is not None]
    start_num = (max(existing_numbers) + 1) if existing_numbers else 1
    end_num = start_num + payload.count - 1

    prefix = _pick_unique_prefix_for_dormitory(
        db=db,
        dormitory_id=dormitory_id,
        base_prefix=_dormitory_prefix(dormitory_name),
    )

    created_qrs = []
    for num in range(start_num, end_num + 1):
        # Ensure token uniqueness
        max_attempts = 10
        token = None
        for _ in range(max_attempts):
            candidate = generate_qr_code_token()
            existing = db.query(QR).filter(QR.token_qr == candidate).first()
            if not existing:
                token = candidate
                break
        if not token:
            token = f"{generate_qr_code_token()}-{int(time.time())}"

        qr = QR(
            token_qr=token,
            dormitory_id=dormitory_id,
            qr_number=str(num),
            # Number part must be 3 digits: 1 -> 001, etc.
            unique_code=f"{prefix}-{num:03d}",
            created_by=current_user.id,
            updated_by=current_user.id,
        )
        created_qrs.append(qr)

    db.add_all(created_qrs)
    db.commit()

    # Refresh only first/last to reduce DB load
    for qr in created_qrs[:5]:
        db.refresh(qr)
    if created_qrs and len(created_qrs) > 5:
        db.refresh(created_qrs[-1])

    return WebResponse(
        status="success",
        message="QR berhasil digenerate (bulk)",
        data={
            "dormitory": dormitory_name,
            "count": payload.count,
            "start_qr_number": start_num,
            "end_qr_number": end_num,
            "unique_code_prefix": prefix,
            # optional: send a preview so UI can confirm quickly
            "preview": [_qr_to_dict(qr) for qr in (created_qrs[:5] if created_qrs else [])],
        },
    )


@router.post("/generate", response_model=WebResponse[dict], status_code=status.HTTP_201_CREATED)
def generate_qr_code(
    dormitory: Optional[str] = Query(None),
    qr_number: Optional[str] = Query(None),
    unique_code: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("create_student"))
):
    """
    Auto-generate a new QR code with a random token.
    """
    # Generate unique token
    max_attempts = 10
    token = None
    for _ in range(max_attempts):
        candidate = generate_qr_code_token()
        existing = db.query(QR).filter(QR.token_qr == candidate).first()
        if not existing:
            token = candidate
            break
    
    if not token:
        # Fallback with timestamp
        token = f"{generate_qr_code_token()}-{int(time.time())}"
    
    qr = QR(
        token_qr=token,
        dormitory_id=_ensure_dormitory_id(db, dormitory, created_by=current_user.id),
        qr_number=qr_number,
        unique_code=unique_code,
        created_by=current_user.id,
    )
    db.add(qr)
    db.commit()
    db.refresh(qr)
    
    return WebResponse(
        status="success",
        message="QR code berhasil di-generate",
        data=_qr_to_dict(qr)
    )


@router.put("/{qr_id}", response_model=WebResponse[dict])
def update_qr_code(
    qr_id: str,
    qr_update: QRUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("update_student"))
):
    """
    Update a QR code's metadata (dormitory, qr_number, unique_code).
    """
    qr = db.query(QR).filter(QR.id == qr_id).first()
    if not qr:
        raise NotFoundException(f"QR with ID {qr_id} not found")
    
    update_data = qr_update.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        if field == "dormitory":
            # QRUpdate.dormitory is a name; map to dormitory_id.
            qr.dormitory_id = _ensure_dormitory_id(db, value, created_by=current_user.id)
            continue
        setattr(qr, field, value)
    
    qr.updated_by = current_user.id
    qr.updated_at = get_now_local()
    
    db.commit()
    db.refresh(qr)
    
    return WebResponse(
        status="success",
        message="QR code berhasil diperbarui",
        data=_qr_to_dict(qr)
    )


@router.post("/{qr_id}/assign", response_model=WebResponse[dict])
def assign_qr_to_student(
    qr_id: str,
    assign_data: QRAssign,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """
    Assign a QR code to a student (link student_id).
    Used when starting the laundry process.
    """
    qr = db.query(QR).filter(QR.id == qr_id).first()
    if not qr:
        raise NotFoundException(f"QR with ID {qr_id} not found")
    
    if qr.student_id is not None:
        raise BadRequestException("QR ini sudah terkait dengan siswa lain. Lepas kaitan terlebih dahulu.")
    
    # Verify student exists
    student = db.query(Student).filter(
        Student.id == assign_data.student_id,
        Student.deleted_at.is_(None)
    ).first()
    if not student:
        raise NotFoundException(f"Siswa dengan ID {assign_data.student_id} tidak ditemukan")

    # One student ↔ one QR row (unique student_id on qr_codes)
    other = (
        db.query(QR)
        .filter(QR.student_id == assign_data.student_id, QR.id != qr_id)
        .first()
    )
    if other:
        raise ConflictException(
            "Santri ini sudah terkait dengan QR tas lain. Lepas kaitan pada QR tersebut terlebih dahulu, "
            "atau gunakan QR yang sudah dikaitkan."
        )
    
    qr.student_id = assign_data.student_id
    qr.updated_by = current_user.id
    qr.updated_at = get_now_local()
    
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise ConflictException(
            "Tidak bisa mengaitkan QR (bentrok data). Pastikan santri belum terkait QR tas lain."
        ) from exc
    db.refresh(qr)
    
    # Reload with student relationship
    qr = db.query(QR).options(joinedload(QR.student)).filter(QR.id == qr_id).first()
    
    return WebResponse(
        status="success",
        message=f"QR berhasil dikaitkan dengan {student.fullname}",
        data=_qr_to_dict(qr)
    )


@router.post("/{qr_id}/release", response_model=WebResponse[dict])
def release_qr_from_student(
    qr_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """
    Release a QR code from its assigned student (set student_id=NULL).
    Used when the laundry process is complete and the bag is returned.
    """
    qr = db.query(QR).filter(QR.id == qr_id).first()
    if not qr:
        raise NotFoundException(f"QR with ID {qr_id} not found")
    
    if qr.student_id is None:
        raise BadRequestException("QR ini tidak terkait dengan siswa manapun")
    
    qr.student_id = None
    qr.updated_by = current_user.id
    qr.updated_at = get_now_local()
    
    db.commit()
    db.refresh(qr)
    
    return WebResponse(
        status="success",
        message="QR berhasil dilepas dari siswa",
        data=_qr_to_dict(qr)
    )


@router.delete("/{qr_id}", response_model=WebResponse[dict])
def delete_qr_code(
    qr_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("delete_student"))
):
    """
    Permanently delete a QR code.
    """
    qr = db.query(QR).filter(QR.id == qr_id).first()
    if not qr:
        raise NotFoundException(f"QR with ID {qr_id} not found")
    
    if qr.student_id is not None:
        raise BadRequestException("Tidak bisa menghapus QR yang masih terkait dengan siswa. Lepas kaitan terlebih dahulu.")
    
    db.delete(qr)
    db.commit()
    
    return WebResponse(
        status="success",
        message="QR code berhasil dihapus"
    )
