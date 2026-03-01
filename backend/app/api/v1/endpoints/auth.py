"""
Authentication endpoints.
"""
from datetime import timedelta
from fastapi import APIRouter, Depends, HTTPException, status, Response
from sqlalchemy.orm import Session

from app.api.deps import get_db
from app.core.config import settings
from app.core.security import verify_password, create_access_token, get_password_hash
from app.core.exceptions import UnauthorizedException, BadRequestException
from app.models.auth import User
from app.schemas.auth import Token, LoginRequest
from app.schemas.user import UserCreate, UserRead
from app.schemas.common import WebResponse

router = APIRouter()


@router.post("/login", response_model=WebResponse[Token])
def login(
    login_data: LoginRequest,
    response: Response,
    db: Session = Depends(get_db)
):
    """
    User login endpoint.
    Supports login with either email or username.
    Sets access token in HttpOnly cookie for security.
    """
    # Find user by email or username
    if login_data.email:
        user = db.query(User).filter(User.email == login_data.email).first()
    else:
        user = db.query(User).filter(User.username == login_data.username).first()
    
    if not user or not verify_password(login_data.password, user.password):
        raise UnauthorizedException("Incorrect email/username or password")
    
    if user.deleted_at is not None:
        raise UnauthorizedException("User account is inactive")
    
    # Calculate token expiration based on remember_me
    if login_data.remember_me:
        access_token_expires = timedelta(days=30)  # 30 days for remember me
        max_age = 30 * 24 * 60 * 60  # 30 days in seconds
    else:
        access_token_expires = timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
        max_age = settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60  # Convert to seconds
    
    access_token = create_access_token(
        data={"sub": user.username, "user_id": user.id},
        expires_delta=access_token_expires
    )
    
    # Set access token in HttpOnly cookie
    response.set_cookie(
        key="access_token",
        value=access_token,
        max_age=max_age,
        httponly=True,
        samesite="lax",
        secure=False,  # Set to True in production with HTTPS
        path="/"
    )
    
    return WebResponse(
        status="success",
        message="Login successful",
        data=Token(access_token=access_token, token_type="bearer")
    )


@router.post("/register", response_model=WebResponse[UserRead])
def register(
    user_data: UserCreate,
    db: Session = Depends(get_db)
):
    """
    User registration endpoint.
    """
    # Check if username already exists
    if db.query(User).filter(User.username == user_data.username).first():
        raise BadRequestException("Username already registered")
    
    # Check if email already exists
    if db.query(User).filter(User.email == user_data.email).first():
        raise BadRequestException("Email already registered")
    
    # Create new user
    hashed_password = get_password_hash(user_data.password)
    db_user = User(
        username=user_data.username,
        email=user_data.email,
        firstname=user_data.firstname,
        lastname=user_data.lastname,
        fullname=user_data.fullname,
        phone_number=user_data.phone_number,
        password=hashed_password
    )
    
    db.add(db_user)
    db.commit()
    db.refresh(db_user)
    
    return WebResponse(
        status="success",
        message="User registered successfully",
        data=UserRead.model_validate(db_user)
    )

