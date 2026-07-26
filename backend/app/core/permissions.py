"""RBAC: permissions are (module, action) pairs; roles are permission sets.

A permission string is "module:action", e.g. "queues:update".
Guards are enforced on the API via dependencies (see app/api/deps.py) and
mirrored in the UI by returning the resolved permission set from /auth/me.
"""
from __future__ import annotations

from enum import Enum
from typing import Dict, List, Set


class Action(str, Enum):
    VIEW = "view"
    CREATE = "create"
    UPDATE = "update"
    DELETE = "delete"
    EXPORT = "export"
    APPROVE = "approve"


class VendorModule(str, Enum):
    DASHBOARD = "dashboard"
    APPOINTMENTS = "appointments"
    PROVIDERS = "providers"
    SERVICES = "services"
    QUEUES = "queues"
    REPORTS = "reports"
    CUSTOMERS = "customers"
    BILLING = "billing"
    SETTINGS = "settings"
    STAFF = "staff"
    NOTIFICATIONS = "notifications"
    BRANCHES = "branches"


class AdminModule(str, Enum):
    DASHBOARD = "admin_dashboard"
    VENDORS = "admin_vendors"
    PLANS = "admin_plans"
    PAYMENTS = "admin_payments"
    USERS = "admin_users"
    CMS = "admin_cms"
    SUPPORT = "admin_support"
    NOTIFICATIONS = "admin_notifications"
    SETTINGS = "admin_settings"
    AUDIT = "admin_audit"


def perm(module: str, action: Action) -> str:
    return f"{module}:{action.value}"


def all_actions(module: str) -> Set[str]:
    return {perm(module, a) for a in Action}


def _vendor_full() -> Set[str]:
    result: Set[str] = set()
    for m in VendorModule:
        result |= all_actions(m.value)
    return result


def _admin_full() -> Set[str]:
    result: Set[str] = set()
    for m in AdminModule:
        result |= all_actions(m.value)
    return result


# --- Vendor-side role presets -------------------------------------------------
VENDOR_ROLE_PERMISSIONS: Dict[str, Set[str]] = {
    "owner": _vendor_full(),
    "manager": (
        _vendor_full()
        - all_actions(VendorModule.BILLING.value)
        - {perm(VendorModule.STAFF.value, Action.DELETE)}
        - {perm(VendorModule.SETTINGS.value, Action.DELETE)}
    ),
    "receptionist": {
        perm(VendorModule.DASHBOARD.value, Action.VIEW),
        perm(VendorModule.APPOINTMENTS.value, Action.VIEW),
        perm(VendorModule.APPOINTMENTS.value, Action.CREATE),
        perm(VendorModule.APPOINTMENTS.value, Action.UPDATE),
        perm(VendorModule.QUEUES.value, Action.VIEW),
        perm(VendorModule.QUEUES.value, Action.CREATE),
        perm(VendorModule.QUEUES.value, Action.UPDATE),
        perm(VendorModule.CUSTOMERS.value, Action.VIEW),
        perm(VendorModule.CUSTOMERS.value, Action.CREATE),
        perm(VendorModule.PROVIDERS.value, Action.VIEW),
        perm(VendorModule.SERVICES.value, Action.VIEW),
        perm(VendorModule.NOTIFICATIONS.value, Action.VIEW),
    },
    "provider": {
        perm(VendorModule.DASHBOARD.value, Action.VIEW),
        perm(VendorModule.APPOINTMENTS.value, Action.VIEW),
        perm(VendorModule.APPOINTMENTS.value, Action.UPDATE),
        perm(VendorModule.QUEUES.value, Action.VIEW),
        perm(VendorModule.QUEUES.value, Action.UPDATE),
        perm(VendorModule.CUSTOMERS.value, Action.VIEW),
        perm(VendorModule.NOTIFICATIONS.value, Action.VIEW),
    },
    "assistant": {
        perm(VendorModule.DASHBOARD.value, Action.VIEW),
        perm(VendorModule.QUEUES.value, Action.VIEW),
        perm(VendorModule.QUEUES.value, Action.UPDATE),
        perm(VendorModule.APPOINTMENTS.value, Action.VIEW),
        perm(VendorModule.NOTIFICATIONS.value, Action.VIEW),
    },
}

# --- Platform-side role presets ----------------------------------------------
ADMIN_ROLE_PERMISSIONS: Dict[str, Set[str]] = {
    "super_admin": _admin_full(),
    "admin": _admin_full() - all_actions(AdminModule.SETTINGS.value),
    "finance": (
        all_actions(AdminModule.PAYMENTS.value)
        | all_actions(AdminModule.PLANS.value)
        | {perm(AdminModule.DASHBOARD.value, Action.VIEW)}
        | {perm(AdminModule.VENDORS.value, Action.VIEW)}
    ),
    "customer_support": (
        all_actions(AdminModule.SUPPORT.value)
        | {perm(AdminModule.DASHBOARD.value, Action.VIEW)}
        | {perm(AdminModule.VENDORS.value, Action.VIEW)}
        | {perm(AdminModule.USERS.value, Action.VIEW)}
        | {perm(AdminModule.USERS.value, Action.UPDATE)}
    ),
    "technical_support": (
        all_actions(AdminModule.SUPPORT.value)
        | {perm(AdminModule.AUDIT.value, Action.VIEW)}
        | {perm(AdminModule.DASHBOARD.value, Action.VIEW)}
        | {perm(AdminModule.VENDORS.value, Action.VIEW)}
    ),
    "sales": {
        perm(AdminModule.DASHBOARD.value, Action.VIEW),
        perm(AdminModule.VENDORS.value, Action.VIEW),
        perm(AdminModule.PLANS.value, Action.VIEW),
    },
    "marketing": (
        all_actions(AdminModule.CMS.value)
        | {perm(AdminModule.DASHBOARD.value, Action.VIEW)}
        | {perm(AdminModule.NOTIFICATIONS.value, Action.VIEW)}
        | {perm(AdminModule.NOTIFICATIONS.value, Action.CREATE)}
    ),
}


def resolve_permissions(
    principal_type: str, role: str, custom: List[str] | None = None
) -> Set[str]:
    """Resolve the effective permission set for a principal.

    `custom` (per-staff overrides stored on the staff document) is additive to
    the role preset; an empty custom list means "use the role preset as-is".
    """
    if principal_type == "admin":
        base = set(ADMIN_ROLE_PERMISSIONS.get(role, set()))
    elif principal_type == "staff":
        base = set(VENDOR_ROLE_PERMISSIONS.get(role, set()))
    else:
        base = set()
    if custom:
        base |= set(custom)
    return base
