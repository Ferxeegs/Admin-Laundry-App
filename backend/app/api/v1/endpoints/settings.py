"""
Settings management endpoints.
"""
from typing import Optional, Dict, Any
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy import and_

from app.api.deps import get_db, get_current_active_user
from app.models.common import Setting
from app.models.auth import User
from app.schemas.setting import (
    SettingRead, SettingCreate, SettingUpdate, SettingUpsert, SettingMultipleUpdate
)
from app.schemas.common import WebResponse
from app.core.exceptions import NotFoundException, BadRequestException, ForbiddenException

router = APIRouter()


@router.get("/", response_model=WebResponse[list[SettingRead]])
def get_all_settings(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """
    Get all settings.
    """
    settings = db.query(Setting).order_by(Setting.group, Setting.name).all()
    
    return WebResponse(
        status="success",
        data=[SettingRead.model_validate(s) for s in settings]
    )


@router.get("/group/{group_name}", response_model=WebResponse[Dict[str, Any]])
def get_settings_by_group(
    group_name: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """
    Get all settings in a group as a dictionary.
    Returns settings as {name: payload} format.
    """
    settings = db.query(Setting).filter(Setting.group == group_name).all()
    
    result = {}
    for setting in settings:
        result[setting.name] = setting.payload
    
    return WebResponse(
        status="success",
        data=result
    )


@router.get("/{group_name}/{setting_name}", response_model=WebResponse[Dict[str, Any]])
def get_setting(
    group_name: str,
    setting_name: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """
    Get a single setting by group and name.
    """
    setting = db.query(Setting).filter(
        and_(
            Setting.group == group_name,
            Setting.name == setting_name
        )
    ).first()
    
    if not setting:
        raise NotFoundException(
            f"Setting '{setting_name}' in group '{group_name}' not found"
        )
    
    return WebResponse(
        status="success",
        data={"value": setting.payload}
    )


@router.post("/", response_model=WebResponse[SettingRead], status_code=status.HTTP_201_CREATED)
def create_setting(
    setting_data: SettingCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """
    Create a new setting (or update if exists - upsert behavior).
    """
    # Check if setting already exists
    existing = db.query(Setting).filter(
        and_(
            Setting.group == setting_data.group,
            Setting.name == setting_data.name
        )
    ).first()
    
    if existing:
        # Update existing setting if not locked
        if existing.locked == 1:
            raise ForbiddenException("Setting is locked and cannot be modified")
        
        existing.payload = setting_data.payload
        if setting_data.locked is not None:
            existing.locked = 1 if setting_data.locked else 0
        
        db.commit()
        db.refresh(existing)
        
        return WebResponse(
            status="success",
            message="Setting updated successfully",
            data=SettingRead.model_validate(existing)
        )
    
    # Create new setting
    setting = Setting(
        group=setting_data.group,
        name=setting_data.name,
        payload=setting_data.payload,
        locked=1 if setting_data.locked else 0
    )
    
    db.add(setting)
    db.commit()
    db.refresh(setting)
    
    return WebResponse(
        status="success",
        message="Setting created successfully",
        data=SettingRead.model_validate(setting)
    )


@router.put("/{group_name}/{setting_name}", response_model=WebResponse[SettingRead])
def update_setting(
    group_name: str,
    setting_name: str,
    setting_update: SettingUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """
    Update a setting by group and name.
    """
    setting = db.query(Setting).filter(
        and_(
            Setting.group == group_name,
            Setting.name == setting_name
        )
    ).first()
    
    if not setting:
        raise NotFoundException(
            f"Setting '{setting_name}' in group '{group_name}' not found"
        )
    
    if setting.locked == 1:
        raise ForbiddenException("Setting is locked and cannot be modified")
    
    update_data = setting_update.model_dump(exclude_unset=True)
    
    if "payload" in update_data:
        setting.payload = update_data["payload"]
    
    if "locked" in update_data:
        setting.locked = 1 if update_data["locked"] else 0
    
    db.commit()
    db.refresh(setting)
    
    return WebResponse(
        status="success",
        message="Setting updated successfully",
        data=SettingRead.model_validate(setting)
    )


@router.put("/multiple", response_model=WebResponse[list[SettingRead]])
def update_multiple_settings(
    settings_data: SettingMultipleUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """
    Update multiple settings at once.
    """
    updated_settings = []
    
    for setting_data in settings_data.settings:
        # Find existing setting
        existing = db.query(Setting).filter(
            and_(
                Setting.group == setting_data.group,
                Setting.name == setting_data.name
            )
        ).first()
        
        if existing:
            # Update existing if not locked
            if existing.locked == 1:
                continue  # Skip locked settings
            
            existing.payload = setting_data.payload
            if setting_data.locked is not None:
                existing.locked = 1 if setting_data.locked else 0
            
            db.flush()
            updated_settings.append(existing)
        else:
            # Create new setting
            new_setting = Setting(
                group=setting_data.group,
                name=setting_data.name,
                payload=setting_data.payload,
                locked=1 if setting_data.locked else 0
            )
            db.add(new_setting)
            db.flush()
            updated_settings.append(new_setting)
    
    db.commit()
    
    # Refresh all settings
    for setting in updated_settings:
        db.refresh(setting)
    
    return WebResponse(
        status="success",
        message="Settings updated successfully",
        data=[SettingRead.model_validate(s) for s in updated_settings]
    )


@router.delete("/{group_name}/{setting_name}", response_model=WebResponse[None])
def delete_setting(
    group_name: str,
    setting_name: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """
    Delete a setting by group and name.
    """
    setting = db.query(Setting).filter(
        and_(
            Setting.group == group_name,
            Setting.name == setting_name
        )
    ).first()
    
    if not setting:
        raise NotFoundException(
            f"Setting '{setting_name}' in group '{group_name}' not found"
        )
    
    if setting.locked == 1:
        raise ForbiddenException("Setting is locked and cannot be deleted")
    
    db.delete(setting)
    db.commit()
    
    return WebResponse(
        status="success",
        message="Setting deleted successfully"
    )

