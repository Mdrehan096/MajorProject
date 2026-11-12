# Wanderlust — Phase 3D.2 Report (Listing Details & Pricing)

**Phase:** Phase 3D.2 — Listing Details, Review Summary, Configurable Tax/GST & Pricing Breakdown  
**Status:** Completed & Verified *(Git checkpoint: `Phase 3D.2 completed`; pre-Phase 3D.2 baseline at `492a975`)*

---

## 1. Files Created & Modified

| File | Role & Key Changes |
| :--- | :--- |
| [`config/env.js`](file:///e:/Working%20Project/Airbnb/config/env.js) | Added `parseTaxRate`, `parsePricingConfig`, and `pricing` block to `readEnv()` supporting `TAX_MODE` (`"indian_gst_slabs"`, `"flat"`, `"none"`), optional `TAX_RATE` (`0..100`), `TAX_LABEL`, and bounded `MAX_STAY_NIGHTS` (`1..365`, default `90`), plus validation in `validateCoreEnv()`. |
| [`utils/pricing.js`](file:///e:/Working%20Project/Airbnb/utils/pricing.js) *(new)* | Pure pricing calculator and query guardrails (`normalizeStayNights`, `resolveTaxConfig`, `resolveTaxRule`, `calculatePriceBreakdown`, `roundCurrency`, `formatINR`, `isValidNonNegativePrice`). Implements verified Indian hotel accommodation GST slabs (`0%` up to ₹1,000/night, `5%` for ₹1,001–₹7,500/night, `18%` above ₹7,500/night per CBIC Notification No. 15/2025-CT(R), effective Sept 22, 2025), flat override, tax-off mode, missing-price fallback, and explicit estimate disclaimers. |
| [`services/listingService.js`](file:///e:/Working%20Project/Airbnb/services/listingService.js) | Added `computeReviewStats()` (`reviewCount`, `ratedCount`, `averageRating`, `formattedAverage`, `hasReviews` with defensive ignoring of malformed ratings) and `resolveCategoryMeta()`. Extended `getListingDetails(id, rawQuery, options)` to return `categoryMeta`, `reviewStats`, `pricing`, and `taxConfig`, keeping `1`-argument calls compatible and preserving `username`-only owner/author projections. Updated `searchListings()` to include `pricingConfig` and `pricingByListingId` for consistent discovery-page tax estimates. |
| [`controllers/listings.js`](file:///e:/Working%20Project/Airbnb/controllers/listings.js#L22-L31) | Updated `showListing` to forward `req.query` (`?nights=`) to `listingService.getListingDetails(req.params.id, req.query)` and render `listings/show.ejs` without introducing business logic into the controller. |
| [`views/listings/show.ejs`](file:///e:/Working%20Project/Airbnb/views/listings/show.ejs) | Rebuilt layout with responsive two-column Bootstrap grid (`col-12 col-lg-7` details + `col-12 col-lg-5` sticky reference pricing breakdown), category badge link, average rating & review count summary, clean `@username`-only host summary, missing-image & missing-price fallback states, empty reviews card, corrected comment validation text, SSR + progressive `?nights=` estimator (no booking/checkout controls), explicit estimated-vs-base pricing labels & disclaimer, and `#mapStatus` preview container. |
| [`views/listings/index.ejs`](file:///e:/Working%20Project/Airbnb/views/listings/index.ejs) | Replaced the legacy hardcoded `+18% GST` string with per-listing tax breakdown notes computed from `pricingByListingId` (matching `0%`, `5%`, `18%`, or configured `TAX_MODE`/`TAX_RATE`), updated toggle label (`Show estimated taxes (GST)`), and handled missing price safely. |
| [`public/js/listingDetails.js`](file:///e:/Working%20Project/Airbnb/public/js/listingDetails.js) *(new)* | CSP-compliant progressive enhancement (no inline `on*` handlers): handles broken hero `<img>` network errors via fallback toggle and updates the stay-duration breakdown live using server-resolved pricing rules (`safeJson` `pricingPreviewData`) with inline client feedback + full SSR `GET ?nights=` fallback. |
| [`public/js/map.js`](file:///e:/Working%20Project/Airbnb/public/js/map.js) | Added XSS-safe (`textContent` / `createElement`) fallback states and Mapbox `"load"`/`"error"` listeners for `#mapStatus` when Mapbox tokens, CDN scripts, or listing coordinates are missing or fail to initialize. |
| [`public/css/style.css`](file:///e:/Working%20Project/Airbnb/public/css/style.css#L191-L265) | Fixed `#map` horizontal mobile overflow by replacing `width: 100vh` with `.map-frame` + `#map { width: 100%; max-width: 100%; }` and responsive height breakpoints, and added styling for `.show-img`, `.show-img-fallback`, `.pricing-card`, `.host-summary-card`, `.detail-badge`, and `.review-card`. |

---

## 2. Configuration & Business Logic Details

### Configurable Tax / GST Rules
- **Default (`TAX_MODE=indian_gst_slabs`):** Applies verified Indian accommodation GST tariff slabs (SAC 996311 per CBIC Notification No. 15/2025-CT(R), effective Sept 22, 2025):
  - `₹0 – ₹1,000 / night`: `0%` GST (Exempt)
  - `₹1,000.01 – ₹7,500 / night`: `5%` GST
  - `> ₹7,500 / night`: `18%` GST
- **Overrides via `.env`:**
  - `TAX_MODE=flat` with `TAX_RATE=<0..100>` and optional `TAX_LABEL="<label>"` applies a flat percentage across all listings (setting `TAX_RATE` alone also selects `flat`).
  - `TAX_MODE=none` disables estimated tax calculation (`0%`).
  - `MAX_STAY_NIGHTS=<1..365>` configures the upper stay-duration estimator bound (default `90`).
- **Clear Estimate Labeling:** Every price breakdown explicitly distinguishes **"Base nightly rate (before taxes)"** from **"Estimated stay total"**, includes the active slab/rate description, and notes that final tax applicability and total depend on host GST registration, booking dates, and platform terms *(no Phase 4 booking/checkout flow added)*.

---

## 3. Verification & Test Results

> **Environment Note:** Unit checks and syntax validation ran inside the sandbox. Live Express 5 + MongoDB Atlas + Cloudinary + Mapbox suites ran with `BypassSandbox: true` after sandboxed attempts encountered the expected `querySrv ETIMEOUT _mongodb._tcp.majorproject.z4iosg5.mongodb.net` outbound DNS restriction.

### A. Static & Unit Suites *(Offline / Mocked)*
1. **`node --check` Syntax Validation:** **PASS (`exit 0`)** on `config/env.js`, `utils/pricing.js`, `services/listingService.js`, `controllers/listings.js`, `public/js/map.js`, and `public/js/listingDetails.js`.
2. **`verify_phase3d2_unit.js`:** **PASS (`exit 0`)**
   - Env pricing config parsing (`indian_gst_slabs` default, implicit/explicit `flat`, `none`, invalid `TAX_MODE`/`TAX_RATE` error paths, `MAX_STAY_NIGHTS` bounds).
   - GST slab boundaries (`0`, `1000`, `1000.01`, `7500`, `7500.01`), multi-night rounding, missing/negative/non-finite price fallbacks, `normalizeStayNights` with Express 5 `null`-prototype queries (`0`, `-2`, `2.5`, `"abc"`, arrays, NoSQL objects, `> MAX_STAY_NIGHTS` rejected with `400`).
   - `computeReviewStats` (`0` reviews, mixed valid ratings, defensive skipping of invalid rating values) & `getListingDetails` 1-arg backwards compatibility and `username`-only projections.
   - EJS template rendering (`show.ejs` fallback & full modes, `index.ejs` accurate GST tax labels), XSS escaping via `safeJson`, zero inline `on*` attributes under strict CSP, CSS overflow regression check (`width: 100vh` removed), and Node VM checks of `public/js/map.js` + `public/js/listingDetails.js`.
3. **Prior Unit Suites (`verify_phase3a_unit.js`, `verify_phase3b_unit.js`, `verify_phase3c5_unit.js`, `verify_phase3d1_unit.js`):** **ALL PASS (`exit 0`)**.

### B. Live Integration Suites *(Unmocked Express 5 + Atlas + Cloudinary + Mapbox)*
1. **`verify_phase3d2_live.js` (isolated ports, incl. secondary process with `TAX_MODE=flat TAX_RATE=12`):** **PASS (`exit 0`)**
   - Live HTTP creation across all 3 GST slabs (`₹900`, `₹2,400`, `₹9,000`), verified `0%` / `5%` / `18%` breakdown & `/listings` tax toggle consistency.
   - Missing image, missing price, and empty review states rendered gracefully with HTTP `200`.
   - Multi-user review submissions updating average rating (`4.5` across `2 reviews`) while verifying host and reviewer `email` addresses never appear in rendered HTML.
   - `?nights=4` SSR total calculation, invalid `?nights=` & invalid ID HTTP `400` rejections, missing listing `302 /listings`, static JS/CSS HTTP `200`, and live `TAX_MODE=flat` env override (`Hospitality Tax (12%)`).
   - Full fixture cleanup verified in Atlas & Cloudinary.
2. **Existing Live Regression Suites (all PASS, `exit 0`):**
   - `verify_phase3d1_live.js`
   - `verify_phase3c5_live.js`
   - `verify_phase3c3_live.js`
   - `verify_phase3c2_live.js`
   - `verify_phase3b_regression_live.js`

---

**Ready for your review and approval to proceed to Phase 3D.3 (User Profile and Dashboard).**

