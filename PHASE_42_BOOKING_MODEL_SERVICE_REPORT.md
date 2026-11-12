# Wanderlust — Phase 4.2 Report (Booking Model & Service)

**Phase:** Phase 4.2 — Booking Model, Validation, Pricing Snapshot, Concurrency-Safe Transactions & Service Layer  
**Status:** Completed & Verified *(Pending User Approval for Phase 4.3)*  
**Baseline:** [`PHASE_41_BOOKING_ARCHITECTURE_REPORT.md`](file:///e:/Working%20Project/Airbnb/PHASE_41_BOOKING_ARCHITECTURE_REPORT.md) *(Pre-Phase 4 baseline at `299b162`)*

---

## 1. Files Created & Modified

| File | Role & Key Changes |
| :--- | :--- |
| [`config/env.js`](file:///e:/Working%20Project/Airbnb/config/env.js#L35-L133) | Added `parsePositiveBoundedInt` and `parseBookingConfig()` (`BOOKING_DEFAULT_MAX_GUESTS` bounded `1..50` default `8`, `BOOKING_TX_MAX_RETRIES` bounded `1..10` default `4`, `currency: "INR"`), exposed under `env.booking` while keeping all existing `pricing` / core checks intact. |
| [`models/listing.js`](file:///e:/Working%20Project/Airbnb/models/listing.js#L19-L38) | Added backward-compatible optional `maxGuests` (whole-number `1..50`, omitted safely on existing records) and internal `bookingVersion` (`default: 0`, `select: false`) for per-listing transaction write-lock serialization. |
| [`models/booking.js`](file:///e:/Working%20Project/Airbnb/models/booking.js) *(new)* | Created `Booking` schema with `Listing`/`User` refs, `bookingReference`, normalized `checkIn`/`checkOut` (`checkOut > checkIn`), integer `guests` (`1..50`), `host !== guest` guard, immutable `pricing` snapshot subdocument, `listingSnapshot`, controlled status enum (`pending`, `confirmed`, `cancelled`, `completed`), lifecycle metadata (`confirmedAt`, `cancelledAt`, `cancelledBy`, `cancellationReason`, `completedAt`, `paymentNotice`), `{ timestamps: true }`, and 4 compound/unique indexes. |
| [`utils/bookingDates.js`](file:///e:/Working%20Project/Airbnb/utils/bookingDates.js) *(new)* | Pure UTC-midnight calendar normalization utilities (`getTodayUtcMidnight`, `parseCalendarDate`, `formatCalendarDate`, `calculateStayNights`, `normalizeStayDates`, `doDateRangesOverlap`) rejecting rollover dates, NoSQL objects, past check-ins, same-day/inverted ranges, and stays exceeding `MAX_STAY_NIGHTS`. |
| [`services/bookingService.js`](file:///e:/Working%20Project/Airbnb/services/bookingService.js) *(new)* | Implemented pure Express-free booking domain service: `calculateBookingPrice`, `checkAvailability`, `getListingBlockedDates`, `createBooking`, `findBookingById`, `getGuestBookings`, `getHostBookings`, `cancelBooking`, and `updateBookingStatus`. |

---

## 2. Implemented Guarantees & Business Logic

1. **Strict Service-Level Input & Tamper Prevention:**
   - Every entry point rejects `null`, arrays, non-plain payloads, invalid ObjectIds, NoSQL query objects, non-calendar strings, fractional/out-of-range guest counts, and unexpected payload keys (`totalPrice`, `nightlyPrice`, `pricing`, `host`, `guest`, `status`, `bookingReference`).
   - Ownership & participant rules enforce missing-listing `404`, own-listing rejection `400`, missing/invalid listing price rejection `400`, listing `maxGuests` capacity cap `400`, and `findBookingById` / `cancelBooking` / `updateBookingStatus` cross-user IDOR blocking `403`.
   - User lookups inside `findBookingById`, `getGuestBookings`, and `getHostBookings` project only non-sensitive fields (`username`, `displayName`, `location`), never exposing `email`, `hash`, or `salt`.
2. **Server-Calculated Pricing Snapshot (`utils/pricing.js` Reuse):**
   - `calculateBookingPrice()` resolves rates server-side from `listing.price`, UTC night count, and `env.pricing` (`indian_gst_slabs` `0%/5%/18%`, `flat`, or `none`) and persists immutable totals into `booking.pricing` alongside `listingSnapshot`. Subsequent listing price updates never alter existing reservations.
3. **Transaction Safety & Double-Booking Prevention:**
   - Mutations run inside `runBookingTransactionWithRetry()` using MongoDB `snapshot` read concern and `majority` write concern, acquiring an exclusive per-listing WiredTiger write lock via `Listing.findOneAndUpdate({ _id: listingId }, { $inc: { bookingVersion: 1 } }, { session, returnDocument: "after" })` **before** running the `[checkIn, checkOut)` conflict query (`ACTIVE_BOOKING_STATUSES = ["pending", "confirmed"]`).
   - Concurrent `TransientTransactionError` / `UnknownTransactionCommitResult` conflicts retry deterministically up to `maxTxRetries`; conflicting stays reject with `409 Conflict`, failed writes roll back cleanly (including `bookingVersion`), and every session closes in `finally`.
4. **Controlled Status Lifecycle:**
   - Reservations initialize as `pending` (`paymentNotice` clarifies payments are disabled).
   - Both `pending` and `confirmed` block `[checkIn, checkOut)` dates; back-to-back check-out/check-in dates (`existing.checkOut === requested.checkIn`) are permitted; `cancelled` and `completed` release future availability immediately and reject further state mutations.

---

## 3. Verification & Test Results

> **Environment Note:** Unit suites and syntax checks ran in the standard sandbox. Live MongoDB Atlas integration & regression suites ran with `BypassSandbox: true` after sandboxed runs timed out contacting Atlas DNS (`querySrv ETIMEOUT _mongodb._tcp.majorproject.z4iosg5.mongodb.net` / Mongoose buffering timeout).

### A. Static & Unit Suites *(Offline / Mocked)*
1. **`node --check` Syntax Validation:** **PASS (`exit 0`)** on `config/env.js`, `models/listing.js`, `models/booking.js`, `utils/bookingDates.js`, and `services/bookingService.js`.
2. **`verify_phase42_unit.js`:** **PASS (`exit 0`)**
   - Architectural isolation (zero Express, Passport, flash, redirect, or `console.log` coupling inside `services/bookingService.js`), `parseBookingConfig`, `Booking` schema indexes/validators, and legacy `Listing` schema backwards compatibility.
   - Calendar rollover/past/inverted/NoSQL date guards, `[checkIn, checkOut)` boundary overlap matrix, server-side pricing calculations & missing-price rejection.
   - Service validation (arrays, null, unexpected `totalPrice`/`status`/`host` tampering, bad IDs, floats), mocked tx commit/abort lifecycle, missing listing (`404`), own-listing (`400`), capacity (`400`), overlap (`409`), `WriteConflict` (`TransientTransactionError`) retry success, and full status transition & cancellation state machine.
3. **All Prior Phase 3 Regression Unit Suites (`verify_phase3a_unit.js`, `verify_phase3b_unit.js`, `verify_phase3c5_unit.js`, `verify_phase3d1_unit.js`, `verify_phase3d2_unit.js`, `verify_phase3d3_unit.js`, `verify_phase3d4_unit.js`):** **ALL PASS (`exit 0`)**.

### B. Live MongoDB Atlas Suites *(Unmocked Atlas 8.0.37 Replica Set)*
1. **`verify_phase42_live.js`:** **PASS (`exit 0`)**
   - Service booking creation against live Atlas, unique `WL-*` reference generation, and non-PII population checks (`email` omitted).
   - **Immutable Pricing Snapshot Integrity:** Raised listing rate from `₹2,000` (5% GST → `₹6,300`) to `₹9,500` (18% GST); existing booking retained `₹2,000` / `₹6,300` while subsequent back-to-back stay (`2027-01-13 → 2027-01-15`) used the updated `₹9,500` / `18%` tariff cleanly.
   - **Real Concurrent Double-Booking Prevention:** Simultaneous `Promise.allSettled` overlapping `createBooking()` calls against Atlas yielded **1 committed** and **1 rejected (`409 Conflict`)**.
   - **Real Atlas Transaction Abort Rollback:** Injected post-write `Booking.prototype.save` failure rolled back both the `Booking` document and `Listing.bookingVersion` increment completely.
   - Verified own-listing & capacity rejection, legacy listing fallback capacity (`8` guests), availability release after cancellation & `completed` transition, cross-user IDOR rejection (`403`), and guest/host booking list queries.
2. **`verify_phase3d2_live.js` (isolated port `60355`):** **PASS (`exit 0`)** — confirmed existing `Listing` / `env.pricing` / review flows remain regression-free.
3. **Database Cleanup Check:** Verified live Atlas collection counts after teardown (`listings: 1, users: 4, reviews: 0, bookings: 0`).

---

**Phase 4.2 is complete.** Ready for your review and approval to proceed with **Phase 4.3 (Availability & Concurrent Double-Booking UI + Integration)** (routes/controllers/confirmation remain intentionally deferred to Phase 4.4 per sequential roadmap).
