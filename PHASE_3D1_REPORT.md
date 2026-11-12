# Wanderlust — Phase 3D.1 Report (Listing Discovery)

**Phase:** Phase 3D.1 — Listing Search, Category Filtering, Price Filtering, Sorting & Pagination  
**Status:** Completed & Verified *(Git checkpoint: `Phase 3D.1 completed`; pre-Phase 3D.1 baseline checkpointed at `1fa6d13`)*

---

## 1. Files Created & Modified

| File | Role & Key Changes |
| :--- | :--- |
| [`utils/listingOptions.js`](file:///e:/Working%20Project/Airbnb/utils/listingOptions.js) *(new)* | Shared zero-dependency discovery constants (`DEFAULT_PAGE = 1`, `DEFAULT_LIMIT = 12`, `MAX_LIMIT = 48`, `MAX_PAGE = 10000`, `MAX_SEARCH_LENGTH = 100`), canonical 10-category allowlist (`LISTING_CATEGORIES`), 4 allowlisted sort specs (`SORT_OPTIONS` with deterministic `_id` tie-breakers), `getDefaultListingQuery()`, and XSS-safe `URLSearchParams`-based `buildListingsUrl()`. |
| [`models/listing.js`](file:///e:/Working%20Project/Airbnb/models/listing.js) | Added backwards-compatible optional `category` enum (`LISTING_CATEGORY_SLUGS`), added query/sort indexes (`{ price: 1, _id: 1 }`, `{ category: 1, _id: -1 }`, `{ category: 1, price: 1, _id: 1 }`), and removed unused `joi` import. |
| [`schema.js`](file:///e:/Working%20Project/Airbnb/schema.js) | Added optional normalized `category` validation inside Joi `listingSchema` (accepts canonical slugs or `""`, preserving compatibility with existing create/update flows). |
| [`middleware/security.js`](file:///e:/Working%20Project/Airbnb/middleware/security.js#L43-L50) | Attached safe `res.locals.listingQuery = getDefaultListingQuery()` in `attachLocals` so `navbar.ejs` renders safely on non-index and error routes. |
| [`services/listingService.js`](file:///e:/Working%20Project/Airbnb/services/listingService.js) | Added `normalizeDiscoveryQuery()`, `buildListingFilter()`, and `searchListings()` enforcing strict scalar query types, search length cap & regex escaping across `title`/`location`/`country`, allowlisted category/sort values, finite non-negative `minPrice <= maxPrice`, bounded `page`/`limit`, and count-before-skip pagination; updated `validateListingPayload`, `createListing`, `updateListing`, and `getListingForEdit` to support optional `category` without altering legacy documents when omitted. |
| [`controllers/listings.js`](file:///e:/Working%20Project/Airbnb/controllers/listings.js#L1-L20) | Updated `index` to delegate `req.query` to `listingService.searchListings`, populate `res.locals.listingQuery`, and pass `filters`, `pagination`, `categories`, `sortOptions`, and `buildListingsUrl`; updated `renderNewForm` to pass `categories`. |
| [`views/include/navbar.ejs`](file:///e:/Working%20Project/Airbnb/views/include/navbar.ejs) | Wired search `<form action="/listings" method="GET">` with `name="q"`, sanitized query prefill, conditional hidden inputs preserving active category/price/sort/limit filters on search submit, fixed `.search-btn:hover` selector, and fixed `<div ...>` markup. |
| [`views/listings/index.ejs`](file:///e:/Working%20Project/Airbnb/views/listings/index.ejs) | Converted category bar into accessible `<a href="...">` links (`All` + 10 corrected labels with active toggle), added responsive GET filter/sort/per-page bar (`q`, `category`, `minPrice`, `maxPrice`, `sort`, `limit`, `Apply Filters`, `Clear Filters`), preserved the GST switch via CSP-nonced JS, added result count + empty-state / out-of-range-page recovery views, applied `.listing-link` to cards, and added Bootstrap pagination preserving all active filters. |
| [`views/listings/new.ejs`](file:///e:/Working%20Project/Airbnb/views/listings/new.ejs#L94-L102) | Added optional `listing[category]` `<select>` control. |
| [`views/listings/edit.ejs`](file:///e:/Working%20Project/Airbnb/views/listings/edit.ejs#L52-L61) | Added `listing[category]` `<select>` control preserving current selection. |
| [`public/css/style.css`](file:///e:/Working%20Project/Airbnb/public/css/style.css#L12-L169) | Moved discovery/filter styles from inline view markup into global CSS, added horizontal mobile scrolling for `#filters`, `.listing-link` underline fix, responsive navbar collapse height, and Wanderlust-themed pagination styles. |

---

## 2. Features & Security Verification

### Search, Filters, Sorting & Pagination Behavior
- **Search (`?q=`):** Case-insensitive escaped `$regex` `$or` match across `title`, `location`, and `country`; whitespace trimmed; empty searches treated cleanly as unfiltered; max length enforced (`100` chars); ReDoS/unclosed regex syntax safely escaped.
- **Categories (`?category=`):** Works with optional `category` on `Listing` (`trending`, `rooms`, `iconic-cities`, `mountains`, `castles`, `amazing-pools`, `camping`, `farms`, `arctic`, `domes`). Uncategorized legacy listings remain visible when unfiltered and never fail `.save()` during edits or review creation. Invalid categories return HTTP `400`.
- **Price Range (`?minPrice=&maxPrice=`):** Empty HTML inputs treated as omitted; strict finite non-negative validation; rejects negatives, `NaN`/`Infinity`, non-numeric strings, duplicate/array keys, and inverted ranges (`minPrice > maxPrice`) with HTTP `400`.
- **Sorting (`?sort=`):** Strictly allowlisted keys: `newest` (`{ _id: -1 }`), `oldest` (`{ _id: 1 }`), `price_asc` (`{ price: 1, _id: 1 }`), `price_desc` (`{ price: -1, _id: -1 }`). Invalid sort keys return HTTP `400`.
- **Pagination (`?page=&limit=`):** Defaults to `page = 1`, `limit = 12` (strict cap `MAX_LIMIT = 48`, `MAX_PAGE = 10000`). Executes `Listing.countDocuments(filter)` first; positive out-of-range pages return clean empty-state recovery UI without running deep MongoDB `.skip()`, while `<= 0`, non-integer, array, or `> MAX_LIMIT` inputs return HTTP `400`.
- **Security Preserved:** Routes stay `GET /listings` (exempt from CSRF per `SAFE_METHODS`), no inline `on*` event attributes added (strict CSP nonce preserved), Express 5 query handling blocks duplicate-key array and object injection, and production `error.ejs` sanitizes `>= 500` errors cleanly.

---

## 3. Test Execution & Results

> **Note:** Unit suites ran inside the sandbox with mocked Mongoose/Cloudinary/Mapbox dependencies where applicable. Live integration suites ran outside the sandbox (`BypassSandbox: true`) against live MongoDB Atlas, Express 5, Cloudinary, and Mapbox after sandbox DNS lookup (`querySrv ETIMEOUT`) confirmed outbound network restriction inside the sandbox.

### A. Static & Unit Suites *(Mocked / Offline)*
1. **`node --check` Syntax Validation:** **PASS (`exit 0`)** across modified/created JS files (`utils/listingOptions.js`, `models/listing.js`, `schema.js`, `middleware/security.js`, `services/listingService.js`, `controllers/listings.js`) and full repo JS files.
2. **`verify_phase3d1_unit.js`:** **PASS (`exit 0`)**
   - Query normalization (`Object.create(null)` Express 5 query compatibility, empty form omission, `"all"`/`minPrice=0`, array/NoSQL/range/sort/page/limit `400` rejections, regex metacharacter escaping).
   - `searchListings` sorting specs across all 4 orders, `.skip`/`.limit` math, out-of-range page skip prevention, and empty results.
   - Backward-compatible `category` validation/persistence in Joi & `listingService` (omitting `category` preserves existing value; `""` clears cleanly; bad category cleans up uploaded Cloudinary image).
   - `buildListingsUrl` query preservation, EJS compilation/rendering across `index.ejs`, `navbar.ejs` (without `listingQuery`), `new.ejs`, `edit.ejs`, and CSP inline-handler audit.
3. **`verify_phase3a_unit.js`, `verify_phase3b_unit.js`, `verify_phase3c5_unit.js`:** **ALL PASS (`exit 0`)**

### B. Live Integration Suites *(Unmocked Express 5 + MongoDB Atlas + Cloudinary + Mapbox)*
1. **`verify_phase3d1_live.js` (isolated port `57583`, Atlas indexes synced via `Listing.syncIndexes()`):** **PASS (`exit 0`)**
   - Title search, location search, country search, case-insensitive matching, empty whitespace search, regex metacharacter search safety.
   - Category filtering (`mountains`, `castles`), UI option preservation, legacy uncategorized visibility, invalid category HTTP `400` rejection.
   - Price filtering (`minPrice`/`maxPrice`), HTML form value preservation, invalid/negative/inverted/duplicate-array HTTP `400` rejections.
   - All 4 sort directions (`newest`, `oldest`, `price_asc`, `price_desc`) verified in rendered HTML card order + invalid sort `400` rejection.
   - Pagination (`limit=2` across pages 1–3), combined filter parameter preservation (`q` + `category` + `minPrice` + `maxPrice` + `sort` + `limit` across page links), positive out-of-range empty page UX (`"No listings on page 9"` + `"Go to Page 1"`), and invalid `page`/`limit` HTTP `400` rejections.
   - Non-index route rendering (`/login`, `400` error page) with updated `navbar.ejs`.
   - Full HTTP CRUD + category selection/update + cross-user delete authorization block + Cloudinary upload/cleanup + Mapbox geocoding regression.
2. **Existing Live Regression Suites (all PASS, `exit 0`):**
   - `verify_phase3c5_live.js` (isolated port `63988`): **PASS**
   - `verify_phase3b_regression_live.js` (`PORT=8088`): **PASS**
   - `verify_phase3c2_live.js` (isolated port `64043`): **PASS**
   - `verify_phase3c3_live.js` (isolated port `53302`): **PASS**

### C. Browser Verification Status & Remaining Limitations
- **Browser DevTools Check (`browser` subagent):** Attempted on an isolated `127.0.0.1:8089` preview server, but host Chrome remote debugging was unavailable (`ENOENT: ... DevToolsActivePort`), so automated Chromium DOM/screenshot inspection could not execute here. All rendered HTML, CSS rules, CSP compliance, interactive query links, and HTTP flows were verified programmatically via SSR live integration tests (`verify_phase3d1_live.js`), and the temporary `8089` server and demo fixtures were cleaned up completely (`remainingListings: 1`).
- **Remaining Domain Limitations (Scoped for Later Sub-Phases):**
  - Existing pre-3D.1 listings in Atlas lack a `category` field until edited or backfilled; they continue to appear in unfiltered/search/price views.
  - Substring search uses escaped case-insensitive `$regex` `$or` queries across `title`, `location`, and `country`; for very large production catalogs (`50k+` listings), MongoDB Atlas Search (`$search`) would provide faster inverted-index text ranking.

---

**Ready for your review and approval to proceed to Phase 3D.2 (Listing Details and Pricing).**
