"""
Main FastAPI application for Laundry Pondok.
"""
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from contextlib import asynccontextmanager
from pathlib import Path

# Import middleware untuk menangani Proxy (Fix Mixed Content)

from app.core.config import settings
from app.core.logging_config import root_logger
from app.core.exceptions import AppException
from app.api.v1 import api_router
from app.middleware.logging_middleware import LoggingMiddleware

logger = root_logger

@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    Lifespan context manager for startup and shutdown events.
    """
    # Startup
    logger.info(f"Starting {settings.PROJECT_NAME} v{settings.PROJECT_VERSION}")
    logger.info(f"Environment: {'Development' if settings.DEBUG else 'Production'}")
    yield
    # Shutdown
    logger.info(f"Shutting down {settings.PROJECT_NAME}")

# Inisialisasi FastAPI
app = FastAPI(
    title=settings.PROJECT_NAME,
    version=settings.PROJECT_VERSION,
    description="Backend API for Laundry Pondok Management System",
    docs_url=f"{settings.API_V1_STR}/docs" if settings.DEBUG else None,
    redoc_url=f"{settings.API_V1_STR}/redoc" if settings.DEBUG else None,
    openapi_url=f"{settings.API_V1_STR}/openapi.json" if settings.DEBUG else None,
    lifespan=lifespan
)

# --- FIX MIXED CONTENT ---
# Middleware ini wajib ada jika menggunakan Nginx Global Proxy agar 
# FastAPI mengenali header X-Forwarded-Proto (HTTPS)
# app.add_middleware(ProxyHeadersMiddleware, trusted_proxies="*")

# Setup CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.BACKEND_CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Add logging middleware
app.add_middleware(LoggingMiddleware)

# Global exception handler untuk AppException
@app.exception_handler(AppException)
async def app_exception_handler(request: Request, exc: AppException):
    """Handle custom application exceptions."""
    logger.error(f"AppException: {exc.detail} (status_code: {exc.status_code})")
    return JSONResponse(
        status_code=exc.status_code,
        content={
            "status": "error",
            "message": exc.detail,
            "error": exc.detail
        }
    )

# Global exception handler untuk Error umum
@app.exception_handler(Exception)
async def general_exception_handler(request: Request, exc: Exception):
    """Handle general exceptions."""
    logger.error(f"Unhandled exception: {exc}", exc_info=True)
    return JSONResponse(
        status_code=500,
        content={
            "status": "error",
            "message": "Internal server error"
        }
    )

# Include API router
app.include_router(api_router, prefix=settings.API_V1_STR)

# Mount static files untuk uploads
upload_dir = Path(settings.UPLOAD_DIR)
if not upload_dir.is_absolute():
    backend_dir = Path(__file__).parent.parent
    upload_dir = backend_dir / upload_dir

upload_dir.mkdir(parents=True, exist_ok=True)
logger.info(f"Static files directory: {upload_dir} (absolute: {upload_dir.resolve()})")
app.mount("/uploads", StaticFiles(directory=str(upload_dir)), name="uploads")

@app.get("/", tags=["Health"])
def health_check():
    """Health check endpoint."""
    return {
        "status": "healthy",
        "project": settings.PROJECT_NAME,
        "version": settings.PROJECT_VERSION
    }

@app.get("/health", tags=["Health"])
def health():
    """Detailed health check endpoint."""
    return {
        "status": "healthy",
        "project": settings.PROJECT_NAME,
        "version": settings.PROJECT_VERSION,
        "environment": "development" if settings.DEBUG else "production"
    }