"""
Media management endpoints.
"""
import os
import uuid
import mimetypes
from pathlib import Path
from typing import Optional
from fastapi import APIRouter, Depends, UploadFile, File, Form, HTTPException, status, Request, Query
from fastapi.responses import FileResponse, Response
from sqlalchemy.orm import Session

from app.api.deps import get_db, get_current_active_user
from app.models.auth import User
from app.models.common import Media
from app.schemas.common import WebResponse, MediaRead
from app.core.config import settings
from app.core.exceptions import BadRequestException, NotFoundException
from app.core.logging_config import root_logger

router = APIRouter()
logger = root_logger


def get_upload_base_path() -> Path:
    """Get the base upload directory as absolute path."""
    upload_base = Path(settings.UPLOAD_DIR)
    if upload_base.is_absolute():
        return upload_base
    
    # If relative, make it relative to the backend directory
    # From: backend/app/api/v1/endpoints/media.py
    # To: backend/
    backend_dir = Path(__file__).parent.parent.parent.parent.parent
    return backend_dir / upload_base


def ensure_upload_dir(model_type: str, collection: str) -> Path:
    """Ensure upload directory exists and return path."""
    upload_base = get_upload_base_path()
    upload_dir = upload_base / model_type.lower() / collection
    upload_dir.mkdir(parents=True, exist_ok=True)
    logger.info(f"Upload directory: {upload_dir} (absolute: {upload_dir.resolve()})")
    return upload_dir


def get_file_path_from_url(url: str) -> Path:
    """Convert URL to file system path."""
    # URL format: /uploads/{model_type}/{collection}/{filename}
    # Remove leading /uploads/ to get relative path
    relative_path = url.lstrip('/uploads/')
    
    upload_base = get_upload_base_path()
    file_path = upload_base / relative_path
    
    # Normalize path separators for Windows
    file_path = Path(str(file_path).replace('/', '\\'))
    
    logger.info(f"URL: {url} -> Relative path: {relative_path}")
    logger.info(f"Upload base: {upload_base} (absolute: {upload_base.resolve()})")
    logger.info(f"File path: {file_path} (absolute: {file_path.resolve()})")
    logger.info(f"File exists: {file_path.exists()}")
    
    return file_path


# IMPORTANT: This endpoint must be defined BEFORE /{media_id} to avoid route conflicts
@router.get("/serve/{model_type}/{collection}/{filename:path}")
async def serve_media_file(
    model_type: str,
    collection: str,
    filename: str,
    request: Request
    # Note: No authentication required for serving static files
    # This allows images to be displayed in img tags
):
    """
    Serve media file with proper Content-Type headers.
    This endpoint ensures images are served with correct MIME types.
    Using :path to handle filenames with special characters.
    """
    try:
        logger.info(f"Serve request: model_type={model_type}, collection={collection}, filename={filename}")
        logger.info(f"Request URL: {request.url}")
        
        # Construct file path directly
        upload_base = get_upload_base_path()
        file_path = upload_base / model_type.lower() / collection / filename
        
        # Normalize path for Windows
        file_path = Path(str(file_path).replace('/', '\\'))
        
        logger.info(f"Upload base: {upload_base} (absolute: {upload_base.resolve()})")
        logger.info(f"Looking for file at: {file_path} (absolute: {file_path.resolve()})")
        logger.info(f"File exists: {file_path.exists()}")
        
        # Also try alternative path construction
        if not file_path.exists():
            # Try using get_file_path_from_url
            alt_path = get_file_path_from_url(f"/uploads/{model_type.lower()}/{collection}/{filename}")
            logger.info(f"Alternative path: {alt_path} (absolute: {alt_path.resolve()})")
            logger.info(f"Alternative path exists: {alt_path.exists()}")
            if alt_path.exists():
                file_path = alt_path
        
        if not file_path.exists():
            logger.warning(f"File not found: {file_path}")
            logger.warning(f"File path absolute: {file_path.resolve()}")
            # List files in directory for debugging
            dir_path = upload_base / model_type.lower() / collection
            if dir_path.exists():
                files = list(dir_path.iterdir())
                logger.warning(f"Files in directory {dir_path}: {[f.name for f in files]}")
            raise NotFoundException(f"File not found: {filename}")
        
        # Determine MIME type
        mime_type, _ = mimetypes.guess_type(str(file_path))
        if not mime_type:
            # Fallback to common image types
            ext = file_path.suffix.lower()
            mime_type_map = {
                '.png': 'image/png',
                '.jpg': 'image/jpeg',
                '.jpeg': 'image/jpeg',
                '.gif': 'image/gif',
                '.webp': 'image/webp',
                '.svg': 'image/svg+xml',
            }
            mime_type = mime_type_map.get(ext, 'application/octet-stream')
        
        logger.info(f"Serving file: {file_path} with MIME type: {mime_type}")
        
        # Return file with proper headers
        return FileResponse(
            path=str(file_path),
            media_type=mime_type,
            headers={
                "Cache-Control": "public, max-age=31536000",  # Cache for 1 year
                "Content-Disposition": f'inline; filename="{filename}"'
            }
        )
    except NotFoundException:
        raise
    except Exception as e:
        logger.error(f"Error serving file: {e}", exc_info=True)
        raise NotFoundException(f"Error serving file: {str(e)}")


