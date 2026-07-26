"""Aggregate all v1 routers."""
from fastapi import APIRouter

from app.api.v1.routes import (
    admin,
    appointments,
    auth,
    billing,
    catalog,
    health,
    public,
    queues,
    users,
)

api_router = APIRouter()
api_router.include_router(health.router)
api_router.include_router(auth.router)
api_router.include_router(users.router)
api_router.include_router(catalog.router)
api_router.include_router(queues.router)
api_router.include_router(appointments.router)
api_router.include_router(billing.router)
api_router.include_router(admin.router)
api_router.include_router(public.router)
