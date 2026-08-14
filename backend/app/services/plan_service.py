"""Plan-limit enforcement.

Without this, plan tiers are only cosmetic. Every create path that consumes a
metered resource calls enforce_limit() before writing.
"""
from __future__ import annotations

from typing import Dict

from motor.motor_asyncio import AsyncIOMotorDatabase

from app.core.errors import PlanLimitReached
from app.core.security import ensure_utc, utcnow
from app.repositories.catalog import (
    BranchRepository,
    PlanRepository,
    ProviderRepository,
    ServiceRepository,
    SubscriptionRepository,
)
from app.repositories.identity import StaffRepository, TenantRepository


class PlanService:
    #

    def __init__(self, db: AsyncIOMotorDatabase) -> None:
        self.db = db
        self.plans = PlanRepository(db)
        self.tenants = TenantRepository(db)
        self.subscriptions = SubscriptionRepository(db)

    async def current_plan(self, tenant_id: str) -> Dict:
        subscription = await self.subscriptions.get_for_tenant(tenant_id)
        code = None
        if subscription:
            code = subscription.get("plan_code")
        if not code:
            tenant = await self.tenants.get_by_id(tenant_id)
            code = (tenant or {}).get("plan_code")
        plan = await self.plans.get_by_code(code) if code else None
        return plan or {}

    async def usage(self, tenant_id: str, resource: str) -> int:
        counters = {
            "branches": lambda: BranchRepository(self.db).count(tenant_id),
            "providers": lambda: ProviderRepository(self.db).count(tenant_id),
            "services": lambda: ServiceRepository(self.db).count(tenant_id),
            "staff": lambda: StaffRepository(self.db).count_active(tenant_id),
        }
        counter = counters.get(resource)
        if counter is None:
            return 0
        return await counter()

    async def enforce_limit(self, tenant_id: str, limit_key: str, resource: str) -> None:
        """Raise PlanLimitReached when the tenant is at or above its cap.

        A missing or None limit means unlimited.
        """
        subscription = await self.subscriptions.get_for_tenant(tenant_id)
        if subscription and subscription.get("stripe_status") == "trialing":
            trial_ends_at = subscription.get("trial_ends_at")
            if trial_ends_at and utcnow() >= ensure_utc(trial_ends_at):
                raise PlanLimitReached(
                    "Your free trial has ended. Upgrade to a paid plan to keep adding more.",
                    details=[{"resource": resource, "reason": "trial_expired"}],
                )

        plan = await self.current_plan(tenant_id)
        limit = plan.get(limit_key)
        if limit is None:
            return
        used = await self.usage(tenant_id, resource)
        if used >= int(limit):
            raise PlanLimitReached(
                f"Your plan allows {limit} {resource}. Upgrade to add more.",
                details=[{"resource": resource, "limit": limit, "used": used}],
            )
