"""
Payment endpoints for Xendit payment gateway integration.
Public endpoints (no auth required) for creating payments and handling webhooks.
"""

from __future__ import annotations

import json
import logging
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, Request, Header
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session, joinedload

from app.api.deps import get_db
from app.core.config import settings
from app.core.exceptions import NotFoundException, BadRequestException
from app.models.invoice import Invoice, InvoiceStatus
from app.models.payment import Payment, PaymentStatus
from app.schemas.common import WebResponse
from app.schemas.payment import PaymentRead, PaymentCreateResponse, XenditCallbackPayload
from app.services.xendit_service import create_xendit_invoice, verify_webhook_token, get_xendit_invoice

router = APIRouter()
logger = logging.getLogger(__name__)


@router.post(
    "/create/{invoice_id}",
    response_model=WebResponse[PaymentCreateResponse],
    summary="Create a payment for an invoice via Xendit",
)
def create_payment(
    invoice_id: str,
    db: Session = Depends(get_db),
):
    """
    Public endpoint — no auth required.
    Creates a Xendit Invoice for the given internal invoice.

    - Validates the invoice exists and is unpaid
    - Reuses existing PENDING payment if one exists
    - Creates new Xendit Invoice otherwise
    """

    # 1. Fetch invoice with student data
    invoice = (
        db.query(Invoice)
        .options(joinedload(Invoice.student))
        .filter(Invoice.id == invoice_id)
        .first()
    )
    if not invoice:
        raise NotFoundException(f"Invoice with ID {invoice_id} not found")

    # 2. Validate invoice is eligible for payment
    if invoice.status == InvoiceStatus.PAID:
        raise BadRequestException("Invoice sudah dibayar")
    if invoice.status == InvoiceStatus.CANCELLED:
        raise BadRequestException("Invoice dibatalkan, tidak bisa dibayar")

    # 3. Check for existing PENDING payment
    existing_payment = (
        db.query(Payment)
        .filter(
            Payment.invoice_id == invoice_id,
            Payment.status == PaymentStatus.PENDING,
        )
        .first()
    )

    if existing_payment and existing_payment.xendit_invoice_url:
        logger.info(
            "Reusing existing PENDING payment %s for invoice %s",
            existing_payment.id,
            invoice_id,
        )
        return WebResponse(
            status="success",
            message="Payment link sudah tersedia",
            data=PaymentCreateResponse(
                payment_id=existing_payment.id,
                xendit_invoice_url=existing_payment.xendit_invoice_url,
                external_id=existing_payment.external_id,
                status=existing_payment.status,
            ),
        )

    # 4. Build external_id and redirect URLs
    timestamp = int(datetime.now(timezone.utc).timestamp())
    external_id = f"PAY-{invoice.invoice_number.replace('/', '-')}-{timestamp}"

    base_url = settings.FRONTEND_BASE_URL.rstrip("/")
    success_url = f"{base_url}/public/payment/result/{invoice_id}?status=success"
    failure_url = f"{base_url}/public/payment/result/{invoice_id}?status=failed"

    student_name = invoice.student.fullname if invoice.student else "Pelanggan"
    amount = float(invoice.total_amount)

    if amount <= 0:
        raise BadRequestException("Jumlah tagihan harus lebih dari 0")

    # 5. Create Xendit Invoice
    try:
        xendit_response = create_xendit_invoice(
            external_id=external_id,
            amount=amount,
            description=f"Pembayaran tagihan laundry {invoice.invoice_number}",
            customer_name=student_name,
            invoice_number=invoice.invoice_number,
            success_redirect_url=success_url,
            failure_redirect_url=failure_url,
        )
    except Exception as e:
        logger.error("Failed to create Xendit invoice: %s", str(e))
        raise BadRequestException(f"Gagal membuat pembayaran: {str(e)}")

    # 6. Save Payment record
    payment = Payment(
        invoice_id=invoice_id,
        xendit_invoice_id=xendit_response.get("id"),
        xendit_invoice_url=xendit_response.get("invoice_url"),
        external_id=external_id,
        amount=amount,
        status=PaymentStatus.PENDING,
    )
    db.add(payment)

    # Reset FAILED invoice back to UNPAID on retry
    if invoice.status == InvoiceStatus.FAILED:
        invoice.status = InvoiceStatus.UNPAID
    invoice.updated_at = datetime.now(timezone.utc)

    db.commit()
    db.refresh(payment)

    logger.info(
        "Payment created: payment_id=%s, xendit_invoice_id=%s",
        payment.id,
        payment.xendit_invoice_id,
    )

    return WebResponse(
        status="success",
        message="Payment link berhasil dibuat",
        data=PaymentCreateResponse(
            payment_id=payment.id,
            xendit_invoice_url=payment.xendit_invoice_url,
            external_id=payment.external_id,
            status=payment.status,
        ),
    )


