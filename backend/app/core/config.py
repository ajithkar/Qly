"""Application configuration, loaded from environment variables.

Never hardcode secrets. All values below can be overridden via a .env file
(see .env.example) or real environment variables in staging/production.
"""
from __future__ import annotations

from functools import lru_cache
from typing import List

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env", env_file_encoding="utf-8", extra="ignore"
    )

    # --- Application ---
    APP_NAME: str = "Qly API"
    APP_VERSION: str = "1.0.0"
    ENVIRONMENT: str = "development"  # development | staging | production
    DEBUG: bool = False
    API_V1_PREFIX: str = "/api/v1"

    # --- Datastores ---
    MONGODB_URI: str = "mongodb://localhost:27017"
    MONGODB_DB_NAME: str = "qly"
    REDIS_URL: str = "redis://localhost:6379/0"

    # --- Security / JWT ---
    JWT_SECRET_KEY: str = "change-me-in-production"
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 15
    REFRESH_TOKEN_EXPIRE_DAYS: int = 30
    PASSWORD_MIN_LENGTH: int = 10

    # Brute-force protection
    LOGIN_MAX_ATTEMPTS: int = 5
    LOGIN_LOCKOUT_SECONDS: int = 900

    # --- Rate limiting ---
    RATE_LIMIT_ENABLED: bool = True
    RATE_LIMIT_DEFAULT_PER_MINUTE: int = 120
    RATE_LIMIT_AUTH_PER_MINUTE: int = 10

    # --- CORS ---
    CORS_ORIGINS: List[str] = Field(
        default_factory=lambda: ["http://localhost:5173", "http://localhost:3000"]
    )

    # --- Google OAuth (end users) ---
    GOOGLE_CLIENT_ID: str = ""
    GOOGLE_CLIENT_SECRET: str = ""
    # Must be a frontend route, not a backend one: Google redirects the
    # browser here with a GET, and the SPA then POSTs the code to
    # /auth/google/callback. Pointing this at the API directly 405s.
    GOOGLE_REDIRECT_URI: str = "http://localhost:5173/auth/google/callback"

    # --- Queue engine ---
    ETA_ROLLING_WINDOW: int = 20  # completions used for rolling avg service time
    ETA_MIN_SAMPLES: int = 3  # below this, fall back to service duration

    @field_validator("CORS_ORIGINS", mode="before")
    @classmethod
    def _split_origins(cls, v):
        if isinstance(v, str):
            return [o.strip() for o in v.split(",") if o.strip()]
        return v

    @property
    def is_production(self) -> bool:
        return self.ENVIRONMENT.lower() == "production"


@lru_cache
def get_settings() -> Settings:
    """Cached settings accessor so the env is parsed exactly once."""
    settings = Settings()
    if settings.is_production and settings.JWT_SECRET_KEY == "change-me-in-production":
        raise RuntimeError("JWT_SECRET_KEY must be set in production.")
    return settings


settings = get_settings()
