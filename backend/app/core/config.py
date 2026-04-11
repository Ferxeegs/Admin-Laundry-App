"""
Application configuration settings.
All environment variables should be defined in .env file.
"""
from typing import List
from pydantic_settings import BaseSettings
from pydantic import Field


class Settings(BaseSettings):
    # Project Information
    PROJECT_NAME: str = "Laundry Pondok"
    PROJECT_VERSION: str = "1.0.0"
    API_V1_STR: str = "/api/v1"
    DEBUG: bool = Field(default=False, description="Debug mode")
    
    # Database
    DATABASE_URL: str = Field(..., description="Database connection URL")
    
    # Security
    SECRET_KEY: str = Field(..., description="Secret key for JWT tokens")
    ALGORITHM: str = Field(default="HS256", description="JWT algorithm")
    ACCESS_TOKEN_EXPIRE_MINUTES: int = Field(default=30, description="Access token expiration in minutes")
    REFRESH_TOKEN_EXPIRE_DAYS: int = Field(default=7, description="Refresh token expiration in days")
    
    # CORS
    BACKEND_CORS_ORIGINS: List[str] = Field(
        default=["http://localhost:3000", "http://localhost:8000"],
        description="Allowed CORS origins"
    )
    
    # Server
    HOST: str = Field(default="0.0.0.0", description="Server host")
    PORT: int = Field(default=8000, description="Server port")
    
    # Logging
    LOG_LEVEL: str = Field(default="INFO", description="Logging level")
    
    # Email (optional, for password reset)
    SMTP_TLS: bool = Field(default=True)
    SMTP_PORT: int = Field(default=587)
    SMTP_HOST: str = Field(default="")
    SMTP_USER: str = Field(default="")
    SMTP_PASSWORD: str = Field(default="")
    EMAILS_FROM_EMAIL: str = Field(default="")
    EMAILS_FROM_NAME: str = Field(default="")
    
    # File Upload
    MAX_UPLOAD_SIZE: int = Field(default=10485760, description="Max upload size in bytes (10MB)")
    UPLOAD_DIR: str = Field(default="uploads", description="Upload directory")

    # Xendit Payment Gateway
    XENDIT_SECRET_KEY: str = Field(default="", description="Xendit secret API key")
    XENDIT_WEBHOOK_TOKEN: str = Field(default="", description="Xendit webhook verification token")
    XENDIT_IS_PRODUCTION: bool = Field(default=False, description="Xendit production mode")
    FRONTEND_BASE_URL: str = Field(default="http://localhost", description="Frontend base URL for redirects")
    
    class Config:
        env_file = ".env"
        case_sensitive = True


settings = Settings()