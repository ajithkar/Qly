"""Domain enumerations and the queue token state machine."""
from __future__ import annotations

from enum import Enum
from typing import Dict, Set


class PrincipalType(str, Enum):
    USER = "user"        # end user, Google OAuth only
    STAFF = "staff"      # vendor-side principal (owner/manager/receptionist/...)
    ADMIN = "admin"      # platform staff


class TenantStatus(str, Enum):
    PENDING = "pending"
    ACTIVE = "active"
    SUSPENDED = "suspended"
    CANCELLED = "cancelled"


class AccountStatus(str, Enum):
    PENDING = "pending"
    ACTIVE = "active"
    SUSPENDED = "suspended"


class LeadStatus(str, Enum):
    PENDING = "pending"
    VERIFIED = "verified"
    REJECTED = "rejected"


class PaymentMode(str, Enum):
    """Resolved product decision: payment mode is configured per service."""
    PREPAID_ONLINE = "prepaid_online"
    PAY_AT_VENUE = "pay_at_venue"


class QueueStatus(str, Enum):
    DRAFT = "draft"
    OPEN = "open"
    PAUSED = "paused"
    CLOSED = "closed"


class TokenStatus(str, Enum):
    WAITING = "waiting"
    CALLED = "called"
    SERVING = "serving"
    COMPLETED = "completed"
    SKIPPED = "skipped"
    CANCELLED = "cancelled"
    TRANSFERRED = "transferred"
    NO_SHOW = "no_show"


class TokenPriority(str, Enum):
    NORMAL = "normal"
    PRIORITY = "priority"
    EMERGENCY = "emergency"


class AppointmentStatus(str, Enum):
    BOOKED = "booked"
    CONFIRMED = "confirmed"
    CHECKED_IN = "checked_in"      # converted into a live queue token
    COMPLETED = "completed"
    CANCELLED = "cancelled"
    NO_SHOW = "no_show"
    REJECTED = "rejected"


# --- Guarded state machine ---------------------------------------------------
# Every transition is applied as a conditional findOneAndUpdate filtered on the
# current status, so two operators cannot act on the same token.
TOKEN_TRANSITIONS: Dict[TokenStatus, Set[TokenStatus]] = {
    TokenStatus.WAITING: {
        TokenStatus.CALLED,
        TokenStatus.CANCELLED,
        TokenStatus.SKIPPED,
        TokenStatus.TRANSFERRED,
    },
    TokenStatus.CALLED: {
        TokenStatus.SERVING,
        # An operator may finish a short interaction without a separate
        # "start serving" step, so CALLED -> COMPLETED is permitted.
        TokenStatus.COMPLETED,
        TokenStatus.SKIPPED,
        TokenStatus.NO_SHOW,
        TokenStatus.CANCELLED,
        TokenStatus.WAITING,      # recall places the token back in the queue
        TokenStatus.TRANSFERRED,
    },
    TokenStatus.SERVING: {
        TokenStatus.COMPLETED,
        TokenStatus.CANCELLED,
        TokenStatus.TRANSFERRED,
    },
    TokenStatus.SKIPPED: {TokenStatus.WAITING, TokenStatus.CANCELLED},
    TokenStatus.COMPLETED: set(),
    TokenStatus.CANCELLED: set(),
    TokenStatus.TRANSFERRED: set(),
    TokenStatus.NO_SHOW: {TokenStatus.WAITING},
}

# Statuses that still occupy a place in the waiting line.
ACTIVE_TOKEN_STATUSES = [TokenStatus.WAITING.value, TokenStatus.CALLED.value, TokenStatus.SERVING.value]


def can_transition(current: TokenStatus, target: TokenStatus) -> bool:
    return target in TOKEN_TRANSITIONS.get(current, set())
