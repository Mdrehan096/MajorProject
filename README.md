# Wanderlust — Accommodation Discovery & Reservation Platform

Wanderlust is a production-hardened accommodation discovery and reservation platform built with **Node.js**, **Express 5**, **MongoDB Atlas (Mongoose 9)**, **Passport.js**, **Cloudinary**, **Mapbox**, and **EJS**.

---

## 1. Architecture Overview

The codebase enforces strict unidirectional separation across five layers:

```text
Routes ──▶ Middleware ──▶ Controllers ──▶ Services ──▶ Models
```

- **Routes (`routes/`):** Declarative URL mapping, authentication/ownership gates, Joi validation, and `wrapAsync` delegation (`health.js`, `listing.js`, `review.js`, `booking.js`, `user.js`, `legal.js`, mounted via `routes/index.js`).
- **Middleware (`middleware/`):** Security headers & per-request CSP nonces (`security.js`), CSRF tokens & deferred multipart CSRF verification (`csrf.js`), authentication & resource ownership checks (`auth.js`), in-memory auth rate limiting (`rateLimit.js`), allowlisted Joi & prototype-safe scalar validation (`validation.js`), Multer upload filters (`upload.js`), and normalized `400`/`404`/`413`/`500` error masking (`error.js`).
- **Controllers (`controllers/`):** Thin HTTP adapters reading validated inputs, invoking services, setting flash messages, and rendering EJS views or JSON responses. Contain zero Mongoose queries or database imports.
- **Services (`services/`):** Pure domain logic (`listingService.js`, `reviewService.js`, `userService.js`, `bookingService.js`, `healthService.js`), MongoDB multi-document ACID `snapshot` transactions, `bookingVersion` write-locking, server-side pricing calculations, and strict PII filtering. Contain zero Express `req`/`res`/flash/session dependencies.
- **Models (`models/`):** Mongoose schemas (`Listing`, `Review`, `User`, `Booking`) with validation hooks, deletion cascades, and compound query indexes.

---

## 2. Core Features Implemented

- **Discovery, Search & Filtering (`GET /listings`):** Keyword search (`q`), category tabs, min/max price filtering, sort modes (`newest`, `price_asc`, `price_desc`), pagination with filter query preservation, and card-projected `.lean()` queries.
- **Listings & Media Management (`GET/POST/PUT/DELETE /listings...`):** Authenticated creation and owner-only updates/deletions, Cloudinary `5MB` image uploads (`png`/`jpg`/`jpeg`/`webp`) with automatic orphaned-image cleanup, Mapbox forward geocoding & interactive maps (`public/js/map.js`), and `409 Conflict` listing deletion protection while active upcoming bookings exist.
- **Reviews (`POST/DELETE /listings/:id/reviews...`):** Transactional review creation attached to listings and author-only transactional review deletion (`reviewService.js`).
- **Accounts, Profile & Dashboards:** `passport-local-mongoose` signup/login, CSRF-protected `POST /logout`, safe redirect URL restoration, account profile management (`GET/PUT /profile`), host/reviewer overview (`GET /dashboard`), and legal pages (`GET /privacy`, `GET /terms`).

---

## 3. Booking, Availability & Pricing Rules

- **Half-Open Calendar Intervals (`utils/bookingDates.js`):** All dates normalize to UTC midnight using `[checkIn, checkOut)` semantics, preventing overlapping stays while permitting same-day turnover (`checkOut === nextCheckIn`).
- **Availability Endpoint (`GET /listings/:id/availability`):** Validates requested dates/guest count, filters active booking statuses (`pending`, `confirmed`), excludes `cancelled` bookings, and returns blocked date ranges + authoritative price breakdown JSON.
- **Transactional Double-Booking Prevention (`services/bookingService.js`):**
  - Uses multi-document MongoDB `snapshot` / `majority` transactions with transient `WriteConflict` retries and early-conflict short-circuiting.
  - Acquires an exclusive per-listing write lock (`Listing.findOneAndUpdate(..., { $inc: { bookingVersion: 1 } })`) prior to overlap checks so simultaneous identical-date requests serialize strictly (`1` winner, remaining `409 Conflict`).
