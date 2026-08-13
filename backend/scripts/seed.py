"""Seed baseline data: subscription plans and a platform Super Admin.

Run once after first boot:
    python -m scripts.seed
Idempotent - safe to re-run.
"""
from __future__ import annotations

import asyncio
import os
import secrets

from email_validator import EmailNotValidError, validate_email

from app.core.security import hash_password, utcnow
from app.db.indexes import ensure_indexes
from app.db.mongo import close_mongo_connection, connect_to_mongo, get_database

PLANS = [
    {
        # Code stays "free" so existing tenants/subscriptions referencing it
        # are unaffected - only the name and framing change to a trial.
        "code": "free",
        "name": "1-Month Trial",
        "monthly_price": 0,
        "yearly_price": 0,
        "max_branches": 1,
        "max_providers": 2,
        "max_staff": 2,
        "max_services": 3,
        "monthly_tokens": 200,
        "storage_mb": 100,
        "reports_access": False,
        "export_access": False,
        "api_access": False,
        "feature_flags": [],
        # A vendor may activate this plan once, without payment. See
        # StripeService._activate_trial / TRIAL_PERIOD_DAYS.
        "is_trial": True,
    },
    {
        "code": "starter",
        "name": "Starter",
        "monthly_price": 8700,
        "yearly_price": 87000,
        "max_branches": 2,
        "max_providers": 10,
        "max_staff": 10,
        "max_services": 20,
        "monthly_tokens": 5000,
        "storage_mb": 2000,
        "reports_access": True,
        "export_access": True,
        "api_access": False,
        "feature_flags": ["priority_queue"],
    },
    {
        "code": "business",
        "name": "Business",
        "monthly_price": 29700,
        "yearly_price": 297000,
        "max_branches": 10,
        "max_providers": 50,
        "max_staff": 50,
        "max_services": 100,
        "monthly_tokens": 50000,
        "storage_mb": 20000,
        "reports_access": True,
        "export_access": True,
        "api_access": True,
        "feature_flags": ["priority_queue", "emergency_queue", "api_keys"],
    },
    {
        "code": "enterprise",
        "name": "Enterprise",
        "monthly_price": 89700,
        "yearly_price": 897000,
        # None means unlimited - see PlanService.enforce_limit.
        "max_branches": None,
        "max_providers": None,
        "max_staff": None,
        "max_services": None,
        "monthly_tokens": None,
        "storage_mb": 100000,
        "reports_access": True,
        "export_access": True,
        "api_access": True,
        "feature_flags": ["priority_queue", "emergency_queue", "api_keys", "sso"],
    },
]

CATEGORIES = [
    "Hospitals", "Clinics", "Salons", "Banks", "Government Offices",
    "Laboratories", "Repair Centers", "Educational Institutions",
]


async def seed() -> None:
    await connect_to_mongo()
    await ensure_indexes()
    db = get_database()

    for order, plan in enumerate(PLANS):
        await db["plans"].update_one(
            {"code": plan["code"]},
            {
                "$set": {**plan, "archived": False, "sort_order": order, "updated_at": utcnow()},
                "$setOnInsert": {"created_at": utcnow(), "is_deleted": False},
            },
            upsert=True,
        )
    print(f"Seeded {len(PLANS)} plans.")

    for order, name in enumerate(CATEGORIES):
        await db["industry_categories"].update_one(
            {"name": name},
            {
                "$set": {"active": True, "sort_order": order},
                "$setOnInsert": {"created_at": utcnow(), "is_deleted": False},
            },
            upsert=True,
        )
    print(f"Seeded {len(CATEGORIES)} industry categories.")

    # Reserved TLDs (.local, .test, .invalid) are rejected by EmailStr, which
    # every login request uses. Seeding such an address creates an admin who
    # can never sign in, so validate it here rather than discover it at login.
    admin_email = os.getenv("SEED_ADMIN_EMAIL", "admin@qly.example.com").lower()
    try:
        validate_email(admin_email, check_deliverability=False)
    except EmailNotValidError as exc:
        raise SystemExit(
            f"SEED_ADMIN_EMAIL '{admin_email}' is not a usable address: {exc}\n"
            "Reserved domains such as .local and .test will be rejected at login."
        )
    existing = await db["admins"].find_one({"email": admin_email})
    if existing:
        print(f"Super Admin already exists: {admin_email}")
    else:
        password = os.getenv("SEED_ADMIN_PASSWORD") or secrets.token_urlsafe(12) + "A1"
        await db["admins"].insert_one(
            {
                "email": admin_email,
                "name": "Super Admin",
                "role": "super_admin",
                "password_hash": hash_password(password),
                "status": "active",
                "totp_enabled": False,
                "created_at": utcnow(),
                "updated_at": utcnow(),
                "is_deleted": False,
            }
        )
        print("\n" + "=" * 58)
        print("  Super Admin created")
        print(f"  Email:    {admin_email}")
        print(f"  Password: {password}")
        print("  Change this password immediately after first sign-in.")
        print("=" * 58 + "\n")

    if os.getenv("SEED_DEMO", "").lower() in ("1", "true", "yes"):
        await seed_demo(db)

    await close_mongo_connection()


