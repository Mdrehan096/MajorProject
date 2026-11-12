# Wanderlust — Phase 4.1 Report (Booking Architecture & Database Design)

**Phase:** Phase 4.1 — Booking Architecture and Database Design  
**Status:** Read-Only Inspection & Design Complete *(Pending User Approval for Phase 4.2)*  
**Compliance Mode:** Strictly Read-Only *(0 source files modified, 0 dependencies installed, 0 models/routes implemented)*  
**Git Baseline:** [`299b162`](file:///e:/Working%20Project/Airbnb) (`Phase 3D.4 completed`)

---

## 1. Current System Inspection Findings

### A. Data Models & Atlas Environment
1. **Live MongoDB Atlas Topology *(verified read-only against active cluster)*:**
   - Server version: **MongoDB `8.0.37`** (`maxWireVersion: 25`, `isWritablePrimary: true`, replica set active, `logicalSessionTimeoutMinutes: 30`).
   - **Multi-document ACID transactions are fully supported** and already proven in [`services/reviewService.js`](file:///e:/Working%20Project/Airbnb/services/reviewService.js#L84-L101) (`runInTransaction()`).
   - Collection sample (`Listing` ID `6af47293e03d7e6515a0a379`): `{ title: "Sweet home", price: 2000, owner: ObjectId(...) }`. No `maxGuests` / capacity or booking fields exist on legacy listing records.
2. **[`models/listing.js`](file:///e:/Working%20Project/Airbnb/models/listing.js#L6-L58):**
   - Stores `title`, `description`, `image { url, filename }`, `price` (`Number`), `location`, `country`, `category` (optional enum), `reviews` (`[ObjectId]`), `owner` (`ObjectId` ref `"User"`), `geometry` (`GeoJSON Point`).
   - Uses a `findOneAndDelete` post-hook to cascade-delete attached reviews.
   - **Gap for Phase 4:** No capacity (`maxGuests`) field exists yet, and listing deletion does not yet guard against active reservations or preserve booking snapshots.
3. **[`models/user.js`](file:///e:/Working%20Project/Airbnb/models/user.js#L6-L37) & [`models/review.js`](file:///e:/Working%20Project/Airbnb/models/review.js#L4-L21):**
   - `User` uses `passport-local-mongoose` (serializing sessions by `username`) with `email`, `displayName`, `bio`, `location`, `{ timestamps: true }`, and salted PBKDF2 `hash`/`salt`.
   - Service boundaries enforce `-hash -salt` projections and explicit DTO formatting so private credentials and emails never leak into public views.

### B. Existing Services, Pricing & Controllers
1. **Layering Convention ([`routes/index.js`](file:///e:/Working%20Project/Airbnb/routes/index.js#L1-L20), [`controllers/listings.js`](file:///e:/Working%20Project/Airbnb/controllers/listings.js#L22-L99), [`controllers/users.js`](file:///e:/Working%20Project/Airbnb/controllers/users.js#L81-L121)):**
   - Strictly follows **Routes → Middleware → Controllers → Services → Models** with zero repository layer.
   - **Guardrail observed from Phase 3C.5/3D.3 tests:** Service modules must contain zero Express/Passport dependencies (`req.flash`, `res.redirect`, `passport`, `console.log`), while controllers must never import `models/*` directly or log raw PII.
2. **Phase 3D.2 Pricing Engine ([`utils/pricing.js`](file:///e:/Working%20Project/Airbnb/utils/pricing.js#L8-L255), [`config/env.js`](file:///e:/Working%20Project/Airbnb/config/env.js#L46-L100)):**
   - Configured via `TAX_MODE` (`indian_gst_slabs` default | `flat` | `none`), `TAX_RATE`, `TAX_LABEL`, and `MAX_STAY_NIGHTS` (bounded `1..365`, default `90`).
   - `calculatePriceBreakdown({ nightlyPrice, nights, taxConfig })` applies Indian accommodation GST slabs (CBIC Notification No. 15/2025-CT(R): `0%` `<= ₹1,000`, `5%` `₹1,001–₹7,500`, `18%` `> ₹7,500`), handles missing/invalid prices (`isPriceAvailable: false`), computes `roundCurrency()`, and exposes `basePrice`, `subtotal`, `taxRatePercent`, `taxAmount`, `taxLabel`, `taxMode`, `taxDescription`, and `estimatedTotal`.
   - **Gap for Phase 4:** Pricing currently computes transient display estimates (`?nights=`). Reservations require immutable server-side calculation and persistence at creation time, plus rejection of listings lacking a valid bookable price (`!isValidNonNegativePrice(listing.price)`).

### C. Existing Security, Auth & View Surfaces
- **Middleware ([`app.js`](file:///e:/Working%20Project/Airbnb/app.js#L35-L67), [`middleware/auth.js`](file:///e:/Working%20Project/Airbnb/middleware/auth.js#L6-L105), [`middleware/csrf.js`](file:///e:/Working%20Project/Airbnb/middleware/csrf.js#L30-L74), [`middleware/security.js`](file:///e:/Working%20Project/Airbnb/middleware/security.js#L5-L50)):**
  - `methodOverride("_method")` runs before `csrfProtection`, allowing HTML forms with `_method=PUT`/`DELETE`/`PATCH` to be protected automatically by global `verifyCsrf` (`req.body._csrf` or `x-csrf-token` header).
  - Helmet-style strict CSP enforces `'nonce-${cspNonce}'` for inline `<script>` tags and forbids inline HTML `on*` event attributes across all views.
  - `isLoggedIn` gates private routes and stores `GET` `redirectUrl` for post-login resumption.
- **View Entry Points ([`views/listings/show.ejs`](file:///e:/Working%20Project/Airbnb/views/listings/show.ejs#L130-L286), [`views/users/dashboard.ejs`](file:///e:/Working%20Project/Airbnb/views/users/dashboard.ejs#L15-L173)):**
  - `show.ejs` already dedicates the right-hand sticky `col-12 col-lg-5` column to the pricing card (`#stayPricingForm`), ready to integrate date/guest booking controls in Phases 4.3–4.4 without breaking existing SSR `?nights=` previews.
  - `dashboard.ejs` already organizes account overview into KPI cards + resource sections, ready to integrate Guest Reservations (Phase 4.5) and Host Reservations (Phase 4.6) while keeping all Phase 3D.3 optional-local fallbacks intact.

---

## 2. Proposed Booking Architecture & Layer Responsibilities

### Layer Map *(Consistent with Phases 3B–3D)*
1. **Models:**
   - **New [`models/booking.js`](file:///e:/Working%20Project/Airbnb/models/booking.js):** Core reservation entity, price snapshot subdocument, audit timestamps, lifecycle status enum, and compound availability/dashboard indexes.
   - **Backward-Compatible Update to [`models/listing.js`](file:///e:/Working%20Project/Airbnb/models/listing.js):**
     - `maxGuests: { type: Number, min: 1, max: 50 }` *(optional so all existing Atlas listings & CRUD suites without `maxGuests` continue saving seamlessly; service applies default platform cap when omitted)*.
     - `bookingVersion: { type: Number, default: 0, select: false }` *(internal concurrency lock field incremented inside transactions to prevent WiredTiger phantom write skew — see §5)*.
2. **Utilities & Config:**
   - [`config/env.js`](file:///e:/Working%20Project/Airbnb/config/env.js): Optional bounded booking settings (`DEFAULT_LISTING_MAX_GUESTS` default `8` / upper cap `50`, `MAX_TX_RETRIES` default `4`, reuse existing `pricing.maxStayNights` and `taxConfig`).
   - [`utils/pricing.js`](file:///e:/Working%20Project/Airbnb/utils/pricing.js): Reuse `calculatePriceBreakdown()`, `resolveTaxConfig()`, and `isValidNonNegativePrice()` directly as the single canonical server-side pricing engine.
   - **New date helper module (e.g. `utils/bookingDates.js`):** Pure UTC-midnight calendar normalization (`YYYY-MM-DD` parsing, day-count calculation, `[checkIn, checkOut)` interval helpers) shared safely by client/server validation rules.
3. **Middleware (`middleware/auth.js`, `middleware/validation.js`):**
   - `validateBooking`: Joi validation in [`schema.js`](file:///e:/Working%20Project/Airbnb/schema.js) (`checkIn`, `checkOut`, `guests` only — stripping `_csrf`, rejecting unknown fields like `price`, `host`, `guest`, `status`).
   - `validateBookingStatus`: Joi validation for host status actions (`status` in allowlisted transition targets).
   - Booking ownership/role authorization guards in service + route middleware (`isBookingParticipant`, `isBookingGuest`, `isBookingHost`).
4. **Services (`services/bookingService.js`, minimal safe hooks in `listingService.js` / `userService.js`):**
   - `calculateBookingPrice()`
   - `checkAvailability()` / `getListingUnavailableRanges()`
   - `createBooking()` *(transactional + `Listing.bookingVersion` write lock + availability recheck)*
   - `findBookingById()` *(strict ObjectId + role-scoped DTO)*
   - `getGuestBookings()` / `getGuestBookingDetails()`
   - `getHostBookings()` / `getHostBookingDetails()`
   - `cancelBooking()` *(guest or host cancellation with transactional guard)*
   - `updateBookingStatus()` *(host transitions: `confirm` / `decline/cancel` / `complete`)*
   - `listingService.deleteListing()` guard *(Phase 4.3/4.5+ safeguard)*: block deletion with `409 Conflict` when active `pending`/`confirmed` upcoming bookings exist for that listing so active guest stays cannot be orphaned.
5. **Controllers (`controllers/bookings.js`) & Routes (`routes/booking.js`):**
   - Clean REST routes mounted in [`routes/index.js`](file:///e:/Working%20Project/Airbnb/routes/index.js) without breaking existing URLs:
     - `GET /listings/:id/availability` *(public, non-PII blocked date intervals for calendar UI)*
     - `GET /listings/:id/book` *(optional preview/redirect or prefilled booking step for authenticated guests)*
     - `POST /listings/:id/book` *(authenticated + CSRF + `validateBooking` → creates booking & redirects to `/bookings/:bookingId/confirmation`)*
     - `GET /bookings/:bookingId/confirmation` *(booking confirmation/receipt page scoped strictly to guest)*
     - `GET /bookings/:bookingId` *(role-scoped booking details page for guest or host)*
     - `POST /bookings/:bookingId/cancel` *(guest/host cancellation via CSRF)*
     - `PATCH /bookings/:bookingId/status` *(host status transition via CSRF + `method-override`)*
     - Guest & host booking views integrated cleanly into `/dashboard` (plus `/host/bookings` or dedicated dashboard tabs/views in Phases 4.5–4.6).

---

## 3. Proposed Booking Mongoose Schema (`models/booking.js`)

### Schema Definition *(Design Specification)*

```js
const bookingSchema = new Schema(
  {
    bookingReference: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      uppercase: true,
    },
    listing: {
      type: Schema.Types.ObjectId,
      ref: "Listing",
      required: true,
    },
    guest: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    host: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    checkIn: {
      type: Date,
      required: true,
    },
    checkOut: {
      type: Date,
      required: true,
      validate: {
        validator(value) {
          return this.checkIn instanceof Date && value instanceof Date && value > this.checkIn;
        },
        message: "Check-out date must be after check-in date.",
      },
    },
    guests: {
      type: Number,
      required: true,
      min: 1,
      max: 50,
      validate: {
        validator: Number.isInteger,
        message: "Guest count must be a whole number.",
      },
    },
    pricing: {
      nightlyPrice: { type: Number, required: true, min: 0 },
      nights: { type: Number, required: true, min: 1, max: 365 },
      subtotal: { type: Number, required: true, min: 0 },
      taxAmount: { type: Number, required: true, min: 0, default: 0 },
      taxRatePercent: { type: Number, required: true, min: 0, max: 100, default: 0 },
      taxLabel: { type: String, required: true, trim: true, default: "Estimated GST" },
      taxMode: {
        type: String,
        required: true,
        enum: ["indian_gst_slabs", "flat", "none"],
      },
      taxDescription: { type: String, trim: true, default: "" },
      totalPrice: { type: Number, required: true, min: 0 },
      currency: { type: String, required: true, enum: ["INR"], default: "INR" },
    },
    listingSnapshot: {
      title: { type: String, required: true, trim: true },
      location: { type: String, trim: true, default: "" },
      country: { type: String, trim: true, default: "" },
      imageUrl: { type: String, trim: true, default: "" },
    },
    status: {
      type: String,
      required: true,
      enum: ["pending", "confirmed", "cancelled", "completed"],
      default: "pending",
    },
    confirmedAt: { type: Date, default: null },
    cancelledAt: { type: Date, default: null },
    cancelledBy: {
      type: String,
      enum: ["guest", "host", "system", null],
      default: null,
    },
    cancellationReason: { type: String, trim: true, maxlength: 300, default: "" },
    completedAt: { type: Date, default: null },
    paymentNotice: {
      type: String,
      trim: true,
      default: "Reservation request only — online payment processing is not enabled.",
    },
  },
  { timestamps: true }
);
```

### Schema Design Justification
1. **`pricing` Immutable Subdocument Snapshot:** Captures exact server-computed `nightlyPrice`, `nights`, `subtotal`, tax configuration/rates (`taxAmount`, `taxRatePercent`, `taxLabel`, `taxMode`, `taxDescription`), `totalPrice`, and `currency: "INR"` at booking time. Subsequent host edits to `listing.price` or changes to `.env` `TAX_MODE`/`TAX_RATE` **cannot retroactively mutate** historical bookings.
2. **`host` Derived Server-Side:** `host` is populated strictly from `listing.owner` inside the database transaction; any `host`, `guest`, `status`, or `pricing` property in client requests is rejected before reaching persistence.
3. **`listingSnapshot` Resilience:** Stores `title`, `location`, `country`, and `imageUrl` at creation so past `cancelled`/`completed` booking histories remain legible even if a host later edits the listing title/image (or removes a listing once no active bookings remain).
4. **`bookingReference`:** Uniquely indexed human-readable reference (e.g., `WL-YYYYMMDD-XXXXXX` generated via `node:crypto` random bytes inside the service) suitable for confirmations and support without exposing database internals, while route URLs continue validating strict 24-char ObjectIds.

---

## 4. Booking Business Rules & Status Lifecycle

### A. Validation & Domain Invariants
1. **Calendar Date Normalization (UTC Midnight):**
   - Inputs are accepted as strict calendar date strings (`YYYY-MM-DD`) and converted unambiguously to `YYYY-MM-DDT00:00:00.000Z`. Storing normalized UTC midnight timestamps prevents daylight-saving or server-timezone shifts from creating false conflicts or off-by-one night totals.
   - **Check-in Not in Past:** `checkIn >= todayUtcMidnight` *(same-day or future check-in permitted; any past calendar day rejected with `400`)*.
   - **Valid Date Range:** `checkOut > checkIn` *(strictly positive duration; same-day check-in/out `checkOut === checkIn` rejected with `400`)*.
   - **Maximum Stay Bound:** `nights = (checkOut - checkIn) / 86_400_000` must satisfy `1 <= nights <= maxStayNights` (from `config/env.js` `MAX_STAY_NIGHTS`, default `90`, max `365`).
2. **Guest Capacity Rules:**
   - `guests` must be a safe positive integer (`Number.isInteger(guests) && guests >= 1`).
   - Effective listing capacity resolves as `listing.maxGuests ?? env.booking.defaultMaxGuests` (default `8`, bounded `1..50`). Exceeding listing capacity fails with `400`.
3. **Ownership, Host & Price Guards:**
   - **Own-Listing Restriction:** `guestId.equals(listing.owner)` is rejected with `400`/`403` (*"Hosts cannot book their own listing."*).
   - **Bookable Listing Check:** Listing must exist (`404` otherwise), must have a valid `owner` (`400` if unowned legacy record), and must have a valid finite non-negative nightly rate via `isValidNonNegativePrice(listing.price)` (`400` if `null`/`undefined`/unpriced).
   - **Zero Client Trust:** `guest` is always `req.user._id`; `host` is always `listing.owner`; `status` on creation is always `"pending"`; `pricing` is always computed server-side from `listing.price`, normalized `nights`, and `env.pricing`.

### B. Availability & Half-Open Interval Rule `[checkIn, checkOut)`
- **Conflict Formula:** Two reservations conflict if and only if:
  ```js
  existing.checkIn < requested.checkOut && existing.checkOut > requested.checkIn
  ```
- **Back-to-Back Stays Permitted:** Existing `[2026-12-10, 2026-12-15)` and requested `[2026-12-15, 2026-12-18)` satisfy `existing.checkOut (Dec 15) > requested.checkIn (Dec 15)` → **`false` (no conflict)**.
- **Inventory-Blocking States:**
  - `ACTIVE_BOOKING_STATUSES = ["pending", "confirmed"]`
  - **Rationale:**
    - `pending` MUST block dates immediately upon creation; otherwise multiple guests requesting the same unconfirmed dates would create overlapping reservations before the host responds.
    - `confirmed` blocks dates for approved reservations.
    - `cancelled` MUST NOT block dates (cancellation immediately releases dates for other guests).
    - `completed` MUST NOT block dates (both excluded from `ACTIVE_BOOKING_STATUSES` and historically elapsed).

### C. Controlled Status Lifecycle & Transitions
Why `pending` as initial status:
- Phase 4.1–4.6 explicitly include `pending` alongside `confirmed` and Phase 4.6 requires hosts to *"Confirm pending reservation"* or *"Reject or cancel reservation"*, without online instant-checkout payments. Starting in `pending` immediately reserves inventory, displays clear *"Pending host confirmation — payment not collected"* status on the Phase 4.4 confirmation page, and enables complete host workflow management in Phase 4.6.

| Current Status | Target Status | Authorized Actor | Guard Conditions & Side Effects |
| :--- | :--- | :--- | :--- |
| *(new)* | `pending` | Authenticated Non-Owner Guest | Server validates dates, capacity, pricing, locks listing, verifies zero `[checkIn, checkOut)` conflict, stores snapshot & `bookingReference`. |
| `pending` | `confirmed` | Listing Owner (`host`) | Sets `confirmedAt = new Date()`. Runs inside transaction verifying host ownership. |
| `pending` | `cancelled` | Booking Guest **or** Listing Host | Sets `cancelledAt = new Date()`, `cancelledBy` (`"guest"`/`"host"`), optional trimmed `cancellationReason`. Immediately releases `[checkIn, checkOut)` dates. |
| `confirmed` | `cancelled` | Booking Guest **or** Listing Host | Allowed before reservation completes (`todayUtc < checkOut`, or configurable cutoff). Sets `cancelledAt` + `cancelledBy`; preserves pricing snapshot; releases future dates. |
| `confirmed` | `completed` | Listing Owner (`host`) *(or future verified trigger)* | Permitted only when stay has concluded (or begun: `todayUtc >= checkOut` / verified rule to prevent premature completion blocking cancellations). Sets `completedAt = new Date()`. **Terminal.** |
| `cancelled` | *(any)* | **Forbidden (`400`/`409`)** | **Terminal state.** Re-opening cancelled bookings is prohibited (prevents bypassing availability/pricing checks); guest must submit a fresh booking. |
| `completed` | *(any)* | **Forbidden (`400`/`409`)** | **Terminal state.** Cannot be cancelled or reverted (`409` / `400`). |

---

## 5. Concurrency & Double-Booking Prevention Design

### A. Why Both Unique Indexes AND Naive Transactions Fail Alone
1. **Why a Unique Index Alone Cannot Prevent Overlapping Ranges:**
   - Standard B-Tree/compound unique indexes (e.g., `{ listing: 1, checkIn: 1, checkOut: 1 }`) only reject *byte-for-byte identical* start+end tuples `[Dec 10, Dec 15)` vs `[Dec 10, Dec 15)`. They allow partial overlaps like `[Dec 10, Dec 15)` vs `[Dec 12, Dec 17)` or contained stays `[Dec 10, Dec 20)` vs `[Dec 13, Dec 14)`, causing silent double bookings.
2. **Why a Naive "Read Conflict Query + Insert" Inside a MongoDB Transaction Still Races (Phantom Write Skew):**
   - In MongoDB WiredTiger transactions, document locks are acquired **only on documents that are updated or deleted**.
   - If two concurrent `createBooking` requests `Tx1` and `Tx2` for the same listing and overlapping dates start simultaneously:
     1. Both `Tx1` and `Tx2` query `Booking.findOne({ listing, status: { $in: ["pending", "confirmed"] }, checkIn: { $lt: reqCheckOut }, checkOut: { $gt: reqCheckIn } }).session(...)` → both read `null` from snapshot!
     2. `Tx1` inserts `Booking(b1)` and commits.
     3. `Tx2` inserts `Booking(b2)` (a distinct `_id`!). Because `Tx1` and `Tx2` did not write to any shared document or collide on any unique index, MongoDB detects **zero `WriteConflict`**, and `Tx2` **also commits**, creating overlapping reservations!

### B. Serialized Parent-Document Lock + Majority Snapshot Transaction *(Recommended Strategy)*
To make double-booking **provably impossible** under arbitrary concurrency while keeping 1 document per booking and zero uncleaned lock-slot artifacts:

1. **Snapshot Transaction Settings:**
   - Start Mongoose session and begin transaction with `{ readConcern: { level: "snapshot" }, writeConcern: { w: "majority" } }`.
2. **Per-Listing Write-Serialization Lock (Executed Inside Transaction BEFORE Conflict Query):**
   - Acquire an exclusive WiredTiger write lock on the target `Listing` document:
     ```js
     const listing = await Listing.findOneAndUpdate(
       { _id: listingId },
       { $inc: { bookingVersion: 1 } },
       { session, new: true }
     );
     ```
   - **How this closes the Phantom Write-Skew window:**
     - Whichever concurrent request (`Tx1`) modifies `listing.bookingVersion` first holds WiredTiger's write lock on that `Listing` document until commit/abort.
     - Any overlapping concurrent request (`Tx2`) whose snapshot pre-dated `Tx1`'s commit and attempts `$inc: { bookingVersion: 1 }` on the same listing receives MongoDB's **`WriteConflict` (`code 112`, label `TransientTransactionError`)** and immediately aborts!
     - When `Tx2` executes its bounded retry on a **new transaction snapshot** after `Tx1` committed, `Tx2`'s snapshot observes `Tx1`'s newly committed `Booking` document, so step 3 deterministically catches the overlap and throws **`ExpressError(409, "Selected dates are no longer available.")`**.
     - Different listings serialize independently on their own `Listing._id` — zero cross-listing contention.
3. **In-Transaction Domain Validation & Conflict Query:**
   - Verify `listing` exists (`404`), guest != owner (`400`), capacity (`guests <= maxGuests`), and compute server pricing from `listing.price`.
   - Query conflicts inside the same `session`:
     ```js
     const conflictingBooking = await Booking.findOne({
       listing: listing._id,
       status: { $in: ["pending", "confirmed"] },
       checkIn: { $lt: normalizedCheckOut },
       checkOut: { $gt: normalizedCheckIn },
     }).session(session);
     ```
   - If `conflictingBooking` exists → abort transaction and throw `ExpressError(409, "This property is already reserved for some or all of the selected dates.")`.
   - Otherwise save `newBooking.save({ session })` and commit.
4. **Bounded Transaction Retry Behavior:**
   - Wrap transaction execution in `runBookingTransactionWithRetry(work, { maxAttempts = 4 })`:
     - Only retry when MongoDB marks the error with `TransientTransactionError` or `UnknownTransactionCommitResult` (e.g., transient `WriteConflict` code `112` on concurrent `$inc: { bookingVersion: 1 }`), using short jittered exponential backoff (`25ms`, `50ms`, `100ms`, capped < `500ms`).
     - **Never** retry deterministic business errors (`ExpressError` 400/403/404/409, Mongoose `ValidationError`, duplicate non-retryable key errors): rethrow immediately after aborting & closing session.
     - Always call `session.endSession()` in `finally`.
   - **Fallback / Future Compatibility Note:** Unlike standalone-only fallback strategies, our Atlas M0/Cluster0 (`MongoDB 8.0.37` replica set) verified full transaction support; if transactions ever become unavailable at runtime (`IllegalOperation` code `20` on a local standalone dev node), the service should fail closed with explicit `503 Service Unavailable` or document explicit non-atomic constraints rather than silently skipping concurrency locks.

### C. Required MongoDB Indexes (`models/booking.js`)
```js
// 1. Hot availability conflict lookup & public listing calendar range queries
bookingSchema.index({ listing: 1, status: 1, checkIn: 1, checkOut: 1 });

// 2. Guest booking dashboard sorted newest-first
bookingSchema.index({ guest: 1, createdAt: -1, _id: -1 });

// 3. Host reservation management filtered by status & sorted newest-first
bookingSchema.index({ host: 1, status: 1, createdAt: -1, _id: -1 });

// 4. Unique human-readable booking reference lookup
bookingSchema.index({ bookingReference: 1 }, { unique: true });
```
- Notice `{ listing: 1, status: 1, checkIn: 1, checkOut: 1 }`: matches equality filters on `listing` and `$in: ["pending", "confirmed"]` followed by range scans on `checkIn` / `checkOut`, preventing full collection scans even as reservation volume grows.

---

## 6. Sub-Phase Implementation Roadmap (4.2 → 4.8)

| Sub-Phase | Target Scope | Primary Deliverables |
| :--- | :--- | :--- |
| **4.2** | Booking Model, Dates Util & Service | [`models/booking.js`](file:///e:/Working%20Project/Airbnb/models/booking.js), `maxGuests` & `bookingVersion` on [`models/listing.js`](file:///e:/Working%20Project/Airbnb/models/listing.js), `utils/bookingDates.js`, `services/bookingService.js`, unit & live Atlas tx tests, `PHASE_42_BOOKING_MODEL_SERVICE_REPORT.md` |
| **4.3** | Concurrency & Availability UI | Concurrent overlap race tests, `GET /listings/:id/availability` (non-PII intervals), `show.ejs` check-in/check-out & guest controls + unavailable-date indicator + live estimate JS, `listingService.deleteListing` active-booking protection, `PHASE_43_AVAILABILITY_REPORT.md` |
| **4.4** | Booking Creation & Confirmation | `schema.js` + `validateBooking` middleware, `controllers/bookings.js`, `routes/booking.js` (`GET/POST /listings/:id/book`, `GET /bookings/:bookingId/confirmation`), confirmation EJS page with unpaid disclaimer, tamper & CSRF tests, `PHASE_44_BOOKING_CREATION_REPORT.md` |
| **4.5** | Guest Booking Dashboard & Cancellation | Guest booking history in `/dashboard`, `GET /bookings/:bookingId` role-scoped details page, atomic guest cancellation (`POST /bookings/:bookingId/cancel`) & timestamp/snapshot preservation tests, `PHASE_45_GUEST_DASHBOARD_REPORT.md` |
| **4.6** | Host Booking Management | Host reservation management panel/page (`GET /dashboard` / `/host/bookings`), host `confirm` / `cancel` / `complete` (`PATCH /bookings/:bookingId/status`), strict host ownership & transition tests, `PHASE_46_HOST_DASHBOARD_REPORT.md` |
| **4.7** | Security & Full Regression + Browser Audit | Full IDOR/CSRF/XSS/NoSQL/mass-assignment/price-tamper security suite, concurrent stress verification, Phases 3A–4.6 regression runs, live Chrome DevTools desktop & mobile verification, `PHASE_47_BOOKING_SECURITY_FINAL_REPORT.md` |
| **4.8** | Final Documentation & Git Checkpoint | `PHASE_4_FINAL_REPORT.md` + final Git checkpoint `"Phase 4 booking system completed"` |

---

**Phase 4.1 Read-Only Audit & Design is complete.** Waiting for your approval to begin **Phase 4.2 (Booking Model and Service)** (including adding backward-compatible optional `maxGuests` and internal `bookingVersion` lock fields onto `models/listing.js`).