- **Capacity, Self-Booking & Tamper Protection:** Enforces `guests <= maxGuests`, blocks hosts from booking their own properties (`400`), ignores client-submitted price/status/host/guest fields, forces initial `"pending"` status, and generates unique `WL-YYYYMMDD-<8-HEX>` references.
- **Immutable Snapshots & Non-Payment Disclosure:** Embeds frozen `pricing` and `listingSnapshot` subdocuments surviving future price edits or listing deletion. **Online payment processing is not enabled**; booking flows explicitly display `"Payment has not been collected. This reservation is not a paid booking."`
- **Guest & Host Reservation Controls:**
  - **Guest (`GET /bookings`, `GET /bookings/:id`, `POST /bookings/:id/cancel`):** History owned strictly by `req.user._id`, status KPIs, pagination, and immediate availability release upon cancellation.
  - **Host (`GET /host/bookings`, `POST /host/bookings/:id/status`):** Ownership-scoped dashboard excluding guest email PII, enforcing valid transitions (`pending -> confirmed`, `pending/confirmed -> cancelled`, `confirmed -> completed`).

---

## 4. Tax & Pricing Model

Calculated exclusively on the server via `utils/pricing.js` using currency `INR`:

- **`indian_gst_slabs` *(default)*:** Determined per nightly accommodation tariff (`utils/pricing.js`):
  - `0%` GST for nightly rate `<= ₹1,000`
  - `5%` GST for nightly rate `₹1,001 – ₹7,500`
  - `18%` GST for nightly rate `> ₹7,500`
- **`flat`:** Applies configurable `TAX_RATE` (`0`–`100%`).
- **`none`:** Zero tax applied.

---

## 5. Security Controls

- **CSRF Protection:** Timing-safe session synchronizer tokens (`_csrf` form field or `x-csrf-token` header) on all non-safe routes, including deferred verification + Cloudinary cleanup on multipart uploads.
- **Content Security Policy & Security Headers:** Per-request cryptographic `script-src` nonce (`'nonce-...'`, no `'unsafe-inline'` or `'unsafe-eval'`), `X-Content-Type-Options: nosniff`, `X-Frame-Options: SAMEORIGIN`, `Referrer-Policy: strict-origin-when-cross-origin`, `Strict-Transport-Security` in HTTPS production mode, disabled `X-Powered-By`, `<%= %>` EJS output escaping, and `safeJson` script embedding.
- **Input & Query Hardening:** Prototype-safe plain-object checks, strict scalar guards rejecting NoSQL operators (`$ne`, `$gt`, `$regex`) and boolean/array coercions, strict Joi payload allowlisting, and explicit `100kb` JSON/urlencoded body limits (`413` on overflow).
- **Access Control & PII Privacy:** Auth/ownership/participant guards (`403 Forbidden`), PBKDF2 password handling via Passport (`-hash -salt`), private emails omitted from public/booking views, auth throttling (`utils/rateLimiter.js`), and production 500 internal error masking.

---

## 6. Operational Health, Reliability & Logging

- **`GET /health`:** Liveness probe returning HTTP `200` (`{ status: "ok", uptimeSeconds, timestamp }`) with `Cache-Control: no-store`.
- **`GET /ready`:** Dependency readiness probe returning HTTP `200` (`{ status: "ready", database: "connected" }`) when MongoDB is connected, or HTTP `503` otherwise, with zero secret exposure.
- **Structured Redacting Logger (`utils/logger.js`):** Emits JSON logs for server lifecycle, DB events (`db.connected`, `db.disconnected`, `db.reconnected`, `db.connection_error`), session store errors, and sanitized upstream Mapbox `502` failures while redacting MongoDB credentials, API tokens, secrets, passwords, and hashes.
- **Resilient Shutdown (`server.js`):** Bounded `SHUTDOWN_TIMEOUT_MS` (`10000ms` default), `closeIdleConnections()` / `closeAllConnections()`, session store closure, and clean `disconnectDB()`.

---

## 7. Database Schemas & Indexes

- **`Listing` (`models/listing.js`):** `title`, `description`, `image`, `price`, `location`, `country`, `category`, `maxGuests`, `bookingVersion` (`select: false`), `reviews[]`, `owner`, `geometry` (GeoJSON `Point`).
  - Indexes: `{ price: 1, _id: 1 }`, `{ category: 1, _id: -1 }`, `{ category: 1, price: 1, _id: 1 }`, `{ owner: 1, _id: -1 }`, `{ reviews: 1 }`.
