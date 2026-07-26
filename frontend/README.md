# Qly — Frontend

React 19 · JavaScript (no TypeScript) · Vite · Tailwind · TanStack Query · Zod

---

## Running it

```bash
npm install
cp .env.example .env      # leave VITE_API_URL empty in development
npm run dev               # http://localhost:5173
```

Vite proxies `/api` and `/ws` to `http://localhost:8000`, so start the backend
first. Then:

```bash
npm run lint              # build-blocking — see below
npm run build
```

---

## Why there's no TypeScript, and what replaces it

This is plain JavaScript by choice. That removes a compiler that would
otherwise catch a whole class of bugs, so four things carry that weight
instead — none of them optional:

1. **Zod at every boundary.** `src/api/schemas.js` defines the shape of every
   response. `request()` in `src/api/client.js` parses before returning, and
   a mismatch throws loudly rather than surfacing as `undefined` three
   components deep. Unvalidated network data never reaches a component.
2. **PropTypes on every component** with props.
3. **ESLint is build-blocking** (`--max-warnings 0`), including
   `react-hooks` and `jsx-a11y`. With no type check, this is the safety net.
4. **One API layer.** Components never call axios or build a URL; everything
   goes through `src/api/endpoints.js`.

Worth being clear-eyed: this narrows the gap with TypeScript, it does not
close it. Refactors across many files stay riskier than they would be with a
compiler.

---

## The design

**Subject:** counter operations. The person using this all day is a
receptionist at a clinic, salon, or bank desk. The single question they need
answered without hesitating is *who do I call next?*

**Signature element — the call board.** A token number is the real artifact of
this world: the thing people crane their necks to read across a waiting room.
So it gets oversized tabular-mono numerals on an inset dark plate that
deliberately reads as physical hardware, with one amber bulb lit only while
someone is actually being served. That is the one loud thing in the product;
everything around it is flat surfaces and hairline borders so it stays loud.

**Palette from civic wayfinding**, not SaaS marketing: signal blue is the blue
of every airport and hospital direction sign, amber is the "now serving" bulb,
jade and rose read as served and missed from across a room. Status colours are
identical everywhere so they're learned once.

**Motion is nearly absent.** The board flashes three times when a token is
called, because an operator glancing back needs to know the call registered.
That is real feedback, not decoration. Nothing else animates, and
`prefers-reduced-motion` suppresses even that.

**Two decisions in the console worth calling out:**

- **Space calls the next person.** It is the most repeated action of the day
  and deserves the largest button plus a keyboard shortcut.
- **A 409 is not an error message.** The backend guards every transition, so a
  409 means another operator acted first. In a two-desk clinic that is normal.
  It shows as "Another operator got there first. Refreshed." and re-syncs,
  rather than a red failure the user has to interpret.

---

## Structure

```
src/
  api/         schemas.js (Zod), client.js (axios + refresh), endpoints.js
  auth/        AuthContext, route + permission guards
  components/
    ui/        Button, Card, Badge, Field, Dialog, Toast, Table, states
    layout/    VendorLayout (permission-filtered nav)
    CallBoard.jsx
  hooks/       useTheme, useQueueSocket
  pages/
    public/    Landing, Login
    vendor/    Dashboard, Queues, OperatorConsole, Services,
               Providers, Branches, Appointments, Billing
    user/      FindPlaces, TrackToken
```

**Token refresh is single-flight.** Concurrent 401s queue behind one refresh
call; letting each fire its own would burn the rotating refresh token and log
the user out. See `src/api/client.js`.

**Permissions are mirrored, not enforced.** `can()` hides controls the user
can't use, purely as a usability affordance. The API rejects the call
regardless of what the UI renders — never treat a hidden button as security.

**The WebSocket is a fast path, not the source of truth.** `useQueueSocket`
reconnects with exponential backoff, and the console keeps a 15-second poll as
a fallback. A frozen screen showing a stale token number means calling the
wrong person, so degrading to polling beats appearing connected.

---

## What isn't built

- **Super Admin portal** — the backend endpoints exist; no UI yet
- **Vendor registration + Stripe Checkout** flow (the `/register` route is
  linked from the landing page but not implemented)
- **Google sign-in UI** for end users — `auth.googleLoginUrl()` is wired in the
  API layer, no button yet
- **Booking flow** — slot picker and appointment creation for customers
- **QR / kiosk mode**, notifications centre, profile, staff & roles admin,
  reports
- **Tests.** There are none. The build and lint pass, but no component or
  integration tests exist — treat that as the largest gap here.
- **Charts on the vendor dashboard** currently plot queue capacity, because
  that is what the backend exposes today. Once the reports endpoints exist,
  replace that with real appointment and revenue series.

Verified: `vite build` succeeds (2,352 modules) and `eslint src` passes with
zero warnings.
