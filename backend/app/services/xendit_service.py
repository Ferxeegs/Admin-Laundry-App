"""
Xendit Payment Gateway service.
Handles communication with Xendit Invoice API v2 using httpx.
No SDK dependency — direct HTTP calls for maximum control.
"""

from __future__ import annotations

import base64
import json
import logging
from datetime import datetime, timezone
from typing import Optional

import httpx

from app.core.config import settings

logger = logging.getLogger(__name__)

XENDIT_API_BASE = "https://api.xendit.co"


def _get_auth_headers() -> dict[str, str]:
    """Build Basic Auth headers for Xendit API."""
    secret_key = settings.XENDIT_SECRET_KEY
    auth_string = f"{secret_key}:"
    encoded = base64.b64encode(auth_string.encode("utf-8")).decode("utf-8")
    return {
        "Authorization": f"Basic {encoded}",
        "Content-Type": "application/json",
    }


def create_xendit_invoice(
    external_id: str,
    amount: float,
    description: str,
    customer_name: str,
    invoice_number: str,
    success_redirect_url: str,
    failure_redirect_url: str,
    invoice_duration: int = 86400,  # 24 hours default
    customer_email: Optional[str] = None,
) -> dict:
    """
    Create an invoice on Xendit using Invoice API v2.

    Args:
        external_id: Unique ID for this payment attempt
        amount: Payment amount in IDR
        description: Payment description
        customer_name: Customer/student name
        invoice_number: Internal invoice number
        success_redirect_url: Redirect after successful payment
        failure_redirect_url: Redirect after failed/cancelled payment
        invoice_duration: Invoice validity in seconds (default: 24h)
        customer_email: Optional customer email

    Returns:
        dict: Xendit response including 'id' and 'invoice_url'

    Raises:
        httpx.HTTPStatusError: If Xendit returns an error
        Exception: For network or other errors
    """
    payload = {
        "external_id": external_id,
        "amount": int(amount),  # Xendit expects integer for IDR
        "description": description,
        "invoice_duration": invoice_duration,
        "currency": "IDR",
        "success_redirect_url": success_redirect_url,
        "failure_redirect_url": failure_redirect_url,
        "customer": {
            "given_names": customer_name,
        },
        "items": [
            {
                "name": f"Tagihan Laundry {invoice_number}",
                "quantity": 1,
                "price": int(amount),
            }
        ],
    }

    if customer_email:
        payload["payer_email"] = customer_email
        payload["customer"]["email"] = customer_email

    headers = _get_auth_headers()

    logger.info(
        "Creating Xendit invoice: external_id=%s, amount=%s",
        external_id,
        amount,
    )

    with httpx.Client(timeout=30.0) as client:
        response = client.post(
            f"{XENDIT_API_BASE}/v2/invoices",
            json=payload,
            headers=headers,
        )
        response.raise_for_status()

    result = response.json()
    logger.info(
        "Xendit invoice created: xendit_id=%s, url=%s",
        result.get("id"),
        result.get("invoice_url"),
    )
    return result


def verify_webhook_token(callback_token: str) -> bool:
    """
    Verify the x-callback-token header from Xendit webhook.

    Args:
        callback_token: Token from the webhook request header

    Returns:
        bool: True if token matches our configured webhook token
    """
    expected = settings.XENDIT_WEBHOOK_TOKEN
    if not expected:
        logger.warning("XENDIT_WEBHOOK_TOKEN not configured, rejecting callback")
        return False

    return callback_token == expected


def get_xendit_invoice(invoice_id: str) -> dict:
    """
    Fetch an invoice directly from Xendit API.
    
    Args:
        invoice_id: The Xendit invoice ID (not our internal invoice ID)
        
    Returns:
        dict: Xendit response containing the invoice details and status
    """
    headers = _get_auth_headers()
    
    with httpx.Client(timeout=15.0) as client:
        response = client.get(
            f"{XENDIT_API_BASE}/v2/invoices/{invoice_id}",
            headers=headers,
        )
        response.raise_for_status()
        
    return response.json()
