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
