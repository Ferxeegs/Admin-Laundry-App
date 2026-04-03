"""
API v1 routes.
"""
from fastapi import APIRouter
from app.api.v1.endpoints import (
    auth,
    users,
    roles,
    settings,
    students,
    media,
    orders,
    invoices,
    reports,
    qr_codes,
    dormitories,
)

api_router = APIRouter()

# Include all endpoint routers
api_router.include_router(auth.router, prefix="/auth", tags=["Authentication"])
api_router.include_router(users.router, prefix="/users", tags=["Users"])
api_router.include_router(roles.router, prefix="/roles", tags=["Roles"])
api_router.include_router(settings.router, prefix="/settings", tags=["Settings"])
api_router.include_router(students.router, prefix="/students", tags=["Students"])
api_router.include_router(media.router, prefix="/media", tags=["Media"])
api_router.include_router(orders.router, prefix="/orders", tags=["Orders"])
api_router.include_router(invoices.router, prefix="/invoices", tags=["Invoices"])
api_router.include_router(reports.router, prefix="/reports", tags=["Reports"])
api_router.include_router(qr_codes.router, prefix="/qr-codes", tags=["QR Codes"])
api_router.include_router(dormitories.router, prefix="/dormitories", tags=["Dormitories"])