async def seed_demo(db) -> None:
    """A working vendor you can sign into immediately.

    Without this, a fresh stack boots with no verified account, and the first
    thing anyone sees is a login form they cannot get past. Idempotent.
    """
    email = "owner@demo-clinic.com"
    password = "DemoPassw0rd"

    if await db["staff"].find_one({"email": email}):
        print(f"Demo vendor already present: {email}")
        return

    tenant = await db["tenants"].insert_one(
        {
            "company_name": "Demo Clinic",
            "slug": "demo-clinic",
            "owner_email": email,
            "owner_name": "Demo Owner",
            "business_type": "Clinics",
            "timezone": "UTC",
            "currency": "LKR",
            "language": "en",
            "status": "active",
            "plan_code": "business",
            "created_at": utcnow(),
            "updated_at": utcnow(),
            "is_deleted": False,
        }
    )
    tenant_id = str(tenant.inserted_id)

    await db["staff"].insert_one(
        {
            "tenant_id": tenant_id,
            "email": email,
            "name": "Demo Owner",
            "password_hash": hash_password(password),
            "role": "owner",
            "branch_id": None,
            "custom_permissions": [],
            "status": "active",
            "email_verified": True,
            "created_at": utcnow(),
            "updated_at": utcnow(),
            "is_deleted": False,
        }
    )

    audit = {"created_at": utcnow(), "updated_at": utcnow(), "is_deleted": False}

    branch = await db["branches"].insert_one(
        {"tenant_id": tenant_id, "name": "Main Branch", "timezone": "UTC",
         "holidays": [], "working_hours": [], **audit}
    )
    branch_id = str(branch.inserted_id)

    service = await db["services"].insert_one(
        {"tenant_id": tenant_id, "branch_id": branch_id,
         "name": "General Consultation", "description": "Walk-in or booked.",
         "duration_minutes": 10, "buffer_minutes": 0, "price": 0.0,
         "payment_mode": "pay_at_venue", "queue_capacity": 50,
         "provider_ids": [], "cancellation_window_minutes": 60,
         "no_show_after_minutes": 10, "token_prefix": "A",
         "daily_token_reset": True, **audit}
    )
    service_id = str(service.inserted_id)

    provider = await db["providers"].insert_one(
        {"tenant_id": tenant_id, "branch_id": branch_id, "name": "Alex Fry",
         "title": "Dr.", "specialty": "General practice", "experience_years": 8,
         "consultation_fee": 0.0, "status": "active", "leaves": [],
         "working_hours": [
             {"weekday": day, "opens_at": "09:00:00",
              "closes_at": "17:00:00", "is_closed": False}
             for day in range(7)
         ], **audit}
    )
    provider_id = str(provider.inserted_id)

    from app.services.queue_service import business_day_for

    today = business_day_for("UTC")
    queue = await db["queues"].insert_one(
        {"tenant_id": tenant_id, "branch_id": branch_id, "service_id": service_id,
         "provider_id": provider_id, "name": "Walk-ins", "status": "open",
         "business_day": today, "max_tokens": 50, **audit}
    )
    queue_id = str(queue.inserted_id)

    # A few people already waiting, so the console has something to call.
    await db["queue_counters"].insert_one(
        {"tenant_id": tenant_id, "branch_id": branch_id, "service_id": service_id,
         "business_day": today, "sequence": 3, "created_at": utcnow()}
    )
    for index, name in enumerate(["Ada Lovelace", "Grace Hopper", "Alan Turing"], start=1):
        await db["queue_tokens"].insert_one(
            {"tenant_id": tenant_id, "queue_id": queue_id, "branch_id": branch_id,
             "service_id": service_id, "provider_id": provider_id,
             "business_day": today, "token_number": f"A{index:03d}",
             "sequence": index, "status": "waiting", "priority": "normal",
             "priority_rank": 2, "user_id": None, "appointment_id": None,
             "customer_name": name, "customer_phone": None,
             "called_at": None, "served_at": None, "completed_at": None,
             "recall_count": 0, **audit}
        )

    print("\n" + "=" * 58)
    print("  Demo vendor ready")
    print(f"  Sign in at /login with:")
    print(f"    Email:    {email}")
    print(f"    Password: {password}")
    print("  Three people are already waiting in the Walk-ins queue.")
    print("=" * 58 + "\n")


if __name__ == "__main__":
    asyncio.run(seed())
