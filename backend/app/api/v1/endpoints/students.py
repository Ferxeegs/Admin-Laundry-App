"""
Student management endpoints.
"""
from typing import Optional
from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.orm import Session
from sqlalchemy import or_

from app.api.deps import get_db, get_current_active_user
from app.core.deps_permission import require_permission
from app.models.auth import User
from app.models.order import Student
from app.models.common import Media
from app.schemas.student import (
    StudentRead, StudentCreate, StudentUpdate
)
from app.schemas.common import WebResponse, MediaRead
from app.core.exceptions import (
    NotFoundException, BadRequestException, ConflictException
)
from app.utils.helpers import (
    generate_unique_code, generate_qr_code_token, ensure_unique_code_uniqueness
)

router = APIRouter()


@router.get("/", response_model=WebResponse[dict])
def get_all_students(
    page: int = Query(1, ge=1),
    limit: int = Query(10, ge=1, le=100),
    search: Optional[str] = Query(None),
    is_active: Optional[bool] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """
    Get all students with pagination and search.
    """
    query = db.query(Student).filter(Student.deleted_at.is_(None))
    
    # Filter by active status if provided
    if is_active is not None:
        query = query.filter(Student.is_active == is_active)
    
    if search:
        search_filter = or_(
            Student.fullname.ilike(f"%{search}%"),
            Student.national_id_number.ilike(f"%{search}%"),
            Student.unique_code.ilike(f"%{search}%"),
            Student.phone_number.ilike(f"%{search}%"),
            Student.dormitory.ilike(f"%{search}%"),
            Student.grade_level.ilike(f"%{search}%"),
            Student.guardian_name.ilike(f"%{search}%"),
            Student.qr_code.ilike(f"%{search}%")
        )
        query = query.filter(search_filter)
    
    total = query.count()
    offset = (page - 1) * limit
    students = query.order_by(Student.created_at.desc()).offset(offset).limit(limit).all()
    
    # Get profile pictures for all students
    student_ids = [s.id for s in students]
    profile_pictures = {}
    if student_ids:
        media_list = db.query(Media).filter(
            Media.model_type == "Student",
            Media.model_id.in_(student_ids),
            Media.collection == "profile-pictures"
        ).all()
        for media in media_list:
            profile_pictures[media.model_id] = MediaRead.model_validate(media).model_dump()
    
    # Build response with profile pictures
    students_data = []
    for student in students:
        student_dict = StudentRead.model_validate(student).model_dump()
        if student.id in profile_pictures:
            student_dict["profile_picture"] = profile_pictures[student.id]
        students_data.append(student_dict)
    
    total_pages = (total + limit - 1) // limit if limit > 0 else 0
    
    return WebResponse(
        status="success",
        data={
            "students": students_data,
            "pagination": {
                "page": page,
                "limit": limit,
                "total": total,
                "totalPages": total_pages
            }
        }
    )


@router.get("/deleted", response_model=WebResponse[dict])
def get_deleted_students(
    page: int = Query(1, ge=1),
    limit: int = Query(10, ge=1, le=100),
    search: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(
        require_permission(['delete_student', 'force_delete_student', 'restore_student'])
    )
):
    """
    Get all deleted students with pagination and search.
    """
    query = db.query(Student).filter(Student.deleted_at.isnot(None))
    
    if search:
        search_filter = or_(
            Student.fullname.ilike(f"%{search}%"),
            Student.national_id_number.ilike(f"%{search}%"),
            Student.unique_code.ilike(f"%{search}%"),
            Student.phone_number.ilike(f"%{search}%"),
            Student.dormitory.ilike(f"%{search}%"),
            Student.grade_level.ilike(f"%{search}%")
        )
        query = query.filter(search_filter)
    
    total = query.count()
    offset = (page - 1) * limit
    students = query.order_by(Student.deleted_at.desc()).offset(offset).limit(limit).all()
    
    total_pages = (total + limit - 1) // limit if limit > 0 else 0
    
    return WebResponse(
        status="success",
        data={
            "students": [StudentRead.model_validate(student) for student in students],
            "pagination": {
                "page": page,
                "limit": limit,
                "total": total,
                "totalPages": total_pages
            }
        }
    )


@router.get("/{student_id}", response_model=WebResponse[StudentRead])
def get_student_by_id(
    student_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """
    Get student by ID.
    """
    student = db.query(Student).filter(
        Student.id == student_id,
        Student.deleted_at.is_(None)
    ).first()
    
    if not student:
        raise NotFoundException(f"Student with ID {student_id} not found")
    
    # Get profile picture from media
    profile_picture = db.query(Media).filter(
        Media.model_type == "Student",
        Media.model_id == student_id,
        Media.collection == "profile-pictures"
    ).first()
    
    student_dict = StudentRead.model_validate(student).model_dump()
    if profile_picture:
        student_dict["profile_picture"] = MediaRead.model_validate(profile_picture).model_dump()
    
    return WebResponse(
        status="success",
        data=student_dict
    )


@router.post("/", response_model=WebResponse[StudentRead], status_code=status.HTTP_201_CREATED)
def create_student(
    student_data: StudentCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("create_student"))
):
    """
    Create a new student.
    """
    # Check if national_id_number already exists
    existing_student = db.query(Student).filter(
        Student.national_id_number == student_data.national_id_number,
        Student.deleted_at.is_(None)
    ).first()
    if existing_student:
        raise ConflictException(f"Student with National ID '{student_data.national_id_number}' already exists")
    
    # Auto-generate unique_code if not provided
    if not student_data.unique_code:
        base_unique_code = generate_unique_code(
            student_data.dormitory,
            student_data.grade_level,
            student_data.fullname
        )
        student_data.unique_code = ensure_unique_code_uniqueness(
            base_unique_code, db, Student
        )
    else:
        # Check if manually provided unique_code already exists
        existing_code = db.query(Student).filter(
            Student.unique_code == student_data.unique_code,
            Student.deleted_at.is_(None)
        ).first()
        if existing_code:
            raise ConflictException(f"Student with Unique Code '{student_data.unique_code}' already exists")
    
    # Auto-generate qr_code if not provided
    if not student_data.qr_code:
        # Generate until we find a unique one
        max_attempts = 10
        for _ in range(max_attempts):
            qr_token = generate_qr_code_token()
            existing_qr = db.query(Student).filter(
                Student.qr_code == qr_token,
                Student.deleted_at.is_(None)
            ).first()
            if not existing_qr:
                student_data.qr_code = qr_token
                break
        else:
            # Fallback: add timestamp to make it unique
            import time
            qr_token = generate_qr_code_token()
            student_data.qr_code = f"{qr_token}-{int(time.time())}"
    else:
        # Check if manually provided qr_code already exists
        existing_qr = db.query(Student).filter(
            Student.qr_code == student_data.qr_code,
            Student.deleted_at.is_(None)
        ).first()
        if existing_qr:
            raise ConflictException(f"Student with QR Code '{student_data.qr_code}' already exists")
    
    # Create student
    student_dict = student_data.model_dump()
    student_dict["created_by"] = current_user.id
    
    student = Student(**student_dict)
    db.add(student)
    db.commit()
    db.refresh(student)
    
    return WebResponse(
        status="success",
        message="Student created successfully",
        data=StudentRead.model_validate(student)
    )


@router.put("/{student_id}", response_model=WebResponse[StudentRead])
def update_student(
    student_id: str,
    student_update: StudentUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission('update_student'))
):
    """
    Update student by ID.
    """
    student = db.query(Student).filter(
        Student.id == student_id,
        Student.deleted_at.is_(None)
    ).first()
    
    if not student:
        raise NotFoundException(f"Student with ID {student_id} not found")
    
    # Check if national_id_number already exists (if being updated)
    if student_update.national_id_number and student_update.national_id_number != student.national_id_number:
        existing_student = db.query(Student).filter(
            Student.national_id_number == student_update.national_id_number,
            Student.deleted_at.is_(None),
            Student.id != student_id
        ).first()
        if existing_student:
            raise ConflictException(f"Student with National ID '{student_update.national_id_number}' already exists")
    
    # Auto-regenerate unique_code if dormitory, grade_level, or fullname changed
    update_data = student_update.model_dump(exclude_unset=True)
    
    # Check if fields that affect unique_code are being updated
    should_regenerate_unique_code = False
    if any(field in update_data for field in ['dormitory', 'grade_level', 'fullname']):
        # Get new values or use existing ones
        new_dormitory = update_data.get('dormitory', student.dormitory)
        new_grade_level = update_data.get('grade_level', student.grade_level)
        new_fullname = update_data.get('fullname', student.fullname)
        
        # Generate new unique_code
        base_unique_code = generate_unique_code(
            new_dormitory,
            new_grade_level,
            new_fullname
        )
        update_data['unique_code'] = ensure_unique_code_uniqueness(
            base_unique_code, db, Student, exclude_id=student_id
        )
        should_regenerate_unique_code = True
    
    # Check if unique_code is manually being updated
    if 'unique_code' in update_data and not should_regenerate_unique_code:
        if update_data['unique_code'] != student.unique_code:
            existing_code = db.query(Student).filter(
                Student.unique_code == update_data['unique_code'],
                Student.deleted_at.is_(None),
                Student.id != student_id
            ).first()
            if existing_code:
                raise ConflictException(f"Student with Unique Code '{update_data['unique_code']}' already exists")
    
    # QR code should not be manually updated (it's auto-generated)
    # Remove qr_code from update_data if it's being manually changed
    if 'qr_code' in update_data:
        if update_data['qr_code'] != student.qr_code:
            # Don't allow manual QR code changes - it's auto-generated
            del update_data['qr_code']
    
    # Update student fields
    for field, value in update_data.items():
        setattr(student, field, value)
    
    # Set audit fields
    from datetime import datetime, timezone
    student.updated_by = current_user.id
    student.updated_at = datetime.now(timezone.utc)
    
    db.commit()
    db.refresh(student)
    
    return WebResponse(
        status="success",
        message="Student updated successfully",
        data=StudentRead.model_validate(student)
    )