@router.post(
    "/xendit/callback",
    summary="Xendit webhook callback handler",
)
async def xendit_callback(
    request: Request,
    db: Session = Depends(get_db),
    x_callback_token: str = Header(None, alias="x-callback-token"),
):
    """
    Webhook endpoint called by Xendit when payment status changes.
    Protected via x-callback-token header verification.
    """

    # 1. Verify webhook token
    if not x_callback_token or not verify_webhook_token(x_callback_token):
        logger.warning("Invalid webhook token received")
        return JSONResponse(status_code=403, content={"message": "Invalid token"})

    # 2. Parse the callback body
    try:
        body = await request.json()
    except Exception:
        logger.error("Failed to parse webhook body")
        return JSONResponse(status_code=400, content={"message": "Invalid body"})

    logger.info("Xendit callback received: %s", json.dumps(body, default=str))

    external_id = body.get("external_id")
    xendit_status = body.get("status", "").upper()

    if not external_id:
        logger.error("Webhook missing external_id")
        return JSONResponse(status_code=400, content={"message": "Missing external_id"})

    # 3. Find payment by external_id
    payment = (
        db.query(Payment)
        .filter(Payment.external_id == external_id)
        .first()
    )

    if not payment:
        logger.warning("Payment not found for external_id=%s", external_id)
        # Return 200 anyway to prevent Xendit from retrying
        return JSONResponse(status_code=200, content={"message": "Payment not found, acknowledged"})

    # 4. Update payment record
    payment.xendit_callback_data = json.dumps(body, default=str)
    payment.payment_method = body.get("payment_method")
    payment.payment_channel = body.get("payment_channel")

    if xendit_status == "PAID":
        payment.status = PaymentStatus.PAID
        paid_at_str = body.get("paid_at")
        if paid_at_str:
            try:
                payment.paid_at = datetime.fromisoformat(
                    paid_at_str.replace("Z", "+00:00")
                )
            except (ValueError, TypeError):
                payment.paid_at = datetime.now(timezone.utc)
        else:
            payment.paid_at = datetime.now(timezone.utc)

        # Auto-update related invoice to PAID
        invoice = db.query(Invoice).filter(Invoice.id == payment.invoice_id).first()
        if invoice and invoice.status != InvoiceStatus.PAID:
            invoice.status = InvoiceStatus.PAID
            invoice.paid_at = payment.paid_at
            invoice.updated_at = datetime.now(timezone.utc)
            logger.info("Invoice %s marked as PAID via webhook", invoice.id)

    elif xendit_status == "EXPIRED":
        payment.status = PaymentStatus.EXPIRED

        # Mark invoice as FAILED if payment expired
        invoice = db.query(Invoice).filter(Invoice.id == payment.invoice_id).first()
        if invoice and invoice.status == InvoiceStatus.UNPAID:
            invoice.status = InvoiceStatus.FAILED
            invoice.updated_at = datetime.now(timezone.utc)
            logger.info("Invoice %s marked as FAILED (payment expired)", invoice.id)

    elif xendit_status in ("FAILED", "VOIDED"):
        payment.status = PaymentStatus.FAILED

    db.commit()

    logger.info(
        "Payment %s updated: status=%s, method=%s",
        payment.id,
        payment.status.value,
        payment.payment_method,
    )

    return JSONResponse(status_code=200, content={"message": "Callback processed"})


@router.get(
    "/status/{invoice_id}",
    response_model=WebResponse[PaymentRead],
    summary="Get latest payment status for an invoice",
)
def get_payment_status(
    invoice_id: str,
    db: Session = Depends(get_db),
):
    """
    Public endpoint — returns the latest payment for a given invoice.
    Used by frontend for polling after Xendit redirect.
    """

    payment = (
        db.query(Payment)
        .filter(Payment.invoice_id == invoice_id)
        .order_by(Payment.created_at.desc())
        .first()
    )

    if not payment:
        raise NotFoundException(f"No payment found for invoice {invoice_id}")

    # Active validation: if payment is still PENDING, let's proactively check Xendit
    # This ensures statuses update even if the webhook failed or is delayed (e.g. testing on localhost)
    if payment.status == PaymentStatus.PENDING and payment.xendit_invoice_id:
        try:
            xendit_data = get_xendit_invoice(payment.xendit_invoice_id)
            xendit_status = xendit_data.get("status", "").upper()
            
            # If status changed on Xendit, we process it like a webhook
            if xendit_status != "PENDING":
                logger.info("Active polling detected status change to %s for Xendit invoice %s", xendit_status, payment.xendit_invoice_id)
                
                payment.payment_method = xendit_data.get("payment_method")
                payment.payment_channel = xendit_data.get("payment_channel")
                
                if xendit_status == "PAID":
                    payment.status = PaymentStatus.PAID
                    paid_at_str = xendit_data.get("paid_at")
                    if paid_at_str:
                        try:
                            payment.paid_at = datetime.fromisoformat(
                                paid_at_str.replace("Z", "+00:00")
                            )
                        except (ValueError, TypeError):
                            payment.paid_at = datetime.now(timezone.utc)
                    else:
                        payment.paid_at = datetime.now(timezone.utc)
            
                    invoice = db.query(Invoice).filter(Invoice.id == payment.invoice_id).first()
                    if invoice and invoice.status != InvoiceStatus.PAID:
                        invoice.status = InvoiceStatus.PAID
                        invoice.paid_at = payment.paid_at
                        invoice.updated_at = datetime.now(timezone.utc)
                        
                elif xendit_status == "EXPIRED":
                    payment.status = PaymentStatus.EXPIRED
                    invoice = db.query(Invoice).filter(Invoice.id == payment.invoice_id).first()
                    if invoice and invoice.status == InvoiceStatus.UNPAID:
                        invoice.status = InvoiceStatus.FAILED
                        invoice.updated_at = datetime.now(timezone.utc)
                        
                elif xendit_status in ("FAILED", "VOIDED"):
                    payment.status = PaymentStatus.FAILED
                
                db.commit()
                db.refresh(payment)
        except Exception as e:
            logger.error("Error actively checking Xendit status: %s", str(e))

    return WebResponse(
        status="success",
        data=PaymentRead.model_validate(payment),
    )
