"""
Order management endpoints.
"""
from typing import Optional, List, Tuple

from fastapi import APIRouter, Depends, Query, status, UploadFile, File, Form, Request, BackgroundTasks
from starlette.datastructures import UploadFile as StarletteUploadFile
from sqlalchemy import or_
from sqlalchemy.orm import Session, joinedload

from datetime import datetime, timezone, timedelta
from app.api.deps import get_db, get_current_active_user
from app.core.deps_permission import require_permission
from app.models.auth import User
from app.models.order import Order, OrderStatus, OrderTracking, Student, QR
from app.models.common import Setting
from app.utils.helpers import get_now_local, get_start_of_day_local
from app.schemas.common import WebResponse
from app.schemas.order import (
    OrderRead,
    OrderCreated,
    OrderCreate,
    OrderUpdate,
    OrderWithTrackingRead,
    OrderTrackingRead,
    OrderTrackingCreate,
)
from app.services.order_image_background import process_order_images_background
from app.core.exceptions import NotFoundException, BadRequestException

router = APIRouter()


def get_next_statuses(current_status: OrderStatus) -> List[OrderStatus]:
    """
    Get list of valid next statuses based on current status.
    Status flow: RECEIVED -> WASHING_DRYING -> IRONING -> COMPLETED -> PICKED_UP
    """
    status_flow = {
        OrderStatus.RECEIVED: [OrderStatus.WASHING_DRYING],
        OrderStatus.WASHING_DRYING: [OrderStatus.IRONING],
        OrderStatus.IRONING: [OrderStatus.COMPLETED],
        OrderStatus.COMPLETED: [OrderStatus.PICKED_UP],
        OrderStatus.PICKED_UP: [],  # Final status, no next status
    }
    return status_flow.get(current_status, [])


def get_order_settings(db: Session) -> tuple[int, float]:
    """
    Get free-item quota limit (setting key: monthly_quota) and price_per_item.
    Quota resets daily; the legacy setting name is kept for DB compatibility.
    Returns (quota_limit: int, price_per_item: float).
    Falls back to default values if settings not found.
    """
    default_quota = 4
    default_price_per_item = 4000.0

    quota_setting = db.query(Setting).filter(
        Setting.group == "order",
        Setting.name == "monthly_quota",
    ).first()

    if quota_setting and quota_setting.payload is not None:
        try:
            quota_limit = int(quota_setting.payload)
        except (ValueError, TypeError):
            quota_limit = default_quota
    else:
        quota_limit = default_quota
    
    # Get price_per_item
    price_per_item_setting = db.query(Setting).filter(
        Setting.group == "order",
        Setting.name == "price_per_item"
    ).first()
    
    if price_per_item_setting and price_per_item_setting.payload is not None:
        try:
            price_per_item = float(price_per_item_setting.payload)
        except (ValueError, TypeError):
            price_per_item = default_price_per_item
    else:
        price_per_item = default_price_per_item
    
    return quota_limit, price_per_item


