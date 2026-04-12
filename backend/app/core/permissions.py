"""Role checks shared across endpoints."""

from sqlalchemy.orm import Session

from app.models.auth import User


def has_superadmin_role(user: User, db: Session) -> bool:
    db.refresh(user, ["roles"])
    return any(role.name == "superadmin" for role in (user.roles or []))
