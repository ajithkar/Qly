"""Vercel Services entrypoint for the FastAPI backend.

Vercel strips the service's ``/api`` route prefix before forwarding a request,
so the application exposes its normal ``/api/v1`` routes as ``/v1`` inside
this service. Local development continues to use ``app.main:app`` unchanged.
"""
from __future__ import annotations

import os


# These values describe the Vercel runtime itself and must not inherit generic
# host variables such as ``DEBUG=release`` from the build environment.
os.environ["ENVIRONMENT"] = "production"
os.environ["DEBUG"] = "false"
os.environ["API_V1_PREFIX"] = "/v1"
os.environ["WEBSOCKETS_ENABLED"] = "false"

# System URLs contain a hostname without a scheme. Use the stable production
# hostname for links sent in email while still allowing an explicit override.
production_host = os.getenv("VERCEL_PROJECT_PRODUCTION_URL")
if production_host:
    production_url = f"https://{production_host}"
    os.environ.setdefault("FRONTEND_URL", production_url)
    os.environ.setdefault("GOOGLE_REDIRECT_URI", f"{production_url}/auth/google/callback")
    os.environ.setdefault("STRIPE_SUCCESS_URL", f"{production_url}/billing/success")
    os.environ.setdefault("STRIPE_CANCEL_URL", f"{production_url}/billing/cancel")

from app.main import app  # noqa: E402,F401  (environment must be set first)
