# Wanderlust — Phase 3C.2 Security Verification Report

**Date:** 2026-11-12  
**Inspected Files:** [`services/reviewService.js`](file:///e:/Working%20Project/Airbnb/services/reviewService.js), [`middleware/auth.js`](file:///e:/Working%20Project/Airbnb/middleware/auth.js), [`routes/review.js`](file:///e:/Working%20Project/Airbnb/routes/review.js)  
**Scope:** Verify and enforce parent listing relationship checks before review deletion without modifying unrelated files or starting Phase 3C.3.

---

## 1. Initial Finding (Gap Identified Before Fix)

Inspection of the initial Phase 3C.2 implementation showed two related gaps when handling `DELETE /listings/:id/reviews/:reviewId` or calling `deleteReview(listingId, reviewId)`:

1. **[`middleware/auth.js`](file:///e:/Working%20Project/Airbnb/middleware/auth.js) (`isReviewAuthor`):** Validated that `id` and `reviewId` were valid ObjectIds and verified `review.author.equals(res.locals.currUser._id)`, but ignored whether the listing `id` existed or contained `reviewId` in `listing.reviews`.
2. **[`services/reviewService.js`](file:///e:/Working%20Project/Airbnb/services/reviewService.js) (`deleteReview`):** Validated both ObjectId formats and immediately ran `Review.findByIdAndDelete(reviewId)` followed by `Listing.findByIdAndUpdate(listingId, { $pull: { reviews: reviewId } })`. If a review author submitted their own `reviewId` under a different listing ID, the review document would be deleted while leaving a dangling reference on the true parent listing.
3. **[`routes/review.js`](file:///e:/Working%20Project/Airbnb/routes/review.js#L21-L27):** Route ordering (`isLoggedIn` → `isReviewAuthor` → `wrapAsync(reviewController.destroyReview)` with `mergeParams: true`) was already correct and required no changes.

---

## 2. Targeted Fixes Implemented

### A. Middleware Parent Listing & Membership Guard — [`isReviewAuthor`](file:///e:/Working%20Project/Airbnb/middleware/auth.js#L50-L97)
- Fetches both `Listing.findById(id)` and `Review.findById(reviewId)` in parallel after ObjectId format validation.
- If `!listing`, flashes `"Listing you requested for does not exist"` and redirects to `"/listings"` (consistent with `isOwner`).
- Verifies that `review` exists **and** `listing.reviews` contains `review._id` (`belongsToListing`); otherwise flashes `"Review you requested for does not exist"` and redirects to `` `/listings/${id}` `` without running the controller.
- Preserves authorship verification (`review.author.equals(res.locals.currUser._id)`) and `"you are not the author of this review"` flash redirect.

### B. Service Parent Listing Enforcement — [`deleteReview`](file:///e:/Working%20Project/Airbnb/services/reviewService.js#L58-L85)
- Validates `listingId` and `reviewId` ObjectIds (`400` `"Invalid ID ❌"`).
- Loads the parent listing via [`findListingOrThrow(listingId)`](file:///e:/Working%20Project/Airbnb/services/reviewService.js#L12-L21) (`404` `"Listing Not Found ❌"` if missing).
- Verifies `listing.reviews` includes `reviewId` (`belongsToListing`) **before** calling `Review.findByIdAndDelete` or `Listing.findByIdAndUpdate`; otherwise throws `ExpressError(404, "Review Not Found ❌")` without modifying `Review` or any `Listing`.
- Only when verified does it delete `Review` (`404` if missing) and pull `reviewId` from `listing.reviews`.

*(Unchanged: [`routes/review.js`](file:///e:/Working%20Project/Airbnb/routes/review.js), [`controllers/reviews.js`](file:///e:/Working%20Project/Airbnb/controllers/reviews.js), [`services/listingService.js`](file:///e:/Working%20Project/Airbnb/services/listingService.js), [`controllers/users.js`](file:///e:/Working%20Project/Airbnb/controllers/users.js), models, schemas, and views.)*

---

## 3. Code Path & Verification Evidence

### Enforcement Flow for `DELETE /listings/:id/reviews/:reviewId`
1. `csrfProtection` verifies `_csrf` token (`403` on missing/invalid).
2. `isLoggedIn` ensures an authenticated user (`302` → `/login`).
3. [`isReviewAuthor`](file:///e:/Working%20Project/Airbnb/middleware/auth.js#L50-L97) validates `:id` and `:reviewId`, loads parent `Listing` and `Review`, verifies `listing` exists (`302` → `/listings` if not), verifies `reviewId` belongs to `listing.reviews` (`302` → `` `/listings/${id}` `` with `"Review you requested for does not exist"` if mismatched), and verifies `review.author` matches `currUser._id`.
4. [`destroyReview`](file:///e:/Working%20Project/Airbnb/controllers/reviews.js#L12-L17) delegates to [`reviewService.deleteReview(id, reviewId)`](file:///e:/Working%20Project/Airbnb/services/reviewService.js#L58-L85), which independently enforces parent listing existence and `listing.reviews` membership before deleting the review or pulling references.

### Executed Tests (All Re-run After Edits)

#### 1. Static Syntax Check
- `node --check` across all workspace `.js` files (excluding `node_modules`/`.git`): **PASS (`exit 0`)**.

#### 2. Isolated / Mocked Unit Tests *(offline sandbox)*
- `verify_phase3a_unit.js`: **PASS (`exit 0`)**.
- `verify_phase3b_unit.js`: **PASS (`exit 0`)**.
- `verify_phase3c1_unit.js`: **PASS (`exit 0`)**.
- `verify_phase3c2_unit.js`: **PASS (`exit 0`)** — mocked Mongoose & Express checks confirmed:
  - `reviewService.deleteReview` rejects missing parent listing (`404`) and mismatched parent listing (`404`) without invoking `Review.findByIdAndDelete` or `Listing.findByIdAndUpdate`.
  - `middleware/auth.js` `isReviewAuthor` blocks a review author deleting their own review via an incorrect listing URL (`"Review you requested for does not exist"` → `/listings/:wrongId`) and blocks missing-listing URLs (`"Listing you requested for does not exist"` → `/listings`), while allowing valid author deletion on the true parent listing.

#### 3. Live Integration Tests *(unmocked against Express 5, MongoDB Atlas, Cloudinary, Mapbox; executed outside sandbox because standard sandbox blocks Atlas SRV DNS with `querySrv ETIMEOUT`)*
- `verify_phase3c2_security_live.js` (isolated port `63558`): **PASS (`exit 0`)**
  - Created two real listings (`Listing A`, `Listing B`) under `User A`, and `Review 1` attached to `Listing A` under `User B`.
  - **Incorrect listing URL #1 (`User B` → `DELETE /listings/<Listing B>/reviews/<Review 1>`):** Returned `302` → `/listings/<Listing B>` with flash `"Review you requested for does not exist"`. Confirmed `Review 1` still exists in Atlas, `Listing A.reviews` still equals `[Review 1._id]`, and `Listing B.reviews` remains `[]`.
  - **Incorrect listing URL #2 (`User B` → `DELETE /listings/000000000000000000000000/reviews/<Review 1>`):** Returned `302` → `"/listings"` (`"Listing you requested for does not exist"`). Confirmed `Review 1` and `Listing A.reviews` remain untouched.
  - **Direct service check (`reviewService.deleteReview(listingB._id, review1._id)` against Atlas):** Rejected with `ExpressError(404, "Review Not Found ❌")`; confirmed `Review 1` and both listings' `reviews` arrays remained untouched.
  - **Cross-user check (`User A` → `DELETE /listings/<Listing A>/reviews/<Review 1>`):** Returned `302` → `/listings/<Listing A>` with `"you are not the author of this review"`; `Review 1` stayed intact.
  - **Correct listing URL (`User B` → `DELETE /listings/<Listing A>/reviews/<Review 1>`):** Returned `302` → `/listings/<Listing A>` with `" Review Deleted"`; `Review 1` removed from `reviews` (`null`), pulled from `Listing A.reviews` (`[]`), and `Listing B.reviews` unaffected (`[]`).
- `verify_phase3c2_live.js` (isolated port `63605`): **PASS (`exit 0`)** — re-verified full review lifecycle, CSRF, Joi validation, cross-user blocks, listing cascade delete, Cloudinary cleanup, and log sanitization.

---

## 4. Scope Confirmation

- Modified only [`middleware/auth.js`](file:///e:/Working%20Project/Airbnb/middleware/auth.js) and [`services/reviewService.js`](file:///e:/Working%20Project/Airbnb/services/reviewService.js), plus this verification report ([`PHASE_3C2_SECURITY_VERIFICATION.md`](file:///e:/Working%20Project/Airbnb/PHASE_3C2_SECURITY_VERIFICATION.md)).
- Existing routes, flash messages, authorization rules, Phase 3C.1 files, `package.json`, and user controller remain intact; **Phase 3C.3 was NOT started**.