@router.get("/", response_model=WebResponse[dict])
def get_all_orders(
    page: int = Query(1, ge=1),
    limit: int = Query(10, ge=1, le=1000),
    search: Optional[str] = Query(None),
    status_filter: Optional[OrderStatus] = Query(None, alias="status"),
    student_id: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """
    Get all orders with pagination and optional filters.
    """
    query = db.query(Order)

    if status_filter is not None:
        query = query.filter(Order.current_status == status_filter)

    if student_id:
        query = query.filter(Order.student_id == student_id)

    if search:
        term = f"%{search}%"
        query = query.join(Order.student).filter(
            or_(
                Order.order_number.ilike(term),
                Student.fullname.ilike(term),
            )
        )

    total = query.count()
    offset = (page - 1) * limit
    # Eager load student data using joinedload to avoid N+1 queries
    orders = (
        query.options(joinedload(Order.student))
        .order_by(Order.created_at.desc())
        .offset(offset)
        .limit(limit)
        .all()
    )

    total_pages = (total + limit - 1) // limit if limit > 0 else 0

    # Build response with student data
    orders_data = []
    for order in orders:
        order_dict = OrderRead.model_validate(order).model_dump()
        if order.student:
            order_dict["student"] = {
                "id": order.student.id,
                "fullname": order.student.fullname,
                "student_number": order.student.student_number,
            }
        orders_data.append(order_dict)

    return WebResponse(
        status="success",
        data={
            "orders": orders_data,
            "pagination": {
                "page": page,
                "limit": limit,
                "total": total,
                "totalPages": total_pages,
            },
        },
    )


@router.get("/{order_id}", response_model=WebResponse[OrderWithTrackingRead])
def get_order_by_id(
    order_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """
    Get order detail by ID including tracking history.
    """
    order = db.query(Order).filter(Order.id == order_id).first()

    if not order:
        raise NotFoundException(f"Order with ID {order_id} not found")

    return WebResponse(
        status="success",
        data=OrderWithTrackingRead.model_validate(order),
    )


@router.post(
    "/", response_model=WebResponse[OrderCreated], status_code=status.HTTP_201_CREATED
)
async def create_order(
    request: Request,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("create_order")),
):
    """
    Create a new order for a student.
    Staff only inputs total_items, system automatically calculates:
    - free_items_used (based on daily quota: N free items per day per student)
    - paid_items_count (items exceeding quota)
    - additional_fee (paid_items_count * 4000)
    """
    from sqlalchemy import func

    # Generate order number: "{YYMMDD}{sequence}"
    # Format: 240113001 (where 001 is the order number for that day)
    now = get_now_local()
    date_str = now.strftime("%y%m%d")
    
    # Count how many orders were created today
    start_of_day = get_start_of_day_local(now)
    orders_today_count = db.query(Order).filter(
        Order.created_at >= start_of_day
    ).count()
    
    # Generate sequence number (1-based, padded to 3 digits)
    sequence = orders_today_count + 1
    order_number = f"{date_str}-{sequence:03d}"
    
    # Ensure uniqueness by checking if order_number already exists
    # If exists, increment sequence until unique
    while db.query(Order).filter(Order.order_number == order_number).first():
        sequence += 1
        order_number = f"{date_str}{sequence:03d}"
        if sequence > 999:  # Safety limit (3 digits max)
            # Fallback: add timestamp if too many orders in one day
            timestamp = now.strftime("%y%m%d-%H%M%S")
            order_number = f"{timestamp}"
            break

    from app.core.logging_config import root_logger
    logger = root_logger
    
    # Parse FormData manually to get both form fields and files
    # This is the standard approach when dealing with mixed form data and files
    try:
        form = await request.form()
        logger.info(f"Form keys received: {list(form.keys())}")
        
        # Extract form fields
        student_id = form.get('student_id')
        if not student_id:
            raise BadRequestException("student_id is required")
        student_id = str(student_id)
        
        total_items_str = form.get('total_items')
        if not total_items_str:
            raise BadRequestException("total_items is required")
        
        # Validate and convert total_items
        try:
            total_items = int(total_items_str)
        except (ValueError, TypeError):
            raise BadRequestException("Total items must be a valid number")
        
        if total_items <= 0:
            raise BadRequestException("Total items must be > 0")
        
        notes = form.get('notes')
        notes = str(notes) if notes else None
        
        # Extract image files
        # FastAPI uses starlette.datastructures.UploadFile internally
        # form.getlist() returns UploadFile objects when the field name is 'images'
        images: List[UploadFile] = []
        if 'images' in form:
            image_files = form.getlist('images')
            logger.info(f"Found {len(image_files)} items with key 'images' in form")
            
            for idx, file_item in enumerate(image_files):
                file_type = type(file_item).__name__
                file_module = type(file_item).__module__
                logger.info(f"Item {idx + 1}: type={file_type}, module={file_module}")
                
                # starlette.datastructures.UploadFile is what FastAPI uses internally
                # It has read() method and filename attribute
                # Just check if it has the required attributes and is not a string
                if not isinstance(file_item, str) and hasattr(file_item, 'read'):
                    try:
                        filename = getattr(file_item, 'filename', None)
                        content_type = getattr(file_item, 'content_type', None)
                        logger.info(f"Adding image {idx + 1}: filename={filename}, content_type={content_type}, type={file_type}")
                        images.append(file_item)
                    except Exception as e:
                        logger.warning(f"Error processing file item {idx + 1}: {e}, type: {file_type}")
                else:
                    logger.warning(f"Skipping item {idx + 1}: not a file (type={file_type}, is_str={isinstance(file_item, str)}, has_read={hasattr(file_item, 'read')})")
        else:
            logger.info("No 'images' field found in form")
            
    except BadRequestException:
        raise
    except Exception as e:
        logger.error(f"Error parsing form data: {e}", exc_info=True)
        raise BadRequestException(f"Error parsing form data: {str(e)}")

    # Check student exists
    from app.models.order import Student
    student = db.query(Student).filter(Student.id == student_id).first()
    if not student:
        raise NotFoundException(f"Student with ID {student_id} not found")

    # QR tas harus sudah di-assign ke student lewat QR flow:
    # - scan QR -> pilih santri -> POST /qr-codes/{qr_id}/assign
    # Saat order dibuat, kita hanya validasi bahwa QR yang terhubung memang sudah ada.
    qr = db.query(QR).filter(QR.student_id == student_id).first()
    if qr is None:
        raise BadRequestException(
            "QR tas belum terhubung ke siswa ini. Silakan scan QR tas dan kaitkan ke santri terlebih dahulu."
        )

    # Daily quota usage (UTC calendar day, same window as start_of_day above)
    QUOTA_LIMIT, PRICE_PER_ITEM = get_order_settings(db)
    start_of_next_day = start_of_day + timedelta(days=1)

    free_items_used_today = (
        db.query(func.sum(Order.free_items_used))
        .filter(
            Order.student_id == student_id,
            Order.created_at >= start_of_day,
            Order.created_at < start_of_next_day,
        )
        .scalar() or 0
    )

    remaining_quota = max(0, QUOTA_LIMIT - free_items_used_today)

    # Calculate free_items_used and paid_items_count for this order
    free_items_used = min(total_items, remaining_quota)
    paid_items_count = max(0, total_items - free_items_used)
    additional_fee = paid_items_count * PRICE_PER_ITEM

    order_dict = {
        "student_id": student_id,
        "order_number": order_number,
        "total_items": total_items,
        "free_items_used": free_items_used,
        "paid_items_count": paid_items_count,
        "additional_fee": additional_fee,
        "notes": notes,
        "created_by": current_user.id,
    }

    # Create order and initial tracking in a single transaction
    try:
        order = Order(**order_dict)
        db.add(order)
        db.flush()  # Flush to get order.id without committing
        
        # Create initial tracking entry with RECEIVED status
        initial_tracking = OrderTracking(
            order_id=order.id,
            staff_id=current_user.id,
            status_to=OrderStatus.RECEIVED.value,
            notes="Order diterima"
        )
        db.add(initial_tracking)
        
        # Commit order and tracking together
        db.commit()
        db.refresh(order)
        logger.info(f"Order created successfully: {order.id}, order_number: {order.order_number}")
    except Exception as e:
        db.rollback()
        logger.error(f"Error creating order: {e}", exc_info=True)
        raise BadRequestException(f"Failed to create order: {str(e)}")

    # Read image bytes in the request thread, then persist in a background task so the
    # client gets HTTP 201 without waiting for disk I/O.
    image_payloads: List[Tuple[bytes, Optional[str], Optional[str]]] = []
    if images:
        logger.info(f"Queueing {len(images)} image(s) for background processing for order {order.id}")
        for image in images:
            try:
                file_content = await image.read()
                image_payloads.append((file_content, image.filename, image.content_type))
            except Exception as e:
                logger.error(f"Failed to read uploaded image for order {order.id}: {e}", exc_info=True)

    if image_payloads:
        background_tasks.add_task(process_order_images_background, str(order.id), image_payloads)

    db.refresh(order)

    order_created = OrderCreated(
        **OrderRead.model_validate(order).model_dump(),
        images_queued=len(image_payloads),
    )
    return WebResponse(
        status="success",
        message="Order created successfully",
        data=order_created,
    )


@router.put("/{order_id}", response_model=WebResponse[OrderRead])
def update_order(
    order_id: str,
    order_update: OrderUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("update_order")),
):
    """
    Update order fields (not status tracking).
    Staff only inputs total_items, system automatically recalculates:
    - free_items_used (based on daily quota: N free items per day per student)
    - paid_items_count (items exceeding quota)
    - additional_fee (paid_items_count * 4000)
    
    Note: If order status is WASHING_DRYING or later, only notes can be updated.
    """
    from datetime import datetime, timezone, timedelta
    from sqlalchemy import func

    order = db.query(Order).filter(Order.id == order_id).first()

    if not order:
        raise NotFoundException(f"Order with ID {order_id} not found")

    # Check if order status is WASHING_DRYING or later
    # If so, only notes can be updated
    if order.current_status in [OrderStatus.WASHING_DRYING, OrderStatus.IRONING, OrderStatus.COMPLETED, OrderStatus.PICKED_UP]:
        update_data = order_update.model_dump(exclude_unset=True)
        # Only allow notes update
        if "total_items" in update_data:
            raise BadRequestException(
                f"Order dengan status {order.current_status.value} tidak dapat diubah jumlah pakaiannya. "
                "Hanya catatan yang dapat diubah."
            )
        # Only update notes
        if "notes" in update_data:
            order.notes = update_data["notes"]
            order.updated_by = current_user.id
            order.updated_at = datetime.now(timezone.utc)
            db.commit()
            db.refresh(order)
            return WebResponse(
                status="success",
                message="Order notes updated successfully",
                data=OrderRead.model_validate(order),
            )
        else:
            raise BadRequestException("Tidak ada perubahan yang dilakukan.")

    update_data = order_update.model_dump(exclude_unset=True)

    # If total_items is updated, recalculate free_items_used, paid_items_count, and additional_fee
    if "total_items" in update_data:
        QUOTA_LIMIT, PRICE_PER_ITEM = get_order_settings(db)

        oc = order.created_at or get_now_local()
        day_start = get_start_of_day_local(oc)
        day_end = day_start + timedelta(days=1)

        free_items_used_today = (
            db.query(func.sum(Order.free_items_used))
            .filter(
                Order.student_id == order.student_id,
                Order.id != order_id,
                Order.created_at >= day_start,
                Order.created_at < day_end,
            )
            .scalar() or 0
        )

        remaining_quota = max(0, QUOTA_LIMIT - free_items_used_today)

        # Recalculate for updated total_items
        total_items = update_data["total_items"]
        free_items_used = min(total_items, remaining_quota)
        paid_items_count = max(0, total_items - free_items_used)
        additional_fee = paid_items_count * PRICE_PER_ITEM

        update_data["free_items_used"] = free_items_used
        update_data["paid_items_count"] = paid_items_count
        update_data["additional_fee"] = additional_fee

    # Update notes if provided
    if "notes" in update_data:
        pass  # Already in update_data

    for field, value in update_data.items():
        setattr(order, field, value)

    # Audit fields
    order.updated_by = current_user.id
    order.updated_at = datetime.now(timezone.utc)

    db.commit()
    db.refresh(order)

    return WebResponse(
        status="success",
        message="Order updated successfully",
        data=OrderRead.model_validate(order),
    )


