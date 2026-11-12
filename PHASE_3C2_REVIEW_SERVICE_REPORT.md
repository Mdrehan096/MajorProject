# Wanderlust — Phase 3C.2 Review Service Layer Extraction Report

**Date:** 2026-11-12  
**Baseline State Confirmed:** Git commit `32d45df` (`Phase 3B route and middleware modularization completed`) with Phase 3C.1 (`controllers/listings.js`, `services/listingService.js`, `PHASE_3C1_LISTING_SERVICE_REPORT.md`) and pre-existing whitespace formatting in `package.json` preserved untouched.  
**Scope:** Phase 3C.2 ONLY — extract review business logic and Mongoose operations from [`controllers/reviews.js`](file:///e:/Working%20Project/Airbnb/controllers/reviews.js) into [`services/reviewService.js`](file:///e:/Working%20Project/Airbnb/services/reviewService.js).

---

## 1. Architecture & Responsibilities

### Architecture Preserved
`Routes → Middleware → Controllers → Services → Models`

### Before Phase 3C.2
- [`controllers/reviews.js`](file:///e:/Working%20Project/Airbnb/controllers/reviews.js) directly imported `Listing`, `Review`, `mongoose`, and `ExpressError`, handling ObjectId checks, listing lookups, review document instantiation/author assignment, `listing.reviews.push(...)`, dual saves, `$pull` reference cleanup, and `Review.findByIdAndDelete(...)`.

### After Phase 3C.2
- **Routes ([`routes/review.js`](file:///e:/Working%20Project/Airbnb/routes/review.js)):** Unchanged URLs (`mergeParams: true`), HTTP verbs (`POST /listings/:id/reviews`, `DELETE /listings/:id/reviews/:reviewId`), `isLoggedIn`, `validateReview`, `isReviewAuthor`, and `wrapAsync`.
- **Controller ([`controllers/reviews.js`](file:///e:/Working%20Project/Airbnb/controllers/reviews.js)):** Purely HTTP responsibilities — reads `req.params`, `req.body?.review`, and `req.user?._id`, calls [`services/reviewService.js`](file:///e:/Working%20Project/Airbnb/services/reviewService.js), sets flash messages (`"new Review Created"` / `" Review Deleted"`), redirects to `` `/listings/${id}` ``, and allows async errors to pass through `wrapAsync` to `next()`.
- **Service ([`services/reviewService.js`](file:///e:/Working%20Project/Airbnb/services/reviewService.js)):** Owns ObjectId validation, parent listing lookup/validation, field allowlisting, `Review` persistence + `listing.reviews` relationship sync (with rollback cleanup if `listing.save()` fails), and review deletion + `$pull` cleanup (without modifying [`services/listingService.js`](file:///e:/Working%20Project/Airbnb/services/listingService.js) or adding a repository layer).

---

## 2. Files Created and Modified

### Created
- [`services/reviewService.js`](file:///e:/Working%20Project/Airbnb/services/reviewService.js) — dedicated review service layer.
- [`PHASE_3C2_REVIEW_SERVICE_REPORT.md`](file:///e:/Working%20Project/Airbnb/PHASE_3C2_REVIEW_SERVICE_REPORT.md) — Phase 3C.2 verification and architecture report.

### Modified
- [`controllers/reviews.js`](file:///e:/Working%20Project/Airbnb/controllers/reviews.js) — removed all direct Mongoose, `Listing`, `Review`, and `ExpressError` imports/operations; delegates to [`services/reviewService.js`](file:///e:/Working%20Project/Airbnb/services/reviewService.js).

### Preserved Untouched
- [`services/listingService.js`](file:///e:/Working%20Project/Airbnb/services/listingService.js), [`controllers/listings.js`](file:///e:/Working%20Project/Airbnb/controllers/listings.js), [`controllers/users.js`](file:///e:/Working%20Project/Airbnb/controllers/users.js), [`package.json`](file:///e:/Working%20Project/Airbnb/package.json), `models/*`, [`schema.js`](file:///e:/Working%20Project/Airbnb/schema.js), `routes/*`, `middleware/*`, `config/*`, `utils/*`, `views/*`, `public/*`, [`app.js`](file:///e:/Working%20Project/Airbnb/app.js), and [`server.js`](file:///e:/Working%20Project/Airbnb/server.js).

---

## 3. Service API Reference ([`services/reviewService.js`](file:///e:/Working%20Project/Airbnb/services/reviewService.js))

| Function | Signature | Behavior & Return / Error Contract |
| :--- | :--- | :--- |
| [`validateObjectId`](file:///e:/Working%20Project/Airbnb/services/reviewService.js#L6-L10) | `(id)` | Checks `mongoose.Types.ObjectId.isValid(id)`; throws `ExpressError(400, "Invalid ID ❌")` on invalid IDs. |
| [`findListingOrThrow`](file:///e:/Working%20Project/Airbnb/services/reviewService.js#L12-L21) | `(listingId)` | Validates `listingId` (`400`) and queries `Listing.findById(listingId)`; throws `ExpressError(404, "Listing Not Found ❌")` if missing; returns listing document. |
| [`createReview`](file:///e:/Working%20Project/Airbnb/services/reviewService.js#L23-L56) | `(listingId, reviewData, { authorId })` | Validates `listingId` (`400`), `reviewData` object (`400`), and `authorId` (`400`); finds parent listing (`404` if missing); allowlists `{ rating, comment }` and sets `author: authorId`; pushes `newReview` into `listing.reviews`, saves `Review` and `Listing` (cleaning up `newReview` via `Review.findByIdAndDelete` if `listing.save()` fails); returns `newReview`. |
| [`deleteReview`](file:///e:/Working%20Project/Airbnb/services/reviewService.js#L58-L72) | `(listingId, reviewId)` | Validates both `listingId` and `reviewId` (`400` `"Invalid ID ❌"`); deletes review via `Review.findByIdAndDelete(reviewId)` throwing `ExpressError(404, "Review Not Found ❌")` if missing; pulls `reviewId` from `listing.reviews` via `Listing.findByIdAndUpdate`; returns `deletedReview`. |

---

## 4. Refactored Controller Summary ([`controllers/reviews.js`](file:///e:/Working%20Project/Airbnb/controllers/reviews.js#L1-L17))

- [`createReview`](file:///e:/Working%20Project/Airbnb/controllers/reviews.js#L3-L10) — passes `req.params.id`, `req.body?.review`, and `{ authorId: req.user?._id }` to [`reviewService.createReview`](file:///e:/Working%20Project/Airbnb/services/reviewService.js#L23-L56); flashes `"new Review Created"` and redirects to `` `/listings/${id}` ``.
- [`destroyReview`](file:///e:/Working%20Project/Airbnb/controllers/reviews.js#L12-L17) — passes `req.params.id` and `req.params.reviewId` to [`reviewService.deleteReview`](file:///e:/Working%20Project/Airbnb/services/reviewService.js#L58-L72); flashes `" Review Deleted"` and redirects to `` `/listings/${id}` ``.

### Preserved Relationships, Validation & Cascade Behavior
- Listing → Review references (`listing.reviews` array + `review.author` ObjectId) and per-document `createdAt` default remain unchanged.
- Existing Mongoose `findOneAndDelete` post-hook on [`models/listing.js`](file:///e:/Working%20Project/Airbnb/models/listing.js#L43-L47) (`Review.deleteMany({ _id: { $in: listing.reviews } })`) continues to cascade-delete attached reviews when a listing is removed.
- HTTP authentication (`isLoggedIn`), CSRF checks (`verifyCsrf`/`csrfProtection`), Joi review validation (`validateReview`), and review authorship guard (`isReviewAuthor`) continue to protect all review endpoints.

---

## 5. Verification Results

### 1. Static Syntax Check
- Executed `node --check` across every `.js` file in the workspace (excluding `node_modules`/`.git`): **PASS (`exit 0`)**.

### 2. Isolated Unit Tests *(offline sandbox; mocked Mongoose model methods where noted)*
- `verify_phase3a_unit.js`: **PASS (`exit 0`)** — config, `app.js` import safety (`MemoryStore` stub), `show.ejs` & `map.js`.
- `verify_phase3b_unit.js`: **PASS (`exit 0`)** — modular `middleware/*`, `routes/index.js`, CSRF, validation, security headers, prod error masking.
- `verify_phase3c1_unit.js`: **PASS (`exit 0`)** — listing service & controller tests (mocked Mongoose/Mapbox/Cloudinary stubs).
- `verify_phase3c2_unit.js`: **PASS (`exit 0`)** — verified [`controllers/reviews.js`](file:///e:/Working%20Project/Airbnb/controllers/reviews.js) boundary (zero direct `Listing`/`Review`/`mongoose`/`ExpressError` imports), absence of `services/userService.js`, and all [`reviewService`](file:///e:/Working%20Project/Airbnb/services/reviewService.js) + controller behaviors with mocked Mongoose/service stubs:
  - `validateObjectId`, `findListingOrThrow` (`400` / `404`).
  - `createReview` invalid/missing input checks, allowlisting against spoofed `author`, `listing.reviews` push & dual saves, and orphaned-review rollback when `listing.save()` rejects.
  - `deleteReview` `400` invalid IDs, `404` missing review without mutating `Listing`, and `Review.findByIdAndDelete` + `$pull` cleanup.
  - Controller HTTP delegation, exact flash messages, redirects, and async error propagation.

### 3. Live Integration Tests *(unmocked against Express 5, MongoDB Atlas, Cloudinary, Mapbox)*
- `verify_phase3c2_live.js` spawned `node server.js` on dynamically allocated isolated port `55274` (leaving existing processes/ports undisturbed; standard sandbox blocked Atlas SRV DNS with `querySrv ETIMEOUT`, so executed outside sandbox): **PASS (`exit 0`)**
  - Confirmed Express 5 startup and MongoDB Atlas connection (`Connected to DB`, `Server running on port 55274`).
  - Verified listing creation with Cloudinary upload remains unaffected.
  - Verified review CSRF enforcement (`403` without valid CSRF token), Joi validation (`400` for out-of-range rating `9` and blank comment), invalid listing ID (`400` `"Invalid ID"`), and missing listing (`404` `"Listing Not Found"`).
  - Verified valid review creation by authenticated non-owner (`User B`), MongoDB `reviews` & `listing.reviews` persistence, author ObjectId binding, `createdAt` timestamp, flash rendering, and absence of PII (`email`) in HTML.
  - Verified cross-user review deletion blocked (`User A` blocked from deleting `User B`'s review; review remained intact), invalid review ID (`400`), missing review ID (`302`), and authorized deletion by `User B` deleting from `reviews` and pulling from `listing.reviews`.
  - Verified deleting the listing as `User A` cascade-deleted an attached review from MongoDB and cleaned up the Cloudinary asset (`cloudinaryExists === false`), with zero emails/passwords in server stdout/stderr logs.

---

## 6. Regressions & Scope Confirmation

- **Behavioral Regressions Found:** **None** across static, unit, and live integration suites.
- **Explicit Scope Confirmation:**
  - **Phase 3C.3 (user service extraction) was NOT started:** `services/userService.js` does not exist and [`controllers/users.js`](file:///e:/Working%20Project/Airbnb/controllers/users.js) was not modified.
  - [`services/listingService.js`](file:///e:/Working%20Project/Airbnb/services/listingService.js) was not modified.
  - No dependencies, schema edits, route changes, frontend edits, or repository layer were introduced, and existing `package.json` & Phase 3C.1 files were preserved intact.

