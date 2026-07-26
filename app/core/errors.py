"""Application error types and the standard error envelope.

Every error leaving the API has the shape:
    {"error": {"code": "SNAKE_CASE_CODE", "message": "...", "details": [...]}}
Stack traces and internal identifiers are never exposed to clients.
"""
from __future__ import annotations

from typing import Any, List, Optional

from fastapi import FastAPI, Request, status
from fastapi.encoders import jsonable_encoder
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.core.logging import get_logger

logger = get_logger(__name__)


class AppError(Exception):
    """Base class for all domain errors."""

    status_code: int = status.HTTP_400_BAD_REQUEST
    code: str = "bad_request"
    message: str = "Request could not be processed."

    def __init__(
        self,
        message: Optional[str] = None,
        *,
        code: Optional[str] = None,
        details: Optional[List[Any]] = None,
        status_code: Optional[int] = None,
    ) -> None:
        self.message = message or self.message
        self.code = code or self.code
        self.details = details or []
        if status_code is not None:
            self.status_code = status_code
        super().__init__(self.message)

    def to_response(self) -> JSONResponse:
        return JSONResponse(
            status_code=self.status_code,
            content={
                "error": {
                    "code": self.code,
                    "message": self.message,
                    "details": jsonable_encoder(self.details),
                }
            },
        )


class ValidationError(AppError):
    status_code = status.HTTP_422_UNPROCESSABLE_ENTITY
    code = "validation_error"
    message = "The submitted data is invalid."


class AuthenticationError(AppError):
    status_code = status.HTTP_401_UNAUTHORIZED
    code = "authentication_failed"
    message = "Authentication is required or credentials are invalid."


class PermissionDenied(AppError):
    status_code = status.HTTP_403_FORBIDDEN
    code = "permission_denied"
    message = "You do not have permission to perform this action."


class NotFound(AppError):
    status_code = status.HTTP_404_NOT_FOUND
    code = "not_found"
    message = "The requested resource was not found."


class Conflict(AppError):
    status_code = status.HTTP_409_CONFLICT
    code = "conflict"
    message = "The request conflicts with the current state of the resource."


class SlotTaken(Conflict):
    code = "slot_taken"
    message = "That appointment slot has just been booked."


class InvalidTransition(Conflict):
    code = "invalid_transition"
    message = "That state transition is not allowed from the current state."


class PlanLimitReached(AppError):
    status_code = status.HTTP_402_PAYMENT_REQUIRED
    code = "plan_limit_reached"
    message = "Your current plan limit has been reached. Upgrade to continue."


class RateLimited(AppError):
    status_code = status.HTTP_429_TOO_MANY_REQUESTS
    code = "rate_limited"
    message = "Too many requests. Please slow down and try again shortly."


def register_exception_handlers(app: FastAPI) -> None:
    """Attach handlers so every error uses the standard envelope."""

    @app.exception_handler(AppError)
    async def _app_error(_: Request, exc: AppError) -> JSONResponse:
        return exc.to_response()

    @app.exception_handler(RequestValidationError)
    async def _validation(_: Request, exc: RequestValidationError) -> JSONResponse:
        details = [
            {
                "field": ".".join(str(p) for p in err.get("loc", []) if p != "body"),
                "message": err.get("msg", ""),
            }
            for err in exc.errors()
        ]
        return ValidationError(details=details).to_response()

    @app.exception_handler(StarletteHTTPException)
    async def _http(_: Request, exc: StarletteHTTPException) -> JSONResponse:
        code_map = {401: "authentication_failed", 403: "permission_denied", 404: "not_found"}
        return JSONResponse(
            status_code=exc.status_code,
            content={
                "error": {
                    "code": code_map.get(exc.status_code, "http_error"),
                    "message": str(exc.detail),
                    "details": [],
                }
            },
        )

    @app.exception_handler(Exception)
    async def _unhandled(request: Request, exc: Exception) -> JSONResponse:
        # Log the real error server-side; return a generic message to the client.
        logger.exception(
            "unhandled_exception",
            extra={"path": request.url.path, "method": request.method},
        )
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content={
                "error": {
                    "code": "internal_error",
                    "message": "An unexpected error occurred.",
                    "details": [],
                }
            },
        )