- **`Booking` (`models/booking.js`):** `bookingReference`, `listing`, `guest`, `host`, `checkIn`, `checkOut`, `guests`, `pricing`, `listingSnapshot`, `status` (`pending`/`confirmed`/`cancelled`/`completed`), `confirmedAt`, `cancelledAt`, `cancelledBy`, `cancellationReason`, `completedAt`, `paymentNotice`, timestamps.
  - Indexes: `{ listing: 1, status: 1, checkIn: 1, checkOut: 1 }`, `{ guest: 1, createdAt: -1, _id: -1 }`, `{ host: 1, createdAt: -1, _id: -1 }`, `{ host: 1, status: 1, createdAt: -1, _id: -1 }`, `{ bookingReference: 1 }` *(unique)*.
- **`Review` (`models/review.js`):** `comment`, `rating` (`1`–`5`), `createdAt`, `author`.
  - Index: `{ author: 1, createdAt: -1, _id: -1 }`.
- **`User` (`models/user.js`):** `email`, `displayName`, `bio`, `location`, plus `passport-local-mongoose` fields (`username` unique index, `hash`, `salt`).

---

## 8. Environment Variables

See [`.env.example`](file:///e:/Working%20Project/Airbnb/.env.example) for the complete annotated template. Key variables include:

- **Required:** `ATLASDB_URL` *(MongoDB Atlas / replica-set URI for ACID transactions)*, `SECRET` *(at least 32 characters and non-default in `NODE_ENV=production`)*.
- **Server & Database Tuning:** `NODE_ENV`, `PORT` (`8080`), `BODY_LIMIT` (`100kb`), `SHUTDOWN_TIMEOUT_MS` (`10000`), `DB_DNS_SERVERS` (`8.8.8.8,8.8.4.4`, or `none`/`system`), `DB_MAX_POOL_SIZE` (`10`), `DB_SERVER_SELECTION_TIMEOUT_MS` (`10000`), `DB_SOCKET_TIMEOUT_MS` (`45000`).
- **Integrations:** `CLOUD_NAME`, `CLOUD_API_KEY`, `CLOUD_API_SECRET`, `CLOUD_FOLDER`, `MAP_TOKEN`.
- **Pricing, Rate Limits & Bookings:** `TAX_MODE`, `TAX_RATE`, `TAX_LABEL`, `MAX_STAY_NIGHTS` (`90`, max `365`), `BOOKING_DEFAULT_MAX_GUESTS` (`8`, max `50`), `BOOKING_TX_MAX_RETRIES` (`4`, `1`–`10`), `AUTH_RATE_LIMIT_WINDOW_MS`, `AUTH_RATE_LIMIT_MAX`.

---

## 9. Installation & Running Locally

```bash
npm install
cp .env.example .env   # Populate ATLASDB_URL, SECRET, Cloudinary & Mapbox values
npm start              # Runs: node server.js
```

Once started, open `http://localhost:8080/listings` (and verify liveness at `/health` and readiness at `/ready`).

> **Deployment Note:** When running `NODE_ENV=production` behind a reverse proxy (Render, Railway, Nginx, etc.), `trust proxy` and `Secure` session cookies are enabled automatically; ensure the proxy forwards `X-Forwarded-Proto: https`.

---

## 10. Verification & Limitations

- **Verified Automated Suites:** Offline unit/CSP/boundary suites (`15/15` passing covering Phases 3–5.3), syntax checks, unmocked `NODE_ENV=production` + MongoDB Atlas live regression suite (concurrency locks, overlap rules, snapshot immutability, IDOR/CSRF/NoSQL security, `/health`, `/ready`, `413` limits, `502` Mapbox sanitization, weak-`SECRET` startup guard), and Atlas clean-state teardown checks all passed cleanly.
- **Browser Check Limitation:** Interactive Chrome DevTools inspection was attempted but blocked by the host environment (`DevToolsActivePort` unavailable); client scripts, strict CSP headers/nonces, zero inline HTML handlers, and live multi-session HTTP responses were verified programmatically.
- **Known Scope Constraints:**
  - Payment collection and checkout are not implemented.
  - Authentication rate limiting uses single-process in-memory buckets (`utils/rateLimiter.js`); horizontally scaled deployments should replace it with a distributed store.
  - Text search (`?q=...`) relies on escaped `$regex` filtering rather than a dedicated full-text search index.
  - Additional historical verification details are summarized in [`PHASE_5_PRODUCTION_READINESS_FINAL_REPORT.md`](file:///e:/Working%20Project/Airbnb/PHASE_5_PRODUCTION_READINESS_FINAL_REPORT.md).
