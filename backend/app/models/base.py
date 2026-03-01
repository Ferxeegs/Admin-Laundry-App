import uuid
from datetime import datetime
from sqlalchemy import Column, DateTime, String, CHAR
from sqlalchemy.sql import func
from app.db.base_class import Base

class TimestampMixin:
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

class AuditMixin:
    created_by = Column(String(36), nullable=True)
    updated_by = Column(String(36), nullable=True)
    deleted_by = Column(String(36), nullable=True)
    deleted_at = Column(DateTime(timezone=True), nullable=True)