# Wanderlust — Full-Stack Accommodation & Reservation Platform

Wanderlust is a production-hardened accommodation discovery and reservation platform built with **Node.js**, **Express 5**, **MongoDB Atlas (Mongoose 9)**, **Passport.js**, and **EJS**.

---

## Architecture

The application follows a strict layered request architecture:

`Routes → Middleware → Controllers → Services → Models`

- **Routes (`routes/`):** URL mapping, authentication/ownership gates, Joi validation, and `wrapAsync` delegation.
- **Middleware (`middleware/`):** Security headers & per-request CSP nonces (`security.js`), CSRF protection & multipart upload deferral (`csrf.js`), authentication/ownership guards (`auth.js`), auth rate limiting (`rateLimit.js`), Joi/schema allowlisting (`validation.js`), safe fallback error rendering & production error masking (`error.js`).
- **Controllers (`controllers/`):** Request parsing, calling service methods, flash messaging, rendering EJS views or JSON responses. No direct Mongoose or model imports.
- **Services (`services/`):** Pure domain business logic (`listingService.js`, `reviewService.js`, `userService.js`, `bookingService.js`), MongoDB multi-document ACID snapshot transactions, optimistic/write-lock double-booking prevention, server-side pricing calculations, and strict PII exclusion.
- **Models (`models/`):** Mongoose schemas (`Listing`, `Review`, `User`, `Booking`) with validation hooks and compound indexes.

---

## Implemented Features (Phases 1 – 4)

### Discovery, Listings, Reviews & Account Management
- Search, category filtering, price-range filters, sorting, and pagination (`GET /listings`).
- Listing CRUD with Cloudinary image uploads, cleanup on failed commits, Mapbox geocoding/maps (`GET/POST/PUT/DELETE /listings...`), and deletion protection when active bookings exist (`409 Conflict`).
- Transactional review creation and cascade-safe deletion (`POST/DELETE /listings/:id/reviews...`).
- User registration, login/logout (`passport-local-mongoose`), auth rate limiting, safe redirect restoration, user profile editor (`/profile`), and host/reviewer account overview (`/dashboard`).
- Legal documentation pages (`/privacy`, `/terms`).

### Booking & Reservation System (Phase 4)
- **Live Availability Checking (`GET /listings/:id/availability`):** Validates half-open UTC stay intervals `[checkIn, checkOut)` so back-to-back check-out and check-in dates never conflict, checks capacity against `maxGuests`, filters active booking statuses (`pending`, `confirmed`), and returns upcoming blocked slots + server-computed price breakdowns.
- **Reservation Review & Transactional Creation (`GET /listings/:id/book`, `POST /listings/:id/book`):**
  - Strictly calculates nightly rate, Indian accommodation GST slabs (or configured `TAX_MODE`), and total price on the server (`utils/pricing.js`).
  - Ignores client-tampered prices, host IDs, or statuses.
  - Locks per-listing `bookingVersion` inside MongoDB `snapshot` / `majority` transactions with transient retry handling to prevent concurrent double-bookings.
  - Freezes immutable `pricing` and `listingSnapshot` records (surviving future price changes or listing deletion) and generates unique `WL-YYYYMMDD-<HEX>` booking references.
  - Note: Online payment processing is intentionally out of scope; reservations clearly disclose that payment has not been collected.
- **Guest Booking Dashboard & Cancellation (`GET /bookings`, `GET /bookings/:id`, `POST /bookings/:id/cancel`):**
  - Authenticated guest booking history with KPI stats, status tabs, pagination, empty/out-of-range states, and historical snapshot fallback.
  - Guest cancellation immediately updates status (`cancelledBy: "guest"`, `cancelledAt`, optional `cancellationReason`) and releases calendar dates within a transaction.
- **Host Booking Management (`GET /host/bookings`, `POST /host/bookings/:id/status`):**
  - Displays reservations strictly for listings owned by the authenticated host (`Listing.owner` verified dynamically), omitting guest email addresses and ignoring spoofed query parameters.
  - Supports status filtering, owned-property filtering, pagination, and transactional transitions (`pending -> confirmed`, `pending/confirmed -> cancelled` with `cancelledBy: "host"`, `confirmed -> completed`).

---

## Security Controls