@router.post("/{student_id}/restore", response_model=WebResponse[StudentRead])
def restore_student(
    student_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("restore_student"))
):
    """
    Restore a soft-deleted student (clear deleted_at / deleted_by).
    """
    from datetime import datetime, timezone

    student = db.query(Student).filter(
        Student.id == student_id,
        Student.deleted_at.isnot(None)
    ).first()

    if not student:
        raise NotFoundException(f"Deleted student with ID {student_id} not found")

    student.deleted_at = None
    student.deleted_by = None
    student.updated_by = current_user.id
    student.updated_at = datetime.now(timezone.utc)

    db.commit()
    db.refresh(student)

    return WebResponse(
        status="success",
        message="Student restored successfully",
        data=StudentRead.model_validate(student)
    )


@router.delete("/{student_id}", response_model=WebResponse[dict])
def delete_student(
    student_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission('delete_student'))
):
    """
    Soft delete student by ID.
    """
    student = db.query(Student).filter(
        Student.id == student_id,
        Student.deleted_at.is_(None)
    ).first()
    
    if not student:
        raise NotFoundException(f"Student with ID {student_id} not found")
    
    # Soft delete
    from datetime import datetime, timezone
    student.deleted_at = datetime.now(timezone.utc)
    student.deleted_by = current_user.id
    
    db.commit()
    
    return WebResponse(
        status="success",
        message="Student deleted successfully"
    )


@router.delete("/{student_id}/force", response_model=WebResponse[dict])
def force_delete_student(
    student_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission('force_delete_student'))
):
    """
    Permanently delete student by ID.
    WARNING: This will also delete all related orders (cascade).
    """
    student = db.query(Student).filter(Student.id == student_id).first()
    
    if not student:
        raise NotFoundException(f"Student with ID {student_id} not found")
    
    # Hard delete (cascade will delete related orders)
    db.delete(student)
    db.commit()
    
    return WebResponse(
        status="success",
        message="Student permanently deleted"
    )

