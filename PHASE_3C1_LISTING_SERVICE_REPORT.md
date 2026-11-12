# Wanderlust — Phase 3C.1 Listing Service Layer Extraction Report

**Date:** 2026-11-11  
**Baseline Checkpoint Commit:** `32d45df` (`Phase 3B route and middleware modularization completed`)  
**Scope:** Phase 3C.1 ONLY — extract listing business logic, Mongoose queries, Mapbox geocoding workflow, and Cloudinary cleanup coordination from [`controllers/listings.js`](file:///e:/Working%20Project/Airbnb/controllers/listings.js) into [`services/listingService.js`](file:///e:/Working%20Project/Airbnb/services/listingService.js).

---

## 1. Original vs. New Architecture & Responsibilities

### Before Phase 3C.1
- [`controllers/listings.js`](file:///e:/Working%20Project/Airbnb/controllers/listings.js) directly imported `Listing`, `mongoose`, `ExpressError`, `config/mapbox.js`, and `utils/cloudinaryCleanup.js`, combining HTTP handling with ObjectId validation, Mongoose populate/write/delete operations, mass-assignment filtering, Mapbox geocoding, edit thumbnail URL transformation, and Cloudinary rollback/replacement cleanup.

### After Phase 3C.1 (`Routes → Middleware → Controller → Service → Model / External integration`)
- **Routes ([`routes/listing.js`](file:///e:/Working%20Project/Airbnb/routes/listing.js)):** Unchanged URLs, HTTP verbs, and middleware chains.
- **Middleware (`middleware/*`):** Preserved authentication, ownership, upload, CSRF, Joi validation, rate limiting, security headers, and global error handling.
- **Controller ([`controllers/listings.js`](file:///e:/Working%20Project/Airbnb/controllers/listings.js)):** HTTP-only orchestration — extracts route params/request payload/user/file, delegates to [`services/listingService.js`](file:///e:/Working%20Project/Airbnb/services/listingService.js), tracks `req.fileCommitted` / `req.fileCleanedUp` flags for Express error-middleware coordination, triggers flash messages, renders EJS templates, and sends redirects.
- **Service ([`services/listingService.js`](file:///e:/Working%20Project/Airbnb/services/listingService.js)):** Owns listing ObjectId checks, Mongoose CRUD/populate queries, allowlisted field mapping, Mapbox geocoding on creation, `mapListing` / `originalImageUrl` view data preparation, and Cloudinary uncommitted/replacement/delete cleanup coordination (reusing [`config/mapbox.js`](file:///e:/Working%20Project/Airbnb/config/mapbox.js) and [`utils/cloudinaryCleanup.js`](file:///e:/Working%20Project/Airbnb/utils/cloudinaryCleanup.js) without duplication or an extra repository layer).

---

## 2. Files Created and Modified

### Git Checkpoint Created First
- Staged strictly the verified Phase 3B files and committed `[main 32d45df] Phase 3B route and middleware modularization completed` prior to Phase 3C.1 edits (no unrelated user changes were present).

### Created
- [`services/listingService.js`](file:///e:/Working%20Project/Airbnb/services/listingService.js) — dedicated listing service layer.
- [`PHASE_3C1_LISTING_SERVICE_REPORT.md`](file:///e:/Working%20Project/Airbnb/PHASE_3C1_LISTING_SERVICE_REPORT.md) — Phase 3C.1 architectural & verification report.

### Modified
- [`controllers/listings.js`](file:///e:/Working%20Project/Airbnb/controllers/listings.js) — removed all direct Mongoose, `mongoose.Types.ObjectId`, Mapbox, and Cloudinary cleanup imports/logic; delegates all listing operations to [`services/listingService.js`](file:///e:/Working%20Project/Airbnb/services/listingService.js) (`39` insertions / `130` deletions).

### Unchanged
- [`controllers/reviews.js`](file:///e:/Working%20Project/Airbnb/controllers/reviews.js), [`controllers/users.js`](file:///e:/Working%20Project/Airbnb/controllers/users.js), `models/*`, [`schema.js`](file:///e:/Working%20Project/Airbnb/schema.js), `routes/*`, `middleware/*`, `config/*`, `utils/*`, `views/*`, `public/*`, [`app.js`](file:///e:/Working%20Project/Airbnb/app.js), [`server.js`](file:///e:/Working%20Project/Airbnb/server.js), and [`package.json`](file:///e:/Working%20Project/Airbnb/package.json).

---

## 3. Service API & Method Reference ([`services/listingService.js`](file:///e:/Working%20Project/Airbnb/services/listingService.js))

| Function / Helper | Signature & Inputs | Behavior & Return / Error Contract |
| :--- | :--- | :--- |
| [`validateListingId`](file:///e:/Working%20Project/Airbnb/services/listingService.js#L7-L11) | `(id)` | Checks `mongoose.Types.ObjectId.isValid(id)`; throws `ExpressError(400, "Invalid ID ❌")` on invalid IDs. |
| [`buildMapListing`](file:///e:/Working%20Project/Airbnb/services/listingService.js#L40-L56) | `(listing)` | Builds minimal safe Mapbox client projection `{ title, geometry: { type, coordinates } \| null }`. |
| [`buildOriginalImageUrl`](file:///e:/Working%20Project/Airbnb/services/listingService.js#L58-L64) | `(image)` | Transforms Cloudinary upload URL (`"/upload"` → `"/upload/w_250"`), returning `""` when empty. |
| [`getAllListings`](file:///e:/Working%20Project/Airbnb/services/listingService.js#L66-L68) | `()` | Executes `Listing.find({})` and returns all listing documents. |
| [`getListingById`](file:///e:/Working%20Project/Airbnb/services/listingService.js#L70-L82) | `(id)` | Validates ObjectId; fetches listing populating `reviews.author` (`username`) and `owner` (`username`); returns doc or `null`. |
| [`getListingDetails`](file:///e:/Working%20Project/Airbnb/services/listingService.js#L84-L95) | `(id)` | Calls `getListingById(id)`; returns `null` if missing, or `{ listing, mapListing, mapToken }`. |
| [`getListingForEdit`](file:///e:/Working%20Project/Airbnb/services/listingService.js#L97-L109) | `(id)` | Validates ObjectId; fetches unpopulated listing; returns `null` if missing, or `{ listing, originalImageUrl }`. |
| [`createListing`](file:///e:/Working%20Project/Airbnb/services/listingService.js#L111-L151) | `(listingData, { ownerId, file })` | Requires `file` (`400` `"Listing image is required"`) and `ownerId`; allowlists `{ title, description, price, country, location }`; geocodes location via [`geocodeLocation`](file:///e:/Working%20Project/Airbnb/config/mapbox.js#L18-L32); saves `Listing`; cleans up uncommitted Cloudinary asset on any failure; returns saved doc. |
| [`updateListing`](file:///e:/Working%20Project/Airbnb/services/listingService.js#L153-L206) | `(id, listingData, { file })` | Validates ID (`400`); cleans up uncommitted `file` and returns `null` if listing missing; updates allowlisted fields while preserving existing `geometry` (no re-geocode on edit); swaps `image` only if `file` provided; saves before destroying `previousImage` via `safeDestroyCloudinaryImage(..., { excludeListingId })`; rolls back newly uploaded `file` if DB save fails while keeping `previousImage` untouched. |
| [`deleteListing`](file:///e:/Working%20Project/Airbnb/services/listingService.js#L208-L221) | `(id)` | Validates ID (`400`); deletes via `Listing.findByIdAndDelete(id)` (triggering Mongoose `findOneAndDelete` cascade deletion of attached reviews); throws `ExpressError(404, "Listing Not Found ❌")` if missing; cleans up Cloudinary asset via `safeDestroyCloudinaryImage` with `excludeListingId`. |

---

## 4. Controller Refactoring & Upload Cleanup Strategy

### Refactored Handlers ([`controllers/listings.js`](file:///e:/Working%20Project/Airbnb/controllers/listings.js#L1-L87))
- [`index`](file:///e:/Working%20Project/Airbnb/controllers/listings.js#L3-L6) → calls `listingService.getAllListings()`, renders `listings/index.ejs`.
- [`renderNewForm`](file:///e:/Working%20Project/Airbnb/controllers/listings.js#L8-L10) → renders `listings/new.ejs`.
- [`showListing`](file:///e:/Working%20Project/Airbnb/controllers/listings.js#L12-L20) → calls `listingService.getListingDetails(id)`; flashes `"Listing you requested for does not exist"` + redirects `"/listings"` when `null`; renders `listings/show.ejs`.
- [`createListing`](file:///e:/Working%20Project/Airbnb/controllers/listings.js#L22-L40) → calls `listingService.createListing(...)`; sets `req.fileCommitted = true` on success or `req.fileCleanedUp = true` on error before rethrowing; flashes `"new Listing created"` + redirects `"/listings"`.
- [`renderEditForm`](file:///e:/Working%20Project/Airbnb/controllers/listings.js#L42-L50) → calls `listingService.getListingForEdit(id)`; flashes + redirects `"/listings"` when `null`; renders `listings/edit.ejs`.
- [`updateListing`](file:///e:/Working%20Project/Airbnb/controllers/listings.js#L52-L81) → calls `listingService.updateListing(...)`; handles `null` (marks `req.fileCleanedUp = true`, flashes, redirects `"/listings"`) and failure rollback flag (`req.fileCleanedUp = true`); sets `req.fileCommitted = true` on commit, flashes `"Listing updated"`, redirects `/listings/${id}`.
- [`destroyListing`](file:///e:/Working%20Project/Airbnb/controllers/listings.js#L83-L87) → calls `listingService.deleteListing(id)`, flashes `"Listing Deleted"`, redirects `"/listings"`.

### Rollback & Error-Handling Guarantees
- Because [`services/listingService.js`](file:///e:/Working%20Project/Airbnb/services/listingService.js#L29-L38) cleans up uncommitted uploads inside its own `try/catch` blocks, standalone callers and direct service tests never orphan Cloudinary images.
- Because [`controllers/listings.js`](file:///e:/Working%20Project/Airbnb/controllers/listings.js#L31-L36) sets `req.fileCleanedUp = true` when service rollback already ran, [`createErrorHandler`](file:///e:/Working%20Project/Airbnb/middleware/error.js#L8-L27)'s `cleanupFileIfUncommitted(req)` does not issue redundant `cloudinary.uploader.destroy` calls.
- Because [`updateListing`](file:///e:/Working%20Project/Airbnb/services/listingService.js#L186-L197) tracks `isSaved` and only destroys `previousImage` after `await listing.save()` resolves, failed DB writes destroy only the new uncommitted upload while preserving existing listing assets.

---

## 5. Executed Verification Summary

### 1. Static Syntax Check
- Executed `node --check` across every `.js` file in the workspace (excluding `node_modules`/`.git`): **PASS (`exit 0`)**.

### 2. Isolated Unit Tests *(offline sandbox with mocked Mongoose/Mapbox/Cloudinary/service stubs where noted)*
- `verify_phase3a_unit.js`: **PASS (`exit 0`)** — foundation config, `app.js` zero auto-start/DB connect (`MemoryStore` stub), `show.ejs` & `map.js` XSS serialization.
- `verify_phase3b_unit.js`: **PASS (`exit 0`)** — modular `middleware/*`, `routes/index.js`, CSRF & multipart deferral, validation guards, CSP headers, prod error masking.
- `verify_phase3c1_unit.js`: **PASS (`exit 0`)** — verified controller boundary (no direct `Listing`/Mongoose/Mapbox/cleanup imports) and all [`listingService`](file:///e:/Working%20Project/Airbnb/services/listingService.js) + [`controllers/listings.js`](file:///e:/Working%20Project/Airbnb/controllers/listings.js) behaviors with mocked Mongoose/Mapbox/Cloudinary stubs:
  - `getAllListings`, `getListingById`, `getListingDetails`, `getListingForEdit`, `/upload/w_250` transform.
  - `createListing`: missing image (`400`), geocode failure rollback (no DB save, image destroyed), DB save failure rollback, field allowlisting & owner/geometry assignment.
  - `updateListing`: invalid ID cleanup (`400`), missing listing cleanup (`null`), text-only update preserving geometry & skipping re-geocoding, failed replacement DB save destroying only new image, successful image replacement destroying `previousImage`.
  - `deleteListing`: `400` invalid ID, `404` missing doc, Cloudinary cleanup with `excludeListingId`.
  - Controller delegation, `req.fileCommitted` / `req.fileCleanedUp` coordination, flash messages, and redirects.

### 3. Live Integration Tests *(unmocked against Express 5, MongoDB Atlas, Cloudinary, Mapbox)*
- `verify_phase3c1_live.js` via `npm start` on port `8080`: **PASS (`exit 0`)**
  - MongoDB Atlas connection & server startup (`Connected to DB`, `Server running on port 8080`).
  - `GET /` → `/listings`, `GET /listings` (`200`), invalid ID `GET /listings/not-an-objectid` (`400` `"Invalid ID"`), nonexistent valid ObjectId redirect + flash `"Listing you requested for does not exist"`.
  - Missing image `POST /listings` (`400` `"Listing image is required"`), missing CSRF `POST` (`403`), invalid Joi price `POST` (`400`), ungeocodable location `POST` — confirmed `0` leaked Cloudinary assets via `cloudinary.api.resources`.
  - Happy create persisted listing + owner + Mapbox coordinates + Cloudinary image; `show.ejs` rendered `mapToken`, escaped `</script>`, and omitted owner email; `edit.ejs` rendered `/upload/w_250` thumbnail URL.
  - Text-only `PUT /listings/:id` preserved Cloudinary image and existing Mapbox coordinates without re-geocoding.
  - Replacement image `PUT /listings/:id` destroyed previous Cloudinary asset and kept new asset.
  - Cross-user `isOwner` blocks, review creation, `DELETE /listings/:id` destroying listing, cascade-deleting attached review, and destroying Cloudinary image; zero secrets/passwords in server logs.
- `verify_phase3b_regression_live.js` via `node server.js` on port `8088`: **PASS (`exit 0`)**
  - Re-verified rotating CSP nonces, security headers (`X-Powered-By` disabled), `404` handling, session cookies (`HttpOnly`, `SameSite=Lax`), `redirectUrl` flow, `validateLogin` type guard, `POST /listings/:id/reviews` `mergeParams` + `isReviewAuthor` cross-user guard, and `429` rate limiting on `POST /login` & `POST /signup`.
  - *(Note: running `verify_phase3b_live.js` directly on `8080` later reported `listen EADDRINUSE :::8080` because another local `node server.js` process `PID 11668` started running on port `8080`; running `verify_phase3b_regression_live.js` on `PORT=8088` executed the same live regression checks cleanly without disturbing that listener.)*

---

## 6. Regressions & Scope Confirmation

- **Behavioral Regressions Found:** **None** across static, isolated unit, and live integration suites.
- **Explicit Scope Confirmation:**
  - Only listing business logic was extracted ([`services/listingService.js`](file:///e:/Working%20Project/Airbnb/services/listingService.js) + [`controllers/listings.js`](file:///e:/Working%20Project/Airbnb/controllers/listings.js)).
  - **Phase 3C.2 / 3C.3 (review & user services) were NOT started:** [`controllers/reviews.js`](file:///e:/Working%20Project/Airbnb/controllers/reviews.js) and [`controllers/users.js`](file:///e:/Working%20Project/Airbnb/controllers/users.js) remain untouched.
  - No repository layer was added, no helper logic was duplicated, no existing incomplete features (such as re-geocoding on edit, category filters, navbar search, `/privacy`, or `/terms`) were changed, and no dependencies were added.