- **CSRF Protection:** Synchronizer tokens checked across all non-safe HTTP requests (`POST`, `PUT`, `DELETE`) via form `_csrf` or `x-csrf-token` header; multipart uploads verify CSRF immediately after Multer parsing.
- **Content Security Policy & Security Headers:** Per-request cryptographic `'nonce-<...>'`, `X-Content-Type-Options: nosniff`, `X-Frame-Options: SAMEORIGIN`, `Referrer-Policy: strict-origin-when-cross-origin`, disabled `X-Powered-By`, zero inline HTML event handlers, `safeJson` script embedding, and escaped `<%= %>` EJS output.
- **Input & Query Hardening:** Prototype-safe plain-object checks, strict scalar enforcement blocking NoSQL operators (`$ne`, `$gt`, `$lt`, `$regex`) and boolean/array coercions, strict payload field allowlisting, and sanitized JSON `SyntaxError` handling.
- **Access Control & Privacy:** Strict participant authorization (`403 Forbidden`), role separation across guest cancellation vs. host status routes, listing ownership verification, no exposed user emails/password hashes/salts, and production 500 error masking.

---

## Route Reference

| Area | Method & Path | Access | Description |
| :--- | :--- | :--- | :--- |
| Root | `GET /` | Public | Redirects to `/listings` |
| Discovery | `GET /listings` | Public | Search, filter, sort, and paginate listings |
| Listings | `GET /listings/new`, `POST /listings` | Logged in | Create new listing |
| Listing Details | `GET /listings/:id` | Public | Property view, availability widget, pricing, map, reviews |
| Listing Availability | `GET /listings/:id/availability` | Public | JSON availability, pricing preview, and blocked dates |
| Edit / Delete | `GET /listings/:id/edit`, `PUT/DELETE /listings/:id` | Listing Owner | Edit listing or delete when no upcoming active bookings exist |
| Reviews | `POST /listings/:id/reviews`, `DELETE /listings/:id/reviews/:reviewId` | Logged in / Author | Add or delete listing reviews |
| Booking Review | `GET /listings/:id/book`, `POST /listings/:id/book` | Logged in Guest | Review pricing/blocked dates & create reservation |
| Guest Bookings | `GET /bookings` | Logged in Guest | Guest booking history, KPIs, filter tabs, pagination |
| Booking Details | `GET /bookings/:id` | Booking Guest or Host | Confirmation, pricing snapshot, timestamps & action controls |
| Guest Cancel | `POST /bookings/:id/cancel` | Booking Guest | Cancel active reservation & release dates |
| Host Dashboard | `GET /host/bookings` | Logged in Host | Reservations for host's owned listings w/ status/property filters |
| Host Status | `POST /host/bookings/:id/status` | Listing Owner Host | Confirm, mark completed, or cancel reservation |
| Auth & Account | `GET/POST /signup`, `GET/POST /login`, `POST /logout` | Public / Logged in | User authentication with rate limiting |
| Profile & Dash | `GET/PUT /profile`, `GET /dashboard` | Logged in | Profile update & account listings/reviews summary |
| Legal | `GET /privacy`, `GET /terms` | Public | Privacy Policy and Terms of Service |

---

## Environment Configuration

Configure variables in `.env` (for local development; never commit `.env`):

```env
NODE_ENV=development
PORT=8080
ATLASDB_URL=mongodb+srv://<user>:<password>@<cluster>/<db>?retryWrites=true&w=majority
SECRET=<strong-session-secret>

# Optional Integrations (graceful fallbacks when omitted in development)
CLOUD_NAME=
CLOUD_API_KEY=
CLOUD_API_SECRET=
CLOUD_FOLDER=wanderlust_DEV
MAP_TOKEN=

# Optional Pricing & Booking Controls
TAX_MODE=indian_gst_slabs        # indian_gst_slabs | flat | none
TAX_RATE=                        # Used when TAX_MODE=flat
TAX_LABEL=Estimated GST
MAX_STAY_NIGHTS=90               # Capped at 365
BOOKING_DEFAULT_MAX_GUESTS=8     # Capped at 50
BOOKING_TX_MAX_RETRIES=4         # Bounds 1..10
```

---

## Running Locally

```bash
npm install
node server.js
```

Visit `http://localhost:8080/listings` in your browser.
