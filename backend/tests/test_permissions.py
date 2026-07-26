"""RBAC resolution."""
from app.core.permissions import (
    Action,
    VendorModule,
    perm,
    resolve_permissions,
)


def test_owner_has_billing_but_receptionist_does_not():
    owner = resolve_permissions("staff", "owner")
    receptionist = resolve_permissions("staff", "receptionist")
    billing_view = perm(VendorModule.BILLING.value, Action.VIEW)
    assert billing_view in owner
    assert billing_view not in receptionist


def test_manager_cannot_access_billing():
    manager = resolve_permissions("staff", "manager")
    assert perm(VendorModule.BILLING.value, Action.VIEW) not in manager
    assert perm(VendorModule.APPOINTMENTS.value, Action.UPDATE) in manager


def test_custom_permissions_are_additive():
    extra = perm(VendorModule.REPORTS.value, Action.EXPORT)
    base = resolve_permissions("staff", "receptionist")
    widened = resolve_permissions("staff", "receptionist", [extra])
    assert extra not in base
    assert extra in widened


def test_unknown_role_grants_nothing():
    assert resolve_permissions("staff", "not-a-role") == set()


def test_end_users_have_no_vendor_permissions():
    assert resolve_permissions("user", "") == set()
