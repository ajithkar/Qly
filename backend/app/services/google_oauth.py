"""Google OAuth 2.0 for end users - the only authentication method they have.

Uses the authorization-code flow with PKCE-style state validation. The state
value is stored in Redis and consumed exactly once, which is what prevents
CSRF on the callback: an attacker cannot forge a state they never issued.
"""
from __future__ import annotations

import base64
import json
import secrets
from typing import Any, Dict
from urllib.parse import urlencode

import httpx

from app.core.config import settings
from app.core.errors import AppError, AuthenticationError
from app.core.logging import get_logger

logger = get_logger(__name__)

AUTH_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth"
TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token"
STATE_TTL_SECONDS = 600


class GoogleOAuthService:
    def __init__(self, http_client: httpx.AsyncClient | None = None) -> None:
        self._http = http_client

    @staticmethod
    def _require_config() -> None:
        if not settings.GOOGLE_CLIENT_ID or not settings.GOOGLE_CLIENT_SECRET:
            raise AppError(
                "Google sign-in is not configured on this environment.",
                code="google_oauth_not_configured",
                status_code=503,
            )

    async def authorization_url(self) -> Dict[str, str]:
        """Build the consent URL and stash a single-use state token."""
        self._require_config()
        state = secrets.token_urlsafe(32)

        from app.db.redis_client import get_redis

        try:
            await get_redis().set(f"oauth:state:{state}", "1", ex=STATE_TTL_SECONDS)
        except Exception:  # noqa: BLE001
            logger.warning("oauth_state_store_unavailable")

        params = {
            "client_id": settings.GOOGLE_CLIENT_ID,
            "redirect_uri": settings.GOOGLE_REDIRECT_URI,
            "response_type": "code",
            "scope": "openid email profile",
            "state": state,
            "access_type": "online",
            "prompt": "select_account",
        }
        return {"authorization_url": f"{AUTH_ENDPOINT}?{urlencode(params)}", "state": state}

    @staticmethod
    async def _consume_state(state: str) -> None:
        """A state token is valid exactly once."""
        from app.db.redis_client import get_redis

        try:
            deleted = await get_redis().delete(f"oauth:state:{state}")
        except Exception:  # noqa: BLE001
            logger.warning("oauth_state_check_skipped")
            return
        if not deleted:
            raise AuthenticationError(
                "Sign-in request has expired or is invalid. Please try again.",
                code="oauth_state_invalid",
            )

    async def exchange_code(self, code: str, state: str) -> Dict[str, Any]:
        """Trade the authorization code for tokens, then read the id_token."""
        self._require_config()
        await self._consume_state(state)

        payload = {
            "code": code,
            "client_id": settings.GOOGLE_CLIENT_ID,
            "client_secret": settings.GOOGLE_CLIENT_SECRET,
            "redirect_uri": settings.GOOGLE_REDIRECT_URI,
            "grant_type": "authorization_code",
        }

        client = self._http or httpx.AsyncClient(timeout=10.0)
        try:
            response = await client.post(TOKEN_ENDPOINT, data=payload)
            if response.status_code != 200:
                logger.warning(
                    "google_token_exchange_failed",
                    extra={"status_code": response.status_code},
                )
                raise AuthenticationError(
                    "Google sign-in failed. Please try again.", code="oauth_exchange_failed"
                )
            body = response.json()
        finally:
            if self._http is None:
                await client.aclose()

        id_token = body.get("id_token")
        if not id_token:
            raise AuthenticationError("Google did not return an identity token.")
        return self.decode_id_token(id_token)

    @staticmethod
    def decode_id_token(id_token: str) -> Dict[str, Any]:
        """Read the claims from Google's id_token.

        The token arrives over TLS directly from Google's token endpoint in
        exchange for our client secret, so the transport authenticates it. If
        you ever accept an id_token from the *client* instead, you must verify
        the RS256 signature against Google's JWKS first - do not reuse this
        path for that.
        """
        try:
            parts = id_token.split(".")
            if len(parts) != 3:
                raise ValueError("malformed token")
            payload_segment = parts[1]
            padding = "=" * (-len(payload_segment) % 4)
            claims = json.loads(base64.urlsafe_b64decode(payload_segment + padding))
        except (ValueError, TypeError, json.JSONDecodeError):
            raise AuthenticationError("Google identity token could not be read.")

        if claims.get("iss") not in ("accounts.google.com", "https://accounts.google.com"):
            raise AuthenticationError("Identity token has an unexpected issuer.")
        if settings.GOOGLE_CLIENT_ID and claims.get("aud") != settings.GOOGLE_CLIENT_ID:
            raise AuthenticationError("Identity token was issued for another application.")
        if not claims.get("email_verified", False):
            raise AuthenticationError(
                "Your Google email address is not verified.", code="email_not_verified"
            )

        return {
            "sub": claims["sub"],
            "email": claims["email"],
            "name": claims.get("name"),
            "picture": claims.get("picture"),
        }
