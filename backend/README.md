# Qly — Backend API

Multi-tenant SaaS backend for the Qly Queue & Appointment Management Platform.
FastAPI · MongoDB (Motor) · Redis · WebSockets · Stripe.

---

## What is and isn't built

Be clear about this before you demo or extend it.

### Implemented and tested

| Area | Status |
|---|---|
| Foundation (config, errors, logging, middleware, metrics) | ✅ |
| Auth: vendor email/password, verification, reset, staff invites | ✅ |
| Auth: Super Admin login, refresh-token rotation with reuse detection | ✅ |
| Auth: Google OAuth for end users (full code-exchange flow) | ✅ |
| RBAC: module/action permissions, role presets, API + UI guards | ✅ |
| Queue engine: atomic tokens, guarded transitions, priority, transfer | ✅ |
| ETA: rolling average service time with duration fallback | ✅ |
| Live monitor + WebSockets with Redis pub/sub fan-out | ✅ |
| Scheduling: slot generation, booking, reschedule, cancel, waitlist rules | ✅ |
| Appointment → queue check-in conversion | ✅ |
| Billing: Stripe Checkout, signature-verified idempotent webhooks, dunning | ✅ |
| Plan-limit enforcement (blocks creation past cap) | ✅ |
| Super Admin: dashboard KPIs, vendors, plans, users, audit, impersonation | ✅ |
| Audit logging (append-only) | ✅ |
| Data rights: export + deletion request | ✅ |
| Health/readiness probes and real system metrics | ✅ |
| 64 tests | ✅ |

### Not built (deliberate scope boundary)

- **Reports & analytics endpoints** and PDF/Excel/CSV export
- **Landing CMS**, industry-category admin CRUD (categories are seeded only)
- **Support ticket** module
- **Customer management** module (profiles, blacklist, notes, feedback)
- **File/object storage** (S3 driver, image resizing, upload validation)
- **Email delivery** — `EmailChannel` logs instead of sending; wire your provider
- **SMS/WhatsApp** — interface exists, disabled by default (see below)
- **Scheduled jobs** — appointment reminders and dunning expiry need a worker

### Two honest caveats

1. **The test suite uses `mongomock-motor`, which does not enforce unique
   indexes.** Two guarantees are therefore demonstrated but not *proven* by the
   suite: the no-double-booking unique partial index on appointments, and the
   `stripe_events.event_id` uniqueness backstop. Both have application-level
   pre-checks that the tests do exercise. **Run the suite against a real
   MongoDB before claiming those guarantees hold under concurrency.**

2. **SMS/WhatsApp is off by default.** In-app + WebSocket + email will not
   reliably reach someone sitting in a waiting room with the tab closed. This
   is a documented limitation, not an oversight — see `SmsChannel` in
   `app/services/notification_service.py`.

---

## Quick start

```bash
python -m venv .venv && source .venv/bin/activate
pip install -r requirements-dev.txt

cp .env.example .env
# Set JWT_SECRET_KEY. Generate one with:
python -c "import secrets; print(secrets.token_urlsafe(64))"

# Start MongoDB and Redis (locally installed, or point at hosted instances)

python -m scripts.seed          # plans, categories, Super Admin
uvicorn app.main:app --reload
```

API docs at `http://localhost:8000/docs` (disabled in production).

Run tests:

```bash
pytest -q
```

---

## Architecture

Clean layering, enforced by convention and reviewed in code review:

```
routes/        HTTP concerns only — parse, guard, delegate, wrap response
  ↓
services/      business logic — the queue engine, scheduling, billing
  ↓
repositories/  the ONLY layer that touches MongoDB
  ↓
models/        documents, enums, the token state machine
```

**Business logic never lives in a route handler.** If a route body grows past
delegation and response-wrapping, the logic belongs in a service.

### Directory map

```
app/
  core/          config, errors, logging, security, permissions, rate limiting, metrics
  db/            Mongo + Redis connections, index definitions
  models/        base document helpers, enums, token state machine
  schemas/       Pydantic request/response contracts
  repositories/  data access, tenant-scoped
  services/      business logic
  api/
    deps.py      auth, tenant scoping, permission guards
    v1/routes/   endpoint modules
  websocket/     connection manager (Redis fan-out) + endpoints
scripts/seed.py  baseline data
deploy/          systemd unit (self-hosted VPS only)
tests/
```

---

## The five decisions worth knowing

**1. Tenant scope comes from the token, never the request body.**
`get_tenant_id` derives it from the authenticated principal. A client cannot
ask for another tenant's data by changing a field — the query is built in
`BaseRepository._scope()` and raises if a tenant-scoped collection is queried
without one.

**2. Token allocation is atomic; state changes are guarded.**
Token numbers come from a single `find_one_and_update` with `$inc` and
`upsert` on a per-(tenant, branch, service, day) counter — concurrent joins are
serialised by MongoDB itself, no lock required. Every status change is a
conditional update filtered on the *expected current status*, so if two
operators press "Call Next" simultaneously, exactly one wins and the other
receives a clean `409 invalid_transition` instead of a double-serve.

**3. Stripe's webhook is the only source of truth.**
The Checkout success page activates nothing. A subscription becomes active
because a signature-verified webhook said so. Signature verification is
implemented directly (`StripeService.verify_signature`) rather than hidden in
an SDK, including replay rejection via timestamp tolerance.

**4. Permissions are resolved server-side on every request.**
Access tokens carry identity, not a permission list. `get_current_principal`
re-loads the account each request, so a suspension or role change takes effect
immediately rather than lingering until token expiry. `/auth/me` returns the
resolved set so the UI can mirror the same guards.

**5. Audit logs have no write path but insert.**
`AuditRepository` exposes no update or delete method. Immutability is enforced
by the absence of code, not by a comment asking people to behave.

---

## Environment variables

See `.env.example`. The ones that matter in production:

| Variable | Notes |
|---|---|
| `JWT_SECRET_KEY` | App refuses to boot in production with the default value |
| `MONGODB_URI` / `REDIS_URL` | Both required; `/ready` fails without them |
| `STRIPE_WEBHOOK_SECRET` | Webhook endpoint returns an error if unset |
| `GOOGLE_CLIENT_ID` / `_SECRET` | End-user sign-in returns 503 if unset |
| `CORS_ORIGINS` | Comma-separated; do not use `*` |
| `ENVIRONMENT` | `production` disables `/docs` and enables HSTS |

---

## Deployment

Deployed on Render, building directly from `requirements.txt` - no
container image involved.

For a self-hosted VPS instead, `deploy/qly-api.service` runs the app under
systemd; put a reverse proxy in front with WebSocket upgrade headers and a
long read timeout on the `/ws/` path.

**Scaling note:** WebSocket broadcasts go through Redis pub/sub specifically so
multiple app instances work. Without it, a client connected to instance B would
never see an event raised on instance A. Do not remove that indirection when
adding workers.

---

## Where to pick it back up

In rough dependency order:

1. Wire a real email provider into `EmailChannel`
2. Object storage + upload validation (logos, provider photos)
3. Customer management module
4. Reports & analytics with export
5. A background worker for appointment reminders and dunning expiry
6. CMS + support tickets
7. Run the suite against real MongoDB and add true concurrency tests
