"""SMTP email delivery - the only place that talks to a mail server.

`smtplib` is synchronous; the send is dispatched via `asyncio.to_thread` so it
never blocks the event loop. If SMTP isn't configured, sends are logged and
skipped rather than raising - callers (e.g. the Stripe webhook handler) must
keep working even when email delivery isn't set up yet.
"""
from __future__ import annotations

import asyncio
import smtplib
from email.mime.text import MIMEText

from app.core.config import settings
from app.core.logging import get_logger

logger = get_logger(__name__)


def _send_sync(to_email: str, subject: str, body: str) -> None:
    message = MIMEText(body)
    message["Subject"] = subject
    message["From"] = f"{settings.SMTP_FROM_NAME} <{settings.SMTP_FROM_EMAIL}>"
    message["To"] = to_email

    with smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT, timeout=15) as server:
        server.starttls()
        server.login(settings.SMTP_USERNAME, settings.SMTP_PASSWORD)
        server.sendmail(settings.SMTP_FROM_EMAIL, [to_email], message.as_string())


async def send_email(to_email: str, subject: str, body: str) -> bool:
    if not settings.SMTP_HOST or not settings.SMTP_USERNAME:
        logger.info("smtp_not_configured_skipped_send", extra={"to": to_email, "subject": subject})
        return False
    try:
        await asyncio.to_thread(_send_sync, to_email, subject, body)
        logger.info("email_sent", extra={"to": to_email, "subject": subject})
        return True
    except Exception:  # noqa: BLE001 - a failed email must never break activation
        logger.exception("email_send_failed", extra={"to": to_email, "subject": subject})
        return False
