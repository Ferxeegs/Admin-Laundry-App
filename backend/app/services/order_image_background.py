"""
Background persistence for order images (write to disk + DB after HTTP response).
"""
from __future__ import annotations

import uuid
from pathlib import Path
from typing import List, Optional, Tuple

from app.api.v1.endpoints.media import ensure_upload_dir
from app.core.config import settings
from app.core.logging_config import root_logger
from app.db.session import SessionLocal
from app.models.common import Media

logger = root_logger

ImagePayload = Tuple[bytes, Optional[str], Optional[str]]


def process_order_images_background(order_id: str, image_payloads: List[ImagePayload]) -> None:
    """
    Save order images to disk and create Media rows. Runs in a FastAPI BackgroundTask
    with a fresh DB session so the client can receive the HTTP response immediately.
    """
    if not image_payloads:
        return

    model_type = "Order"
    collection = "images"
    db = SessionLocal()
    try:
        upload_dir = ensure_upload_dir(model_type, collection)
        media_records: list[Media] = []

        for idx, (file_content, orig_filename, content_type) in enumerate(image_payloads):
            try:
                if not content_type or not content_type.startswith("image/"):
                    logger.warning(f"Skipping non-image: {orig_filename}")
                    continue
                file_size = len(file_content)
                if file_size == 0:
                    continue
                if file_size > settings.MAX_UPLOAD_SIZE:
                    logger.warning(f"Skipping oversized file: {orig_filename}")
                    continue

                suffix = Path(orig_filename or "").suffix.lower()
                if not suffix or len(suffix) > 6:
                    suffix = ".webp" if content_type == "image/webp" else ".jpg"
                unique_filename = f"{uuid.uuid4().hex}{suffix}"
                file_path = upload_dir / unique_filename

                with open(file_path, "wb") as f:
                    f.write(file_content)

                if not file_path.exists():
                    logger.error(f"File was not saved: {file_path}")
                    continue

                saved_size = file_path.stat().st_size
                if saved_size != file_size:
                    try:
                        file_path.unlink()
                    except OSError:
                        pass
                    continue

                relative_url = f"/uploads/{model_type.lower()}/{collection}/{unique_filename}"
                media = Media(
                    model_type=model_type,
                    model_id=order_id,
                    collection=collection,
                    url=relative_url,
                    file_name=orig_filename or unique_filename,
                    name=unique_filename,
                    mime_type=content_type or "image/jpeg",
                    size=file_size,
                )
                db.add(media)
                media_records.append(media)
            except Exception as e:
                logger.error(f"Error processing image {idx + 1} for order {order_id}: {e}", exc_info=True)

        if media_records:
            db.commit()
            for m in media_records:
                db.refresh(m)
            logger.info(f"Saved {len(media_records)} image(s) for order {order_id}")
    except Exception as e:
        logger.error(f"process_order_images_background failed for order {order_id}: {e}", exc_info=True)
        try:
            db.rollback()
        except Exception:
            pass
    finally:
        db.close()
