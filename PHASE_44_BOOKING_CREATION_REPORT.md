# Wanderlust — Phase 4.4 Report (Booking Routes, Controllers, Creation & Confirmation Flow)

**Phase:** Phase 4.4 — Booking Routes, Controllers, Creation & Confirmation Flow  
**Status:** Completed & Verified *(Pending User Approval for Phase 4.5)*  
**Baseline:** `8600276` (`Phase 4.3 completed`)

---

## 1. Routes Added

Mounted via [`routes/booking.js`](file:///e:/Working%20Project/Airbnb/routes/booking.js) and registered cleanly in [`routes/index.js`](file:///e:/Working%20Project/Airbnb/routes/index.js) after listing/review routes:

| Method & Path | Middleware | Controller Action | Purpose |
| :--- | :--- | :--- | :--- |
| `GET /listings/:id/book` | `isLoggedIn` | `bookingController.renderBookingReview` | Renders the reservation review page (`bookings/new.ejs`) with upcoming unavailable dates and server-calculated pricing preview. |
| `POST /listings/:id/book` | `isLoggedIn`, `csrfProtection`, `validateBooking` | `bookingController.createBooking` | Validates inputs strictly on the server, ignores client price/ID/status tampering, runs transactional creation, flashes notice, and redirects (`302`) to `/bookings/:id` (or re-renders with `400`/`409`). |
| `GET /bookings/:id` | `isLoggedIn` | `bookingController.showBooking` | Enforces participant ownership (`guest` or `host`, `403` otherwise), formats UTC calendar dates, and renders the booking confirmation/details view (`bookings/show.ejs`). |

---

## 2. Files Added & Modified

| File | Changes Made |
| :--- | :--- |
| [`schema.js`](file:///e:/Working%20Project/Airbnb/schema.js#L38-L42) | Added Joi `bookingSchema` (`checkIn`, `checkOut` trimmed strings, `guests` integer `1..50`). |
| [`middleware/validation.js`](file:///e:/Working%20Project/Airbnb/middleware/validation.js) | Added `isPlainObject`, `isStrictScalarOrUndefined`, and `validateBooking` (supports flat `{ checkIn, checkOut, guests }` and `booking[...]` payloads, rejects non-scalar/NoSQL payloads `400`, strips tampered HTTP fields `price`/`totalPrice`/`subtotal`/`taxAmount`/`guest`/`host`/`status`/`_csrf`, attaches `req.validatedBooking` and `req.bookingValidationError`). |
| [`services/bookingService.js`](file:///e:/Working%20Project/Airbnb/services/bookingService.js) | Updated & exported `PAYMENT_UNSUPPORTED_NOTICE` (`"Payment has not been collected. This reservation is not a paid booking."`) and added `getBookingReviewDetails(listingId, rawQuery, options)` for review pricing, availability, `isOwnListing`, `isPriceAvailable`, and blocked dates without exposing PII. |
| [`controllers/bookings.js`](file:///e:/Working%20Project/Airbnb/controllers/bookings.js) | Created thin Express 5 controller (`renderBookingReview`, `createBooking`, `showBooking`) with zero direct Mongoose/model imports, UTC calendar date formatting (`timeZone: "UTC"`), expected `400`/`409` re-rendering with preserved status codes, and clean delegation to `next(err)` for `404` and unexpected errors. |
| [`routes/booking.js`](file:///e:/Working%20Project/Airbnb/routes/booking.js) & [`routes/index.js`](file:///e:/Working%20Project/Airbnb/routes/index.js) | Defined authenticated booking routes wrapped with `wrapAsync` and mounted `bookingRouter` cleanly without route conflicts. |
| [`views/bookings/new.ejs`](file:///e:/Working%20Project/Airbnb/views/bookings/new.ejs) & [`public/js/bookingReview.js`](file:///e:/Working%20Project/Airbnb/public/js/bookingReview.js) | Created CSRF-protected booking review form, unpaid reservation notice, upcoming blocked dates card, server-calculated price breakdown card, and CSP-safe progressive preview script (zero inline handlers, escaped EJS output). |
| [`views/bookings/show.ejs`](file:///e:/Working%20Project/Airbnb/views/bookings/show.ejs) | Created reservation confirmation/details page displaying listing title & image (with `listingSnapshot` fallback), participant usernames/display names (no email PII), UTC check-in & check-out dates, nights, guests, nightly price, subtotal, tax breakdown, final total (`INR`), `bookingReference`, `status`, creation timestamp, and the unpaid booking notice. |
| [`views/listings/show.ejs`](file:///e:/Working%20Project/Airbnb/views/listings/show.ejs#L448-L511) & [`public/js/listingDetails.js`](file:///e:/Working%20Project/Airbnb/public/js/listingDetails.js) | Added Reserve CTA in the pricing sidebar (`Log in to Reserve` link for anonymous visitors, self-booking note for listing owners, `Reserve Stay` form passing selected dates/guests to `GET /listings/:id/book` for logged-in guests) and synced hidden booking inputs cleanly in JS. |

---

## 3. Booking Flow Summary & Confirmation View Details

1. **Listing Selection (`GET /listings/:id`):** Visitors preview pricing and availability; clicking `Log in to Reserve` or `Reserve Stay` enters `GET /listings/:id/book` carrying selected `checkIn`, `checkOut`, and `guests`.
2. **Review & Validation (`GET /listings/:id/book` -> `POST /listings/:id/book`):**
   - `isLoggedIn` guarantees an authenticated `req.user`; `csrfProtection` validates `_csrf`.
   - `validateBooking` allowlists only `{ checkIn, checkOut, guests }`, silently stripping client-submitted prices, IDs, or statuses at the HTTP boundary (`bookingService.createBooking` retains direct unexpected-field rejection `400` for internal callers).
   - `bookingService.createBooking()` derives `guest` from `req.user._id` and `host` from `listing.owner`, locks the listing version inside a MongoDB snapshot transaction, rechecks half-open `[checkIn, checkOut)` availability, computes pricing breakdown server-side, freezes `pricing` + `listingSnapshot`, generates `bookingReference`, and stores status `"pending"`.
   - Concurrent date overlaps or unavailable ranges return **HTTP `409`** cleanly on the review form; invalid inputs, past check-in, own-listing attempts, capacity excess, or missing price return **HTTP `400`**.
3. **Confirmation & Details (`GET /bookings/:id`):**
   - `bookingService.findBookingById()` verifies `actorId` matches either `booking.guest` or `booking.host`, returning **HTTP `403`** to any other user.
   - Displays booking reference, status, UTC creation timestamp, listing photo/title (with snapshot fallback), guest & host labels (zero emails), UTC check-in/check-out, nights, guest count, frozen pricing breakdown, and `"Payment has not been collected. This reservation is not a paid booking."`.

---

## 4. Test Coverage & Verification Results

> **Environment Note:** Offline syntax/unit suites ran in standard sandbox (`exit 0`). Live MongoDB Atlas + Express 5 integration checks ran with `BypassSandbox: true` after sandboxed DNS queries timed out (`querySrv ETIMEOUT`).

### A. Static & Unit Suites *(Offline / Mocked)*
- **`node --check` Syntax Checks:** **PASS (`exit 0`)** across `schema.js`, `middleware/validation.js`, `services/bookingService.js`, `controllers/bookings.js`, `routes/booking.js`, `routes/index.js`, `public/js/bookingReview.js`, `public/js/listingDetails.js`.
- **`verify_phase44_unit.js`:** **PASS (`exit 0`)**
  - Architectural boundary audit (`controllers/bookings.js` vs `services/bookingService.js`), route/middleware wiring, and strict CSP audit (`views/bookings/new.ejs`, `views/bookings/show.ejs`, `views/listings/show.ejs`).
  - `validateBooking` allowlisting (flat & `booking[...]` bodies), invalid ObjectId `400`, NoSQL object rejection `400`, tampering field stripping, and Joi validation deferral to `400` form re-render.
  - `getBookingReviewDetails`, `controllers/bookings.js` (`200`, `302`, `400`, `403`, `404`, `409`, unexpected `500` pass-through), UTC date formatting, EJS rendering + XSS escaping + deleted listing snapshot fallback + PII exclusion, and Node VM client script checks.
- **Full Regression Unit Suites (`audit_boundaries.js`, `3A`, `3B`, `3C.5`, `3D.1`, `3D.2`, `3D.3`, `3D.4`, `4.2`, `4.3`):** **ALL PASS (`exit 0`)**.

### B. Live Express 5 + MongoDB Atlas Integration Suites *(Unmocked Atlas 8.0.37)*
- **`verify_phase44_live.js` (`port 60788`):** **PASS (`exit 0`)**
  - **Booking Creation & Confirmation Flow:** Guest visits listing show -> booking review -> submits `POST /listings/:id/book` (`302 -> /bookings/:id`) -> views confirmation (`200`) with exact unpaid notice, server-calculated pricing (`6,300 INR`), UTC dates, reference `WL-YYYYMMDD-*`, status `pending`, host view (`200`), zero email PII, and verified price snapshot immutability after updating listing price in Atlas.
  - **Security Checks:** Anonymous redirects to `/login` (`302`), missing/wrong CSRF rejected (`403`), client-submitted tampering (`price=1`, `totalPrice=1`, `guest`, `host`, `status="confirmed"`) ignored completely over HTTP while storing server values (`guest=guest1`, `host=host`, `status="pending"`, `totalPrice=6300`), cross-user IDOR denied (`403` without reference leak), invalid IDs (`400`) & missing IDs (`404`) handled without internal DB/stack exposure.
  - **Validation, Availability & Live HTTP Race:** Past check-in, reversed dates, guest capacity overflow, own-listing booking, and unpriced listing rejected (`400`); overlapping dates rejected (`409`); back-to-back check-out === check-in succeeded (`302`); two simultaneous `POST /listings/:id/book` HTTP requests with separate valid sessions & CSRF tokens resolved cleanly to strictly **`[302, 409]`** with exactly 1 persisted reservation.
- **Live Regression Suites (`verify_phase43_live.js`, `verify_phase42_live.js`, `verify_phase3d2_live.js`, `verify_phase3d3_live.js`, `verify_phase3d4_live.js`):** **ALL PASS (`exit 0`)**.
- **Database Cleanup Verification (`check_atlas_counts.js`):** Clean Atlas state verified (`{"listings":1,"users":4,"reviews":0,"bookings":0}`).

### C. Browser Verification Status
- Not executed via live Chrome DevTools in Phase 4.4; HTML templates, CSRF inputs, CSP nonces/no-inline-handler constraints, client JS logic, and complete cookie-backed SSR/redirect/conflict HTTP flows were verified programmatically via `verify_phase44_unit.js` and `verify_phase44_live.js`.

---

## 5. Readiness for Phase 4.5

**Phase 4.4 is complete.** Ready for your review and approval to proceed with **Phase 4.5 (Guest Booking Dashboard, Host Booking Management & Booking Cancellation/Status Lifecycle UI)**.
