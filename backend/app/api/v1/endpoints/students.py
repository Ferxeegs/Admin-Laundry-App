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
from app.utils.helpers import get_now_local

router = APIRouter()


@router.get("/", response_model=WebResponse[dict])
def get_all_students(
    page: int = Query(1, ge=1),
    limit: int = Query(10, ge=1, le=100),
    search: Optional[str] = Query(None),
    is_active: Optional[bool] = Query(None),
    db: Session = Depends(get_db),
    # current_user: User = Depends(get_current_active_user)
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
            Student.student_number.ilike(f"%{search}%"),
            Student.phone_number.ilike(f"%{search}%"),
            Student.guardian_name.ilike(f"%{search}%"),
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
    # current_user: User = Depends(
    #     require_permission(['delete_student', 'force_delete_student', 'restore_student'])
    # )
):
    """
    Get all deleted students with pagination and search.
    """
    query = db.query(Student).filter(Student.deleted_at.isnot(None))
    
    if search:
        search_filter = or_(
            Student.fullname.ilike(f"%{search}%"),
            Student.student_number.ilike(f"%{search}%"),
            Student.phone_number.ilike(f"%{search}%"),
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
    # current_user: User = Depends(get_current_active_user)
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
    # Check if student_number already exists
    existing_student = db.query(Student).filter(
        Student.student_number == student_data.student_number,
        Student.deleted_at.is_(None)
    ).first()
    if existing_student:
        raise ConflictException(f"Siswa dengan NIS '{student_data.student_number}' sudah ada")
    
    # Create student
    student_dict = student_data.model_dump()
    student_dict["created_by"] = current_user.id
    
    student = Student(**student_dict)
    db.add(student)
    db.commit()
    db.refresh(student)
    
    return WebResponse(
        status="success",
        message="Siswa berhasil ditambahkan",
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
    
    update_data = student_update.model_dump(exclude_unset=True)
    
    # Check if student_number already exists (if being updated)
    if 'student_number' in update_data and update_data['student_number'] != student.student_number:
        existing_student = db.query(Student).filter(
            Student.student_number == update_data['student_number'],
            Student.deleted_at.is_(None),
            Student.id != student_id
        ).first()
        if existing_student:
            raise ConflictException(f"Siswa dengan NIS '{update_data['student_number']}' sudah ada")
    
    # Update student fields
    for field, value in update_data.items():
        setattr(student, field, value)
    
    # Set audit fields
    student.updated_by = current_user.id
    student.updated_at = get_now_local()
    
    db.commit()
    db.refresh(student)
    
    return WebResponse(
        status="success",
        message="Siswa berhasil diperbarui",
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
    student = db.query(Student).filter(
        Student.id == student_id,
        Student.deleted_at.isnot(None)
    ).first()

    if not student:
        raise NotFoundException(f"Deleted student with ID {student_id} not found")

    student.deleted_at = None
    student.deleted_by = None
    student.updated_by = current_user.id
    student.updated_at = get_now_local()

    db.commit()
    db.refresh(student)

    return WebResponse(
        status="success",
        message="Siswa berhasil dipulihkan",
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
    student.deleted_at = get_now_local()
    student.deleted_by = current_user.id
    
    db.commit()
    
    return WebResponse(
        status="success",
        message="Siswa berhasil dihapus"
    )


@router.delete("/{student_id}/force", response_model=WebResponse[dict])
def force_delete_student(
    student_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission('force_delete_student'))
):
    """
    Permanently delete student by ID.
    """
    student = db.query(Student).filter(Student.id == student_id).first()
    
    if not student:
        raise NotFoundException(f"Student with ID {student_id} not found")
    
    # Hard delete
    db.delete(student)
    db.commit()
    
    return WebResponse(
        status="success",
        message="Siswa berhasil dihapus secara permanen"
    )