# IMPORTANT: Endpoint with query parameters must be defined BEFORE path parameters
@router.get("/", response_model=WebResponse[list[MediaRead]])
def get_media_by_model(
    model_type: str = Query(..., description="Model type (e.g., 'Student', 'User')"),
    model_id: str = Query(..., description="Model ID"),
    collection: Optional[str] = Query(None, description="Collection name (e.g., 'profile-pictures')"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """
    Get media by model_type and model_id.
    Returns a list of media records matching the criteria.
    """
    try:
        logger.info(f"Get media request: model_type={model_type}, model_id={model_id}, collection={collection}")
        
        query = db.query(Media).filter(
            Media.model_type == model_type,
            Media.model_id == model_id
        )
        
        if collection:
            query = query.filter(Media.collection == collection)
        
        media_list = query.all()
        
        logger.info(f"Found {len(media_list)} media records")
        
        return WebResponse(
            status="success",
            data=[MediaRead.model_validate(m) for m in media_list]
        )
    except Exception as e:
        logger.error(f"Error getting media: {e}", exc_info=True)
        raise BadRequestException(f"Error getting media: {str(e)}")


@router.post("/upload", status_code=status.HTTP_201_CREATED)
async def upload_media(
    file: UploadFile = File(...),
    model_type: str = Form(...),
    model_id: str = Form(...),
    collection: str = Form("default"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """
    Upload a media file.
    """
    try:
        logger.info(f"Upload request received: model_type={model_type}, model_id={model_id}, collection={collection}, filename={file.filename}, content_type={file.content_type}")
        
        # Validate required fields
        if not model_type or not model_id:
            raise BadRequestException("model_type and model_id are required")
        
        # Validate file type (only images for now)
        if not file.content_type:
            logger.warning(f"No content_type provided for file: {file.filename}")
            raise BadRequestException("File content type is required")
        
        if not file.content_type.startswith('image/'):
            logger.warning(f"Invalid file type: {file.content_type} for file: {file.filename}")
            raise BadRequestException(f"Only image files are allowed. Received: {file.content_type}")
        
        # Validate file size
        file_content = await file.read()
        file_size = len(file_content)
        
        # Ensure MAX_UPLOAD_SIZE is reasonable (minimum 1MB for images)
        max_upload_size = settings.MAX_UPLOAD_SIZE
        if max_upload_size < 1048576:  # Less than 1MB
            logger.warning(f"MAX_UPLOAD_SIZE is too small ({max_upload_size} bytes). Using minimum 5MB for images.")
            max_upload_size = 5242880  # 5MB minimum for images
        
        logger.info(f"File size: {file_size} bytes (max: {max_upload_size} bytes = {max_upload_size / 1024 / 1024:.2f}MB)")
        
        if file_size == 0:
            logger.warning(f"Empty file uploaded: {file.filename}")
            raise BadRequestException("File is empty")
        
        if file_size > max_upload_size:
            logger.warning(f"File size exceeds limit: {file_size} > {max_upload_size}")
            raise BadRequestException(f"File size exceeds maximum allowed size of {max_upload_size / 1024 / 1024:.2f}MB. File size: {file_size / 1024 / 1024:.2f}MB")
    except BadRequestException:
        raise
    except Exception as e:
        logger.error(f"Error validating upload: {e}", exc_info=True)
        raise BadRequestException(f"Error validating file: {str(e)}")
    
    # Generate unique filename
    try:
        file_ext = Path(file.filename).suffix if file.filename else '.jpg'
        unique_filename = f"{uuid.uuid4().hex}{file_ext}"
        logger.info(f"Generated unique filename: {unique_filename}")
    except Exception as e:
        logger.error(f"Error generating filename: {e}", exc_info=True)
        raise BadRequestException(f"Error generating filename: {str(e)}")
    
    # Ensure upload directory exists
    try:
        upload_dir = ensure_upload_dir(model_type, collection)
        file_path = upload_dir / unique_filename
        logger.info(f"File will be saved to: {file_path.resolve()}")
    except Exception as e:
        logger.error(f"Error creating upload directory: {e}", exc_info=True)
        raise BadRequestException(f"Error creating upload directory: {str(e)}")
    
    # Save file
    try:
        with open(file_path, 'wb') as f:
            f.write(file_content)
        
        # Verify file was saved correctly
        if not file_path.exists():
            raise Exception("File was not created")
        
        saved_size = file_path.stat().st_size
        if saved_size != file_size:
            raise Exception(f"File size mismatch: expected {file_size}, got {saved_size}")
        
        logger.info(f"File saved successfully: {file_path} (size: {saved_size} bytes)")
    except Exception as e:
        logger.error(f"Error saving file {file_path}: {e}")
        # Clean up if file was partially created
        if file_path.exists():
            try:
                file_path.unlink()
            except:
                pass
        raise BadRequestException(f"Failed to save file: {str(e)}")
    
    # Generate URL (relative to uploads directory)
    # Format: /uploads/{model_type}/{collection}/{filename}
    relative_url = f"/uploads/{model_type.lower()}/{collection}/{unique_filename}"
    
    logger.info(f"Media URL: {relative_url}, File path: {file_path.resolve()}")
    
    # Check if media already exists for this model and collection
    existing_media = db.query(Media).filter(
        Media.model_type == model_type,
        Media.model_id == model_id,
        Media.collection == collection
    ).first()
    
    if existing_media:
        # Delete old file
        old_file_path = get_file_path_from_url(existing_media.url)
        if old_file_path.exists():
            try:
                old_file_path.unlink()
                logger.info(f"Deleted old file: {old_file_path}")
            except Exception as e:
                logger.error(f"Error deleting old file {old_file_path}: {e}")
                # Continue even if delete fails
        
        # Update existing media record
        try:
            existing_media.url = relative_url
            existing_media.file_name = file.filename or unique_filename  # Original filename
            existing_media.name = unique_filename  # Unique filename stored on server
            existing_media.mime_type = file.content_type or 'image/jpeg'
            existing_media.size = file_size
            
            db.commit()
            db.refresh(existing_media)
            
            logger.info(f"Media record updated in database: ID={existing_media.id}, URL={relative_url}")
        except Exception as e:
            db.rollback()
            logger.error(f"Error updating media record in database: {e}")
            # Delete the file we just saved since DB update failed
            if file_path.exists():
                try:
                    file_path.unlink()
                    logger.info(f"Deleted file due to DB error: {file_path}")
                except:
                    pass
            raise BadRequestException(f"Failed to update media record: {str(e)}")
        
        return WebResponse(
            status="success",
            message="Media updated successfully",
            data=MediaRead.model_validate(existing_media)
        )
    else:
        # Create new media record
        try:
            media = Media(
                model_type=model_type,
                model_id=model_id,
                collection=collection,
                url=relative_url,
                file_name=file.filename or unique_filename,  # Original filename
                name=unique_filename,  # Unique filename stored on server
                mime_type=file.content_type or 'image/jpeg',
                size=file_size
            )
            
            db.add(media)
            db.commit()
            db.refresh(media)
            
            logger.info(f"Media record created in database: ID={media.id}, URL={relative_url}")
        except Exception as e:
            db.rollback()
            logger.error(f"Error creating media record in database: {e}")
            # Delete the file we just saved since DB insert failed
            if file_path.exists():
                try:
                    file_path.unlink()
                    logger.info(f"Deleted file due to DB error: {file_path}")
                except:
                    pass
            raise BadRequestException(f"Failed to create media record: {str(e)}")
        
        return WebResponse(
            status="success",
            message="Media uploaded successfully",
            data=MediaRead.model_validate(media)
        )


@router.get("/{media_id}", response_model=WebResponse[MediaRead])
def get_media_by_id(
    media_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """
    Get media by ID.
    """
    media = db.query(Media).filter(Media.id == media_id).first()
    
    if not media:
        raise NotFoundException(f"Media with ID {media_id} not found")
    
    return WebResponse(
        status="success",
        data=MediaRead.model_validate(media)
    )


@router.delete("/{media_id}", response_model=WebResponse[dict])
def delete_media(
    media_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """
    Delete media by ID.
    """
    media = db.query(Media).filter(Media.id == media_id).first()
    
    if not media:
        raise NotFoundException(f"Media with ID {media_id} not found")
    
    # Delete file from filesystem
    file_path = get_file_path_from_url(media.url)
    if file_path.exists():
        try:
            file_path.unlink()
            logger.info(f"Deleted file: {file_path}")
        except Exception as e:
            logger.error(f"Error deleting file {file_path}: {e}")
            # Continue even if delete fails
    
    # Delete media record
    db.delete(media)
    db.commit()
    
    return WebResponse(
        status="success",
        message="Media deleted successfully"
    )

