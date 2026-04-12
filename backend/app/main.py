from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from contextlib import asynccontextmanager
from pathlib import Path

from zoneinfo import ZoneInfo

from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.cron import CronTrigger

from app.core.config import settings
from app.core.logging_config import root_logger
from app.core.exceptions import AppException
from app.api.v1 import api_router
from app.middleware.logging_middleware import LoggingMiddleware
from app.services.monthly_invoice_generation import run_scheduled_monthly_generation

logger = root_logger


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info(f"Starting {settings.PROJECT_NAME} v{settings.PROJECT_VERSION}")

    scheduler: BackgroundScheduler | None = None
    if settings.INVOICE_CRON_ENABLED:
        try:
            tz = ZoneInfo(settings.INVOICE_CRON_TIMEZONE)
        except Exception:
            logger.exception(
                "INVOICE_CRON_TIMEZONE=%r invalid; falling back to UTC for APScheduler",
                settings.INVOICE_CRON_TIMEZONE,
            )
            tz = ZoneInfo("UTC")
        scheduler = BackgroundScheduler(timezone=tz)
        scheduler.add_job(
            run_scheduled_monthly_generation,
            CronTrigger(day=1, hour=0, minute=0, second=0),
            id="monthly_invoices",
            replace_existing=True,
            max_instances=1,
            coalesce=True,
        )
        scheduler.start()
        logger.info(
            "Monthly invoice cron registered (day=1 00:00:00, timezone=%s)",
            settings.INVOICE_CRON_TIMEZONE,
        )

    yield

    if scheduler is not None:
        scheduler.shutdown(wait=False)
        logger.info("APScheduler shut down")

    logger.info(f"Shutting down {settings.PROJECT_NAME}")

app = FastAPI(
    title=settings.PROJECT_NAME,
    version=settings.PROJECT_VERSION,
    lifespan=lifespan,
    redirect_slashes=False # Penting untuk cegah redirect 307
)

# --- FIX HTTPS CLOUDFLARE ---
# Karena ProxyHeaders sudah ada di Dockerfile CMD, 
# kita cukup tambahkan middleware skema saja di sini.
@app.middleware("http")
async def set_https_scheme(request: Request, call_next):
    # Paksa FastAPI menganggap dirinya HTTPS jika header dari Cloudflare ada
    if request.headers.get("x-forwarded-proto") == "https":
        request.scope["scheme"] = "https"
    return await call_next(request)

# Setup CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.BACKEND_CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.add_middleware(LoggingMiddleware)

# Exception handlers tetap sama...
@app.exception_handler(AppException)
async def app_exception_handler(request: Request, exc: AppException):
    return JSONResponse(status_code=exc.status_code, content={"message": exc.detail})

app.include_router(api_router, prefix=settings.API_V1_STR)

# Mounting static files
upload_dir = Path(settings.UPLOAD_DIR)
upload_dir.mkdir(parents=True, exist_ok=True)
app.mount("/uploads", StaticFiles(directory=str(upload_dir)), name="uploads")

@app.get("/")
def health_check():
    return {"status": "healthy"}