"""Plan-limit enforcement - without this, plan tiers are cosmetic."""
import pytest

from app.core.errors import PlanLimitReached
from app.repositories.catalog import BranchRepository
from app.services.plan_service import PlanService


@pytest.fixture
async def limited_tenant(db, tenant_id):
    await db["plans"].insert_one(
        {
            "code": "starter",
            "name": "Starter",
            "monthly_price": 29,
            "max_branches": 2,
            "max_services": None,  # unlimited
            "archived": False,
            "is_deleted": False,
        }
    )
    await db["tenants"].insert_one(
        {
            "_id": __import__("bson").ObjectId(tenant_id),
            "company_name": "Limited Org",
            "slug": "limited",
            "owner_email": "a@b.local",
            "plan_code": "starter",
            "status": "active",
            "is_deleted": False,
        }
    )
    return tenant_id


async def test_limit_allows_up_to_the_cap(db, tenant_id, limited_tenant):
    service = PlanService(db)
    repo = BranchRepository(db)

    await service.enforce_limit(tenant_id, "max_branches", "branches")
    await repo.create({"name": "One", "timezone": "UTC"}, tenant_id, "actor")

    await service.enforce_limit(tenant_id, "max_branches", "branches")
    await repo.create({"name": "Two", "timezone": "UTC"}, tenant_id, "actor")


async def test_limit_blocks_beyond_the_cap(db, tenant_id, limited_tenant):
    service = PlanService(db)
    repo = BranchRepository(db)
    await repo.create({"name": "One", "timezone": "UTC"}, tenant_id, "actor")
    await repo.create({"name": "Two", "timezone": "UTC"}, tenant_id, "actor")

    with pytest.raises(PlanLimitReached) as exc:
        await service.enforce_limit(tenant_id, "max_branches", "branches")
    assert exc.value.status_code == 402


async def test_none_limit_means_unlimited(db, tenant_id, limited_tenant):
    service = PlanService(db)
    from app.repositories.catalog import ServiceRepository

    repo = ServiceRepository(db)
    for i in range(25):
        await repo.create(
            {"name": f"Service {i}", "branch_id": "b1", "duration_minutes": 10},
            tenant_id,
            "actor",
        )
    # max_services is None, so this must not raise.
    await service.enforce_limit(tenant_id, "max_services", "services")


async def test_soft_deleted_records_do_not_count_toward_limit(db, tenant_id, limited_tenant):
    service = PlanService(db)
    repo = BranchRepository(db)
    one = await repo.create({"name": "One", "timezone": "UTC"}, tenant_id, "actor")
    await repo.create({"name": "Two", "timezone": "UTC"}, tenant_id, "actor")

    await repo.soft_delete_by_id(one["id"], tenant_id, "actor")
    # Freed a slot, so this should now succeed.
    await service.enforce_limit(tenant_id, "max_branches", "branches")


# ------------------------------------------------------------------- trials
async def test_expired_trial_blocks_new_resources_even_under_the_cap(db, tenant_id, limited_tenant):
    """A trial that has run out must block growth even though the plan's own
    numeric cap has plenty of headroom left."""
    from datetime import timedelta

    from app.core.security import utcnow

    await db["subscriptions"].insert_one(
        {
            "tenant_id": tenant_id,
            "plan_code": "starter",
            "stripe_status": "trialing",
            "trial_ends_at": utcnow() - timedelta(days=1),
        }
    )
    service = PlanService(db)
    with pytest.raises(PlanLimitReached) as exc:
        await service.enforce_limit(tenant_id, "max_branches", "branches")
    assert exc.value.details[0]["reason"] == "trial_expired"


async def test_active_trial_still_enforces_the_plan_cap(db, tenant_id, limited_tenant):
    """An unexpired trial is not a free pass - it's just a subscription state,
    so the plan's own limits still apply underneath it."""
    from datetime import timedelta

    from app.core.security import utcnow
    from app.repositories.catalog import BranchRepository

    await db["subscriptions"].insert_one(
        {
            "tenant_id": tenant_id,
            "plan_code": "starter",
            "stripe_status": "trialing",
            "trial_ends_at": utcnow() + timedelta(days=15),
        }
    )
    service = PlanService(db)
    repo = BranchRepository(db)
    await repo.create({"name": "One", "timezone": "UTC"}, tenant_id, "actor")
    await repo.create({"name": "Two", "timezone": "UTC"}, tenant_id, "actor")

    with pytest.raises(PlanLimitReached) as exc:
        await service.enforce_limit(tenant_id, "max_branches", "branches")
    assert exc.value.details[0]["resource"] == "branches"
