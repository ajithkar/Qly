# Qly

Multi-tenant SaaS for queue and appointment management. Customers scan a code,
take a token, and watch their position. Staff call the next person from one
screen.

FastAPI · MongoDB · Redis · WebSockets · React 19 · Vite · Tailwind

---

## Run it

Backend and frontend run as two local processes - see `backend/README.md`
and `frontend/README.md` for the full quick start, or just:

```bash
make install
make api    # http://localhost:8000, in one terminal
make web    # http://localhost:5173, in another
```

Sign in:

| | |
|---|---|
| Email | `owner@demo-clinic.com` |
| Password | `DemoPassw0rd` |

The stack seeds a clinic with a branch, a service, a provider, and an **open
queue with three people already waiting**, so the operator console does
something the moment you open it. Go to **Queues → Console** and press
**Space** to call the first person.

Turn the demo data off with `SEED_DEMO=false` in `.env`.

### Local development

```bash
make install     # backend + frontend dependencies
make api         # API on :8000  (needs Mongo and Redis running)
make web         # Vite dev server on :5173, proxying /api and /ws
make test        # backend tests + frontend lint
make check       # verify the frontend/backend API contract
```

---

## How the pieces connect

```
browser ──► nginx :8080 ──┬── /            static React bundle
                          ├── /api/*  ───► FastAPI :8000
                          └── /ws/*   ───► FastAPI :8000  (WebSocket upgrade)
                                              │
                                              ├── MongoDB   data
                                              └── Redis     cache, rate limits,
                                                            locks, WS fan-out
```

Serving the app and the API from **one origin** is deliberate: no CORS in the
deployed path, and no cookie/`SameSite` surprises. CORS config exists only for
the split dev servers on :5173 and :8000.

The WebSocket has its own nginx block with the upgrade headers and a one-hour
read timeout. Without it, the operator console silently degrades to polling
every 60 seconds and nobody notices until a customer is called late.

---

## The contract check

The two halves share no compiler, so a renamed route would surface as a 404 in
whichever screen nobody happened to open. `scripts/check_contract.py` reads the
backend's real OpenAPI schema, parses every call in
`frontend/src/api/endpoints.js`, and fails if any call has no matching route.
It runs in CI.

```
$ make check
Backend routes declared : 75
Frontend calls found    : 52
Unused backend routes   : 23
Contract check PASSED — every frontend call maps to a real route.
```

Those 23 unused routes are the Super Admin API and other endpoints that have no
UI yet — the number is a running score of how much backend still lacks a face.

---

## Three bugs integration found

Worth recording, because none were visible from either side alone.

1. **Every authenticated staff request would have returned 500.**
   `get_current_principal` looks up the staff record to discover which tenant
   the caller belongs to — but `StaffRepository` is tenant-scoped and raised
   when asked for a record without one. A chicken-and-egg the unit tests never
   hit because they never went through the HTTP auth dependency. Fixed with an
   explicit `get_by_id_any_tenant`, the one place a non-scoped read is
   legitimate.

2. **The seeded Super Admin could never sign in.** `scripts/seed.py` defaulted
   to `admin@qly.local`, and `.local` is a reserved TLD that `EmailStr`
   rejects — so the seed wrote a valid record that the login endpoint refused
   at 422. The seed now validates the address and fails loudly instead.

3. **The e2e fixtures were seeding a store the app never read.** In
   `mongomock-motor`, sync `.delegate` writes are invisible to async reads.
   Not product code, but it would have made every future integration test
   quietly meaningless.

---

## Verified

| Check | Result |
|---|---|
| Backend tests | 73 passing |
| Frontend build | `vite build` clean, 2,352 modules |
| Frontend lint | `eslint src` clean, zero warnings |
| API contract | 52/52 frontend calls resolve |
| Demo path | login → queue → call next → complete, end to end |

---

## What is not built

Being explicit so nobody discovers it during a demo.

**Backend:** reports and export, landing CMS, support tickets, customer
management, file/object storage, background worker for reminders and dunning.
Email is logged, not sent. SMS/WhatsApp is an interface, disabled by default.

**Frontend:** Super Admin portal, vendor registration and Stripe Checkout,
the Google sign-in button, the customer booking flow, QR/kiosk mode,
notifications centre, staff and roles admin. **No frontend tests exist** —
build and lint pass, which is not the same as working.

**Two caveats on the tests.** They run against `mongomock-motor` and
`fakeredis`, which do not enforce unique indexes. So the two hardest
guarantees — no double-booking, and Stripe webhook idempotency under a race —
are covered by application-level pre-checks that the tests do exercise, but the
index backstop itself is unproven. Run the suite against a real MongoDB before
claiming those hold under concurrency.

---

## Layout

```
qly/
  backend/          FastAPI — see backend/README.md
  frontend/         React — see frontend/README.md
  scripts/
    check_contract.py
  Makefile
```