@router.delete("/{order_id}", response_model=WebResponse[dict])
def delete_order(
    order_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("delete_order")),
):
    """
    Delete order by ID (hard delete).
    If the deleted order was active (not PICKED_UP), release the QR if no other active orders exist.
    """
    order = db.query(Order).filter(Order.id == order_id).first()

    if not order:
        raise NotFoundException(f"Order with ID {order_id} not found")

    student_id = order.student_id
    was_active = order.current_status != OrderStatus.PICKED_UP

    db.delete(order)
    db.flush()

    if was_active:
        # Check if student has any OTHER active orders
        other_active_order = (
            db.query(Order)
            .filter(
                Order.student_id == student_id,
                Order.current_status != OrderStatus.PICKED_UP,
            )
            .first()
        )

        if not other_active_order:
            qr = db.query(QR).filter(QR.student_id == student_id).first()
            if qr:
                qr.student_id = None
                qr.updated_by = current_user.id
                qr.updated_at = get_now_local()

    db.commit()

    return WebResponse(
        status="success",
        message="Order deleted successfully",
    )


@router.get("/{order_id}/trackings", response_model=WebResponse[list[OrderTrackingRead]])
def get_order_trackings(
    order_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """
    Get all tracking history for an order.
    """
    order = db.query(Order).filter(Order.id == order_id).first()
    if not order:
        raise NotFoundException(f"Order with ID {order_id} not found")

    trackings = (
        db.query(OrderTracking)
        .filter(OrderTracking.order_id == order_id)
        .order_by(OrderTracking.created_at.asc())
        .all()
    )

    return WebResponse(
        status="success",
        data=[OrderTrackingRead.model_validate(t) for t in trackings],
    )


@router.post(
    "/{order_id}/trackings",
    response_model=WebResponse[OrderWithTrackingRead],
    status_code=status.HTTP_201_CREATED,
)
def create_order_tracking(
    order_id: str,
    tracking_data: OrderTrackingCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission(["create_order", "update_order"])),
):
    """
    Add new tracking entry & update order status.
    Status can only be updated to the next valid status in the flow.
    """
    order = db.query(Order).filter(Order.id == order_id).first()
    if not order:
        raise NotFoundException(f"Order with ID {order_id} not found")

    # Validate new status
    try:
        new_status = OrderStatus(tracking_data.status_to)
    except ValueError:
        raise BadRequestException(
            f"Invalid status_to '{tracking_data.status_to}'. "
            f"Valid values: {[s.value for s in OrderStatus]}"
        )

    # Check if new status is valid next status
    current_status = order.current_status
    valid_next_statuses = get_next_statuses(current_status)
    
    if new_status not in valid_next_statuses:
        if current_status == OrderStatus.PICKED_UP:
            raise BadRequestException(
                f"Order sudah diambil (PICKED_UP) dan tidak dapat diubah statusnya lagi."
            )
        else:
            valid_status_names = [s.value for s in valid_next_statuses]
            raise BadRequestException(
                f"Status tidak dapat diubah dari {current_status.value} ke {new_status.value}. "
                f"Status berikutnya yang valid: {', '.join(valid_status_names)}"
            )

    order.current_status = new_status

    tracking_dict = tracking_data.model_dump()
    tracking_dict["order_id"] = order_id
    tracking_dict["staff_id"] = current_user.id

    tracking = OrderTracking(**tracking_dict)
    db.add(tracking)

    # Auto-release QR when order is PICKED_UP
    if new_status == OrderStatus.PICKED_UP:
        # If there are other non-picked-up orders for the same student,
        # keep the QR tied to the student to avoid breaking other ongoing processes.
        other_active_order = (
            db.query(Order)
            .filter(
                Order.student_id == order.student_id,
                Order.id != order_id,
                Order.current_status != OrderStatus.PICKED_UP,
            )
            .first()
        )

        if not other_active_order:
            qr = db.query(QR).filter(QR.student_id == order.student_id).first()
            if qr:
                qr.student_id = None
                qr.updated_by = current_user.id
                qr.updated_at = get_now_local()

    # Audit fields
    order.updated_by = current_user.id
    order.updated_at = get_now_local()

    db.commit()
    db.refresh(order)

    return WebResponse(
        status="success",
        message="Order status updated successfully",
        data=OrderWithTrackingRead.model_validate(order),
    )


