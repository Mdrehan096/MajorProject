# Wanderlust — Phase 3D.1 Read-Only Audit & Implementation Plan

**Phase:** Phase 3D.1 — Listing Discovery (Search, Category Filtering, Price Filtering, Sorting, Pagination & Discovery UI)  
**Audit Mode:** Strictly Read-Only (0 source files modified, 0 dependencies installed, 0 schema mutations, 0 implementation performed)  
**Git State Observed:** Latest commit [`32d45df`](file:///e:/Working%20Project/Airbnb) (`Phase 3B route and middleware modularization completed`); Phase 3C.1–3C.5 files (`services/*`, `controllers/*`, `middleware/auth.js`, `PHASE_3C*.md`) and pre-existing `package.json` whitespace edits exist in the working tree.

---

## STEP 1 & STEP 2: Existing Implementation & Gap Analysis

### A. Listing Search
- **Observed Implementation:**
  - **Navbar UI ([`views/include/navbar.ejs`](file:///e:/Working%20Project/Airbnb/views/include/navbar.ejs#L43-L48)):** Contains a visual-only Bootstrap search form (`placeholder="Search destinations"`).
  - **Controller ([`controllers/listings.js`](file:///e:/Working%20Project/Airbnb/controllers/listings.js#L3-L6)):** `index` calls `listingService.getAllListings()` with no arguments; `req.query` is ignored.
  - **Service ([`services/listingService.js`](file:///e:/Working%20Project/Airbnb/services/listingService.js#L177-L179)):** `getAllListings()` executes an unfiltered `Listing.find({})`.
- **Gaps Identified:**
  1. Navbar search `<form>` has **no `action="/listings"` and no `method="GET"`** (submitting on `/login`, `/listings/:id`, or `/listings/new` posts/reloads the current URL instead of `/listings`), and the `<input>` has **no `name` attribute**.
  2. Minor navbar defects: typo `<diV>` (`line 43`) and non-matching `.btn-search:hover` selector (`line 9` vs `.search-btn`).
  3. Because `navbar.ejs` is rendered globally via [`views/layout/boilerplate.ejs`](file:///e:/Working%20Project/Airbnb/views/layout/boilerplate.ejs#L28), any template variable used to prefill the search box must be safely defaulted in [`middleware/security.js`](file:///e:/Working%20Project/Airbnb/middleware/security.js#L42-L48) (`attachLocals`) or guarded via `typeof` so non-index routes (`/login`, `/signup`, `/listings/:id`, error pages) never throw `ReferenceError`.
  4. No backend regex escaping, length cap, or non-string (`Array`/NoSQL object) protection exists yet for query-string search terms.
- **Recommended Search Query Strategy:**
  - Validate `q` as a scalar string (`Array`/object values rejected cleanly), trim whitespace, treat empty `""` as unfiltered, enforce max search length (e.g. `100` chars), escape regex metacharacters (`/[.*+?^${}()|[\]\\]/g`), and match across `title`, `location`, and `country` with case-insensitive `$or`:
    ```js
    const regex = new RegExp(escapeRegex(q), "i");
    filter.$or = [{ title: regex }, { location: regex }, { country: regex }];
    ```
  - **Why escaped `$regex` over `$text` here:** MongoDB `$text` tokenizes whole words (`"beac"` or `"Jaip"` would return zero matches for `"Beachfront Cottage"` or `"Jaipur"` in [`init/data.js`](file:///e:/Working%20Project/Airbnb/init/data.js)). Combining escaped `$or` `$regex` with indexed category/price pre-filters delivers accurate partial matching and identical behavior in both `Listing.countDocuments(filter)` and `Listing.find(filter)`.

---

### B. Category Filtering
- **Observed Implementation:**
  - **Model ([`models/listing.js`](file:///e:/Working%20Project/Airbnb/models/listing.js#L6-L41)):** **No `category` field exists** in `listingSchema`.
  - **Live MongoDB Atlas Metadata Probe *(executed read-only)*:** Collection currently holds `1` document (`withCategory: 0`, `withCreatedAt: 0`, only `_id_` index present).
  - **Seed & Forms ([`init/data.js`](file:///e:/Working%20Project/Airbnb/init/data.js), [`views/listings/new.ejs`](file:///e:/Working%20Project/Airbnb/views/listings/new.ejs), [`views/listings/edit.ejs`](file:///e:/Working%20Project/Airbnb/views/listings/edit.ejs)):** No `category` data or form controls exist.
  - **Joi & Service Allowlisting ([`schema.js`](file:///e:/Working%20Project/Airbnb/schema.js#L3-L10), [`services/listingService.js`](file:///e:/Working%20Project/Airbnb/services/listingService.js#L7-L14)):** Neither allows `category`; passing `category` today is rejected with HTTP `400` (`Unexpected field(s)`).
  - **Index UI ([`views/listings/index.ejs`](file:///e:/Working%20Project/Airbnb/views/listings/index.ejs#L48-L98)):** Displays 10 static, non-interactive `<div>` pills (`Trending`, `Rooms`, `Iconic cities`, `mountains`, `castals`, `Amezing pools`, `Camping`, `farms`, `Artic`, `Domes`) with spelling typos and a stray closing `</i>` (`line 65`).
- **Critical Compatibility Risk & Solution:**
  - [`reviewService.createReview`](file:///e:/Working%20Project/Airbnb/services/reviewService.js#L154) and [`listingService.updateListing`](file:///e:/Working%20Project/Airbnb/services/listingService.js#L311) call `.save()` on existing `Listing` documents. Adding `category: { type: String, required: true }` to `listingSchema` without backfilling or defaulting would break review submission and edits on existing Atlas documents (`ValidationError`) and break existing Phase 3C regression tests that post listings without a category field.
  - **Compatible Design (No separate Category schema/collection):**
    1. Define a fixed allowlist of URL-safe canonical slugs mapped to corrected display labels + Font Awesome icons (`trending`, `rooms`, `iconic-cities`, `mountains`, `castles`, `amazing-pools`, `camping`, `farms`, `arctic`, `domes`).
    2. Add `category` directly onto `listingSchema` as an optional/defaulted `enum` string (no separate schema/collection), keeping omitted/legacy values valid on `.save()`, while supporting `category` selection on `new.ejs` / `edit.ejs` and matching `{ category }` cleanly on `/listings?category=...`.
    3. Leave `category` unfiltered when omitted (so all uncategorized legacy records remain visible in default `/listings` browsing) and reject unknown `?category=` values with an explicit validation error (`ExpressError(400, ...)`).

---

### C. Price Filtering
- **Observed Implementation:** [`models/listing.js`](file:///e:/Working%20Project/Airbnb/models/listing.js#L16) stores `price` as `Number`; [`services/listingService.js`](file:///e:/Working%20Project/Airbnb/services/listingService.js#L100-L120) validates non-negative finite `price` on create/update (`init/data.js` values span `750`–`10000`). No price range query filtering exists.
- **Gaps & Edge Cases to Handle:**
  1. Empty query strings (`?minPrice=&maxPrice=` emitted automatically by HTML `<form method="GET">` inputs left blank) must be treated as omitted, not coerced to `0`.
  2. Reject non-string arrays/objects, negative numbers, `NaN`/`Infinity`, and non-numeric strings (`"abc"`, `"12px"`) using strict numeric parsing.
  3. Reject inverted ranges (`minPrice > maxPrice`) with `ExpressError(400, ...)` before querying MongoDB.
  4. Build database-side range predicate `{ price: { $gte: minPrice, $lte: maxPrice } }` backed by a `{ price: 1, _id: 1 }` index.

---

### D. Sorting
- **Observed Implementation & Critical Timestamp Gap:**
  - `Listing.find({})` applies no `.sort()`.
  - [`models/listing.js`](file:///e:/Working%20Project/Airbnb/models/listing.js) **does not enable `{ timestamps: true }`**, and the Atlas metadata probe confirmed existing records have **`withCreatedAt: 0`**. Sorting purely on `createdAt` would fail to order legacy records consistently unless backfilled.
  - [`init/data.js`](file:///e:/Working%20Project/Airbnb/init/data.js) contains tied prices (e.g., multiple `1200`, `1800`, `4000` listings). Paginating without an `_id` tie-breaker risks duplicate or skipped cards across pages.
- **Recommended Allowlisted Sort Map:**
  - `newest` *(default)* → `{ _id: -1 }` *(uses ObjectId creation timestamp + native `_id_` index; works identically for legacy and new documents)*
  - `oldest` → `{ _id: 1 }`
  - `price_asc` → `{ price: 1, _id: 1 }`
  - `price_desc` → `{ price: -1, _id: -1 }`
  - Unknown/array `?sort=` parameters will be rejected (`ExpressError(400, ...)`), preventing MongoDB sort-key injection.

---

### E. Pagination
- **Observed Implementation:** Unbounded `Listing.find({})` fetches the entire collection on every `GET /listings`.
- **Plan & Strategy:**
  - Defaults & strict caps: `DEFAULT_PAGE = 1`, `DEFAULT_LIMIT = 12` (divides cleanly across the 3-column desktop grid), `MAX_LIMIT = 48` (strict upper bound).
  - Validate `page` and `limit` as base-10 positive integers (`>= 1`); reject `0`, negative numbers, floats, arrays, or non-digits (`ExpressError(400, ...)`), and reject or cap `limit > MAX_LIMIT` cleanly (rejecting invalid `limit <= 0` / non-numeric and clamping or rejecting `limit > MAX_LIMIT` consistently).
  - **Two-step MongoDB strategy:**
    1. `totalCount = await Listing.countDocuments(filter)`
    2. Compute `totalPages = Math.max(1, Math.ceil(totalCount / limit))`, clamp effective skip page (or handle out-of-range page gracefully without scanning arbitrary deep offsets), and run `Listing.find(filter).sort(sortSpec).skip(skip).limit(limit)`.
  - Return pagination metadata (`page`, `limit`, `totalCount`, `totalPages`, `hasPrev`, `hasNext`) alongside listings.

---

### F. UI, Cards, CSS, JavaScript & CSP Compliance
- **Observed Implementation:**
  - [`views/listings/index.ejs`](file:///e:/Working%20Project/Airbnb/views/listings/index.ejs#L8-L46) places `#filters` CSS inline inside the view, lacks active category state, lacks price/sort controls, lacks empty-state / result-count / pagination UI, and sets `<a href="/listings/<%= listing._id %>">` (`line 110`) without a class while [`public/css/style.css`](file:///e:/Working%20Project/Airbnb/public/css/style.css#L82-L84) styles `.listing-line { text-decoration: none; }` (mismatch causes default blue underlines on cards).
  - Grid uses `row-cols-lg-3 row-cols-md-3 row-cols-sm-1` (`line 108`); `row-cols-1 row-cols-md-2 row-cols-lg-3` improves tablet spacing.
  - **CSP Constraint ([`middleware/security.js`](file:///e:/Working%20Project/Airbnb/middleware/security.js#L13-L29)):** `script-src` uses per-request nonces (`'nonce-${cspNonce}'`). Any client-side enhancements (tax switch, optional sort auto-submit, mobile filter controls) **must not** use inline HTML event attributes (`onchange="..."` / `onclick="..."`); use nonced `<script nonce="<%= cspNonce %>">` or external scripts under `public/js/`.

---

## STEP 3: Concise Phase 3D.1 Implementation Plan *(Pending User Approval)*

### 1. Git Baseline Precaution *(Before Code Edits)*
- Confirm with the user whether to checkpoint the currently uncommitted Phase 3C.1–3C.5 work before editing files for Phase 3D.1, while preserving the pre-existing `package.json` formatting state untouched unless instructed otherwise.

### 2. Model & Schema Compatibility Updates
- **[`models/listing.js`](file:///e:/Working%20Project/Airbnb/models/listing.js):**
  - Add optional/enum-validated `category` field matching canonical category slugs (preserving compatibility with uncategorized legacy Atlas docs and existing create/update flows).
  - Add query/sort indexes: `{ price: 1, _id: 1 }`, `{ category: 1, _id: -1 }`, `{ category: 1, price: 1, _id: 1 }`.
  - Remove unused `const { required } = require("joi");` (`line 4`).
- **[`schema.js`](file:///e:/Working%20Project/Airbnb/schema.js):**
  - Allow optional allowlisted `category` inside `listingSchema` (`""` allowed/omitted cleanly for legacy form/API compatibility) and define reusable discovery query constants/validation rules.

### 3. Service Layer (`services/listingService.js`)
- Export canonical discovery metadata (`LISTING_CATEGORIES`, `ALLOWED_SORT_OPTIONS`, `DEFAULT_PAGE`, `DEFAULT_LIMIT`, `MAX_LIMIT`, `MAX_SEARCH_LENGTH`).
- Add `normalizeDiscoveryQuery(rawQuery)` & `searchListings(rawQuery)` (keeping zero-arg `getAllListings()` backward-compatible for any internal callers):
  - Reject array/object injection on `q`, `category`, `minPrice`, `maxPrice`, `sort`, `page`, `limit`.
  - Enforce `q` max length + regex escaping (`$or` on `title`, `location`, `country`).
  - Enforce allowlisted `category`, finite `minPrice <= maxPrice` (`>= 0`), allowlisted `sort` with deterministic `_id` tie-breakers, and integer `page`/`limit` bounds.
  - Execute `countDocuments(filter)` + bounded `.find(filter).sort(sortSpec).skip(skip).limit(limit)`.
  - Return `{ listings, filters, pagination, categories, sortOptions }`.
- Allow `category` (when provided and valid) in `ALLOWED_LISTING_FIELDS` inside `validateListingPayload`, `createListing`, and `updateListing` while keeping existing creates/updates without `category` working seamlessly.

### 4. Middleware, Controller & Routes
- **[`routes/listing.js`](file:///e:/Working%20Project/Airbnb/routes/listing.js#L14-L16):** Keep existing `GET /listings` route unchanged (exempt from CSRF; no route breaks).
- **[`middleware/security.js`](file:///e:/Working%20Project/Airbnb/middleware/security.js#L42-L48):** Initialize safe `res.locals.listingQuery = { q: "" }` fallback in `attachLocals` so `navbar.ejs` renders safely across every route.
- **[`controllers/listings.js`](file:///e:/Working%20Project/Airbnb/controllers/listings.js#L3-L6):** Update `index` to invoke `listingService.searchListings(req.query)`, set `res.locals.listingQuery`, expose a safe `URLSearchParams`-based query-link builder helper to `views/listings/index.ejs`, and pass all discovery/pagination state cleanly. *(On invalid query parameters, service `ExpressError(400, ...)` flows cleanly through `wrapAsync` -> `createErrorHandler` rendering HTTP `400`, consistent with existing listing ID error handling.)*

### 5. EJS Views, CSS & CSP-Compliant JS
- **[`views/include/navbar.ejs`](file:///e:/Working%20Project/Airbnb/views/include/navbar.ejs):** Convert search bar into `<form action="/listings" method="GET">` with `name="q"`, prefilled sanitized `value`, fixed `.search-btn:hover`, and fixed `<div class="navbar-nav ms-auto">`.
- **[`views/listings/index.ejs`](file:///e:/Working%20Project/Airbnb/views/listings/index.ejs) & [`public/css/style.css`](file:///e:/Working%20Project/Airbnb/public/css/style.css):**
  - Upgrade `#filters` into a responsive category strip (`All` + 10 corrected categories as `<a href="/listings?...">` preserving `q`, `minPrice`, `maxPrice`, `sort`, `limit`, resetting `page=1`, with active styling).
  - Add responsive price/sort filter toolbar (`minPrice`, `maxPrice`, `sort` dropdown, hidden `q`/`category`, `Apply Filters`, `Clear Filters`).
  - Add result count header, empty-state panel with reset button, and Bootstrap pagination controls (`Previous`, numbered pages, `Next`) preserving all active filters.
  - Fix `.listing-line` link class on listing cards and move filter/pagination styles into `public/css/style.css`.
  - Keep client JS (tax switch + sort/validation UX) cleanly inside CSP-nonced `<script nonce="<%= cspNonce %>">` without inline handlers.
- **[`views/listings/new.ejs`](file:///e:/Working%20Project/Airbnb/views/listings/new.ejs) & [`views/listings/edit.ejs`](file:///e:/Working%20Project/Airbnb/views/listings/edit.ejs):** Add accessible `listing[category]` `<select>` dropdowns preserving selected value on edit.

### 6. Planned Phase 3D.1 Verification Suite *(After Implementation)*
- `node --check` across all JS files.
- Unit tests (`verify_phase3d1_unit.js`) covering query validation, regex escaping/ReDoS safety, all 4 sorts + tie-breakers, category allowlist, invalid price ranges (`min > max`, negatives, `NaN`, arrays), pagination clamping/limits, and backward-compatible create/edit without `category`.
- Live integration suite (`verify_phase3d1_live.js`) against Express 5 + MongoDB Atlas testing title/location/country search, case-insensitivity, empty search, category filter + invalid category (`400`), price bounds + invalid ranges (`400`), all 4 sort orders, pagination + query parameter preservation + invalid page/limit rejection, empty result UI, plus regression runs (`verify_phase3b_regression_live.js`, `verify_phase3c2_live.js`, `verify_phase3c3_live.js`, `verify_phase3c5_live.js`) and browser verification if applicable.
- Deliver `PHASE_3D1_REPORT.md` and create the `Phase 3D.1 completed` Git checkpoint upon verification.

---

**Ready for your approval** to proceed with **Phase 3D.1 implementation** (and please confirm if you would like a Phase 3C checkpoint commit created prior to starting Phase 3D.1 changes).

