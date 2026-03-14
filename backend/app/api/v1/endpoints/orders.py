"""
Order management endpoints.
"""
from typing import Optional, List

from fastapi import APIRouter, Depends, Query, status, UploadFile, File, Form, Request
from starlette.datastructures import UploadFile as StarletteUploadFile
from sqlalchemy.orm import Session, joinedload

from app.api.deps import get_db, get_current_active_user
from app.core.deps_permission import require_permission
from app.models.auth import User
from app.models.order import Order, OrderStatus, OrderTracking
from app.schemas.common import WebResponse
from app.schemas.order import (
    OrderRead,
    OrderCreate,
    OrderUpdate,
    OrderWithTrackingRead,
    OrderTrackingRead,
    OrderTrackingCreate,
)
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


@router.get("/", response_model=WebResponse[dict])
def get_all_orders(
    page: int = Query(1, ge=1),
    limit: int = Query(10, ge=1, le=100),
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
        # For now, search by order_number
        query = query.filter(Order.order_number.ilike(f"%{search}%"))

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
                "unique_code": order.student.unique_code,
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
    "/", response_model=WebResponse[OrderRead], status_code=status.HTTP_201_CREATED
)
async def create_order(
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_permission("create_order")),
):
    """
    Create a new order for a student.
    Staff only inputs total_items, system automatically calculates:
    - free_items_used (based on monthly quota: 4 free items per month)
    - paid_items_count (items exceeding quota)
    - additional_fee (paid_items_count * 4000)
    """
    from datetime import datetime, timezone
    from sqlalchemy import func, extract

    # Generate order number: "ORD-{YYMMDD}-{sequence}"
    # Format: ORD-240113-001 (where 001 is the order number for that day)
    now = datetime.now(timezone.utc)
    date_str = now.strftime("%y%m%d")
    
    # Count how many orders were created today
    start_of_day = now.replace(hour=0, minute=0, second=0, microsecond=0)
    orders_today_count = db.query(Order).filter(
        Order.created_at >= start_of_day
    ).count()
    
    # Generate sequence number (1-based, padded to 3 digits)
    sequence = orders_today_count + 1
    order_number = f"ORD-{date_str}-{sequence:03d}"
    
    # Ensure uniqueness by checking if order_number already exists
    # If exists, increment sequence until unique
    while db.query(Order).filter(Order.order_number == order_number).first():
        sequence += 1
        order_number = f"ORD-{date_str}-{sequence:03d}"
        if sequence > 999:  # Safety limit (3 digits max)
            # Fallback: add timestamp if too many orders in one day
            timestamp = now.strftime("%y%m%d-%H%M%S")
            order_number = f"ORD-{timestamp}"
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

    # Calculate monthly quota usage
    # Each student has 4 free items per month
    MONTHLY_QUOTA = 4
    PRICE_PER_ITEM = 4000.0

    # Get current month and year
    current_month = now.month
    current_year = now.year

    # Calculate how many free items already used this month
    free_items_used_this_month = (
        db.query(func.sum(Order.free_items_used))
        .filter(
            Order.student_id == student_id,
            extract("month", Order.created_at) == current_month,
            extract("year", Order.created_at) == current_year,
        )
        .scalar() or 0
    )

    # Calculate remaining quota
    remaining_quota = max(0, MONTHLY_QUOTA - free_items_used_this_month)

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

    # Handle image uploads if provided
    if images and len(images) > 0:
        logger.info(f"Processing {len(images)} images for order {order.id}")
        try:
            from app.models.common import Media
            from app.api.v1.endpoints.media import ensure_upload_dir
            from pathlib import Path
            import uuid
            from app.core.config import settings
            
            model_type = "Order"
            collection = "images"
            upload_dir = ensure_upload_dir(model_type, collection)
            logger.info(f"Upload directory: {upload_dir}")
            
            media_records = []
            
            # Process each image
            for idx, image in enumerate(images):
                try:
                    logger.info(f"Processing image {idx + 1}/{len(images)}: {image.filename}")
                    
                    # Validate file type (only images)
                    if not image.content_type or not image.content_type.startswith('image/'):
                        logger.warning(f"Skipping non-image file: {image.filename} (content_type: {image.content_type})")
                        continue
                    
                    # Read file content
                    file_content = await image.read()
                    file_size = len(file_content)
                    logger.info(f"Image {image.filename} size: {file_size} bytes")
                    
                    # Validate file size
                    if file_size == 0:
                        logger.warning(f"Skipping empty file: {image.filename}")
                        continue
                    if file_size > settings.MAX_UPLOAD_SIZE:
                        logger.warning(f"Skipping file {image.filename}: size exceeds maximum ({settings.MAX_UPLOAD_SIZE / 1024 / 1024:.2f}MB)")
                        continue
                    
                    # Generate unique filename
                    file_ext = Path(image.filename).suffix if image.filename else '.jpg'
                    unique_filename = f"{uuid.uuid4().hex}{file_ext}"
                    file_path = upload_dir / unique_filename
                    logger.info(f"Saving file to: {file_path}")
                    
                    # Save file to filesystem
                    with open(file_path, 'wb') as f:
                        f.write(file_content)
                    
                    # Verify file was saved
                    if not file_path.exists():
                        logger.error(f"File was not saved: {file_path}")
                        continue
                    
                    saved_size = file_path.stat().st_size
                    if saved_size != file_size:
                        logger.error(f"File size mismatch: expected {file_size}, got {saved_size}")
                        # Delete the file if size mismatch
                        try:
                            file_path.unlink()
                        except:
                            pass
                        continue
                    
                    logger.info(f"File saved successfully: {file_path} (size: {saved_size} bytes)")
                    
                    # Generate URL
                    relative_url = f"/uploads/{model_type.lower()}/{collection}/{unique_filename}"
                    
                    # Create media record
                    media = Media(
                        model_type=model_type,
                        model_id=order.id,
                        collection=collection,
                        url=relative_url,
                        file_name=image.filename or unique_filename,
                        name=unique_filename,
                        mime_type=image.content_type or 'image/jpeg',
                        size=file_size
                    )
                    
                    db.add(media)
                    media_records.append(media)
                    logger.info(f"Media record added to session: {media.file_name}")
                    
                except Exception as e:
                    # Log error for individual image but continue with other images
                    logger.error(f"Error uploading image {image.filename} for order {order.id}: {e}", exc_info=True)
                    continue
            
            # Commit all media records at once (using a separate transaction)
            if media_records:
                try:
                    # Use flush first to validate, then commit
                    db.flush()
                    db.commit()
                    logger.info(f"Successfully committed {len(media_records)} media records to database for order {order.id}")
                    
                    # Refresh all media records to get their IDs
                    for media in media_records:
                        db.refresh(media)
                        logger.info(f"Media record saved: ID={media.id}, model_id={media.model_id}, url={media.url}")
                    
                    # Verify records were actually saved
                    saved_count = db.query(Media).filter(
                        Media.model_type == model_type,
                        Media.model_id == order.id,
                        Media.collection == collection
                    ).count()
                    logger.info(f"Verified: {saved_count} media records found in database for order {order.id}")
                    
                    if saved_count != len(media_records):
                        logger.warning(f"Media count mismatch: expected {len(media_records)}, found {saved_count}")
                        
                except Exception as e:
                    db.rollback()
                    logger.error(f"Error committing media records to database: {e}", exc_info=True)
                    # Delete files that were saved but not committed to DB
                    for media in media_records:
                        try:
                            file_path = upload_dir / media.name
                            if file_path.exists():
                                file_path.unlink()
                                logger.info(f"Deleted file due to DB error: {file_path}")
                        except Exception as del_err:
                            logger.error(f"Error deleting file {media.name}: {del_err}")
                    # Don't raise - order was already created, just log the error
                    logger.error(f"Order {order.id} created but images failed to save to database")
            else:
                logger.info("No media records to commit")
                
        except BadRequestException:
            raise
        except Exception as e:
            # Log error but don't fail order creation if image upload fails
            logger.error(f"Error uploading images for order {order.id}: {e}", exc_info=True)
            # Rollback any uncommitted changes
            try:
                db.rollback()
            except:
                pass
            # Continue without images
    else:
        logger.info(f"No images to process for order {order.id}")

    db.refresh(order)

    return WebResponse(
        status="success",
        message="Order created successfully",
        data=OrderRead.model_validate(order),
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
    - free_items_used (based on monthly quota: 4 free items per month)
    - paid_items_count (items exceeding quota)
    - additional_fee (paid_items_count * 4000)
    
    Note: If order status is WASHING_DRYING or later, only notes can be updated.
    """
    from datetime import datetime, timezone
    from sqlalchemy import func, extract

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
        MONTHLY_QUOTA = 4
        PRICE_PER_ITEM = 4000.0

        # Get the month when this order was created (use original created_at)
        order_month = order.created_at.month if order.created_at else datetime.now(timezone.utc).month
        order_year = order.created_at.year if order.created_at else datetime.now(timezone.utc).year

        # Calculate how many free items already used this month (excluding current order)
        free_items_used_this_month = (
            db.query(func.sum(Order.free_items_used))
            .filter(
                Order.student_id == order.student_id,
                Order.id != order_id,  # Exclude current order
                extract("month", Order.created_at) == order_month,
                extract("year", Order.created_at) == order_year,
            )
            .scalar() or 0
        )

        # Calculate remaining quota
        remaining_quota = max(0, MONTHLY_QUOTA - free_items_used_this_month)

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
    """
    order = db.query(Order).filter(Order.id == order_id).first()

    if not order:
        raise NotFoundException(f"Order with ID {order_id} not found")

    db.delete(order)
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
    current_user: User = Depends(require_permission("update_order_status")),
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

    # Audit fields
    from datetime import datetime, timezone

    order.updated_by = current_user.id
    order.updated_at = datetime.now(timezone.utc)

    db.commit()
    db.refresh(order)

    return WebResponse(
        status="success",
        message="Order status updated successfully",
        data=OrderWithTrackingRead.model_validate(order),
    )


