from typing import Callable, List, Union
from fastapi import Depends, HTTPException, status
from app.models.auth import User
from app.core.dependencies import get_current_active_user

def _user_has_permission(user, permission_names):
    required = [permission_names] if isinstance(permission_names, str) else permission_names
    if user.roles:
        for role in user.roles:
            if getattr(role, "name", None) == "superadmin":
                return True
    names = set()
    if user.roles:
        for role in user.roles:
            if getattr(role, "permissions", None):
                for p in role.permissions:
                    names.add(p.name)
    return any(p in names for p in required)

def require_permission(permission_names):
    def dependency(current_user: User = Depends(get_current_active_user)) -> User:
        if not _user_has_permission(current_user, permission_names):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Insufficient permissions")
        return current_user
    return dependency
