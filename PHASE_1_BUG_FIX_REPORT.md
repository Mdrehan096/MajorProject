# Wanderlust — Phase 1 Bug Fix & Final Integration Verification Report

**Date:** 2026-11-11  
**Scope:** Phase 1 critical runtime bug fixes + live end-to-end integration verification against Express (`port 8080`), MongoDB Atlas, Cloudinary, and Mapbox.  
**Modified Application Files:**
- `controllers/listings.js`
- `controllers/reviews.js`
- `controllers/users.js`
- `middleware.js`
- `models/listing.js`
- `models/review.js`

*(No existing routes, URL patterns, Mongoose schema structures, folder structure, or EJS architecture were altered.)*

---

## 1. Phase 1 Fixes Implemented

| Component | File | Fix Applied |
| :--- | :--- | :--- |
| **`ExpressError` Imports** | `controllers/listings.js`, `controllers/reviews.js` | Imported `ExpressError` from `../utils/ExpressError.js` so invalid-ID and not-found checks throw `ExpressError` instead of `ReferenceError`. |
| **Listing Controller (`showListing`, `renderEditForm`, `updateListing`, `createListing`)** | `controllers/listings.js` | - Added `return` to `res.redirect("/listings")` when `!listing` in `showListing` and removed duplicate unreachable `if (!listing)` blocks in `showListing` and `renderEditForm`.<br>- Added null-listing guard in `updateListing`.<br>- Added `!req.file` check (`ExpressError(400, "Listing image is required")`) and empty Mapbox `features` guard (`ExpressError(400, "Invalid location: could not geocode location")`) in `createListing` (fixed after live Test #6 surfaced an unhandled `500 TypeError`). |
| **Review Controller (`destroyReview`)** | `controllers/reviews.js` | Added `mongoose.Types.ObjectId.isValid` validation for `id` and `reviewId` before DB mutation. |
| **Listing Model Cascade Hook** | `models/listing.js` | Fixed `findOneAndDelete` post-hook from `listingSchema.reviews` (`undefined`) to `listing.reviews`. |
| **Review Model Timestamp** | `models/review.js` | Changed `createdAt.default` from `Date.now()` (evaluated once at module load) to `Date.now` (evaluated per document). |
| **User Controller (`signup`, `login`)** | `controllers/users.js` | Added missing `next` parameter to `signup` so `req.login` error callback `return next(err)` executes safely; fixed `"sucess"` flash key typos to `"success"` in `signup` and `login` (and `"wandelust"` → `"wanderlust"`). |
| **Ownership & Auth Middleware** | `middleware.js` | Imported `mongoose`; updated `isOwner` and `isReviewAuthor` to validate `ObjectId` format, handle missing `Listing`/`Review` documents via flash + redirect, guard against null `owner`/`author`/`currUser`, and wrap async lookups in `try/catch` forwarding errors to `next(err)`. |

---

## 2. Integration Tests Executed & Actual Results

Live HTTP requests (with real cookies/sessions via `fetch`) were executed against a freshly started `node app.js` instance (`http://127.0.0.1:8080`) connected to **MongoDB Atlas**, **Cloudinary**, and **Mapbox**. All temporary test users, listings, reviews, and uploaded Cloudinary images were cleaned up after verification.

| Check # | Integration Test | Status | Actual Observed Result |
| :---: | :--- | :---: | :--- |
| **1–3** | Start app, verify MongoDB connection & Express server startup | **PASS** | `node app.js` printed `SERVER FILE LOADED ✔`, `Server running on port 8080`, and `Connected to DB`. |
| **4a** | Signup new user (`POST /signup`) | **PASS** | Returned `302` → `/listings`; user persisted in Atlas `users` collection; `"welcome to wanderlust"` flash rendered; navbar switched to `log out`. |
| **4b** | Duplicate username signup rejection | **PASS** | Returned `302` → `/signup`; `"A user with the given username is already registered"` flash displayed. |
| **4c** | Logout (`GET /logout`) | **PASS** | Returned `302` → `/listings`; `"you are logged out"` flash rendered; navbar reverted to `sign up` / `log in`. |
| **4d** | Invalid login rejection (`POST /login`) | **PASS** | Returned `302` → `/login`; `"Password or username is incorrect"` flash displayed. |
| **4e** | Valid login + `redirectUrl` restoration (`GET /listings/new` → `POST /login`) | **PASS** | Unauthenticated `/listings/new` redirected `302` → `/login`; post-login redirected back to `/listings/new` with `"welcome back to wanderlust"` flash. |
| **5 & 14** | Create listing with valid PNG image + Cloudinary + Mapbox geocoding | **PASS** | `POST /listings` returned `302` → `/listings` with `"new Listing created"` flash. Listing persisted in Atlas with `owner`, Cloudinary URL (`HTTP 200` on image fetch), and Mapbox GeoJSON coordinates `[75.81248, 26.920341]` for `"Jaipur, Rajasthan"`. |
| **6** | Create listing with NO image (`POST /listings` without file) | **PASS (after fix)** | **Initial run FAILED** (`500 TypeError: Cannot read properties of undefined (reading 'path')`). After adding `!req.file` guard in `controllers/listings.js`, **re-run PASSED**: returned `400`, rendered `"Listing image is required"`, nothing saved in DB. |
| **7 & 12a** | Listing details (`GET /listings/:id`) with valid, invalid, and nonexistent IDs | **PASS** | Valid ID → `200` with listing details; invalid ID → `400` (`Invalid ID ❌`); nonexistent valid ObjectId → `302` → `/listings` with `"Listing you requested for does not exist"` flash (no `ERR_HTTP_HEADERS_SENT`). |
| **8a** | Listing edit form (`GET /listings/:id/edit`) & update (`PUT /listings/:id`) | **PASS** | Edit page returned `200` with resized Cloudinary preview URL; `PUT` returned `302` → `/listings/:id`; updated title and price persisted in DB. *(Note: `geometry` stayed at Jaipur coordinates after changing location to `"Udaipur, Rajasthan"` — known issue below).* |
| **8b & 9** | Listing deletion (`DELETE /listings/:id`) & cascade deletion of reviews | **PASS** | Returned `302` → `/listings`; listing removed from `listings` collection; attached review (`Review Two`) confirmed deleted from `reviews` collection (`null`). |
| **10a** | Review creation (`POST /listings/:id/reviews`) & dynamic `createdAt` | **PASS** | Two reviews created `>1s` apart returned `302` → `/listings/:id`; `r2.createdAt - r1.createdAt = 1738 ms` (confirming per-document timestamp generation); `listing.reviews.length === 2`. |
| **10b** | Authorized review deletion (`DELETE /listings/:id/reviews/:reviewId`) | **PASS** | Review author deletion returned `302`; review deleted from `reviews` collection and pulled from `listing.reviews` (`remainingReviews = 1`). |
| **11** | Authorization enforcement (Guest & Cross-user) | **PASS** | Guest requests to `/edit`, `POST /listings`, `DELETE /listings/:id`, `POST /reviews` all redirected `302` → `/login`. User B blocked (`302`) from editing/updating/deleting User A's listing; User A blocked (`302`) from deleting User B's review. Listing title & review intact. |
| **12b** | Invalid & nonexistent IDs on reviews & ownership middleware | **PASS** | `POST /listings/bad-id/reviews` → `400`; `POST /listings/<missing>/reviews` → `404`; `GET /listings/bad-id/edit` → `400`; `GET /listings/<missing>/edit` → `302`; `DELETE .../reviews/bad-id` → `400`; `DELETE .../reviews/<missing>` → `302`. |
| **13 (Server)** | Server logs inspection (`stdout` / `stderr`) | **PASS (with warnings)** | Error stack traces and status codes logged cleanly without uncaught process crashes. `stderr` emitted Node deprecation warning `[DEP0044] util.isArray`. `stdout` showed debug logs including `salt`/`hash` from `console.log(registeredUser)`. |
| **13 (Browser)** | Live Chrome DevTools browser console inspection | **BLOCKED** | Could not inspect live browser console via `chrome_devtools` (see Blocked Tests below). |

---

## 3. Failed Tests

- **Initial Run — Test #6 (`POST /listings` with no image):**
  - **Initial Failure:** Returned HTTP `500` with `TypeError: Cannot read properties of undefined (reading 'path')` at `controllers/listings.js` (`createListing`).
  - **Resolution & Re-test:** Added a targeted `!req.file` guard (and empty Mapbox `features` guard) in `controllers/listings.js`. Re-running the full live suite confirmed Test #6 now returns HTTP `400` (`Listing image is required`) with `savedInDb=false`.
- **Remaining Failed Tests After Fix:** None among executed server/HTTP/DB/external-API integration tests.

---

## 4. Blocked Tests and Reasons

1. **Test #13 (Browser Console Check via Chrome DevTools): `BLOCKED`**
   - **Reason:** Invoking the `browser` subagent failed to attach to Chrome DevTools (`ENOENT: no such file or directory` looking for `C:\Users\MD REHAN\AppData\Local\Google\Chrome\User Data\DevToolsActivePort`). Chrome was not running with remote debugging enabled on this machine.
   - **Note:** Static inspection (`views/layout/boilerplate.ejs`, `views/listings/show.ejs`) indicates `boilerplate.ejs` loads `/js/map.js` globally on every page, which is expected to log a client-side `ReferenceError: mapToken is not defined` on non-detail pages once opened in a browser (queued for Phase 2 frontend fixes).
2. **Environment Note (Sandbox Mode):**
   - Initial execution inside the isolated terminal sandbox failed (`connect EACCES 127.0.0.1:8080` and Atlas buffering timeout) because the sandbox blocks network access. All live integration tests reported above were executed in unsandboxed mode with real MongoDB Atlas, Cloudinary, and Mapbox credentials from `.env`.
   - Also discovered and terminated an earlier background `node.exe app.js` instance (`PID 69820`) listening on port `8080` before running the final verification pass, ensuring all logs and responses came directly from the updated codebase.

---

## 5. Remaining Known Issues (Out of Phase 1 Scope / Queued for Phase 2+)

1. **Frontend / Browser Console Issues (`views/`, `public/`):**
   - `views/layout/boilerplate.ejs` loads `/js/map.js` unconditionally on every route (expect browser `ReferenceError` on `/listings`, `/login`, `/signup`, `/listings/new`) and never loads `/js/script.js` (disabling `.needs-validation` client checks).
   - `views/layout/boilerplate.ejs` loads duplicate Bootstrap CSS (`5.3.8` + `5.3.0`).
   - `views/listings/show.ejs` has misspelled `<scrip src="/js/map.js"></scrip>` and renders the Review Delete button for all users regardless of authorship.
2. **Security & Upload Issues (`show.ejs`, `map.js`, `cloudConfig.js`, `app.js`, `routes/`):**
   - Stored XSS & PII exposure in `views/listings/show.ejs` (`<%- JSON.stringify(listing) %>` leaks owner/reviewer `email` and `_id` and does not escape `</script>`) and `public/js/map.js` (`.setHTML(...)` interpolates raw `listing.title`).
   - `cloudConfig.js` uses `allowedFormat` instead of `allowed_formats`, and `multer` lacks `fileFilter` and `fileSize` limits; failed `validateListing` requests still upload files to Cloudinary.
   - No CSRF protection; logout uses `GET /logout`; debug routes (`/session-test`, `/check-session`, `/test`) remain in `app.js`.
   - `controllers/users.js` logs `registeredUser` (including `salt` and `hash`) to `stdout`.
3. **Data Consistency & Incomplete Features:**
   - Verified live in Test #8a: `updateListing` does not re-geocode `location`, leaving `geometry.coordinates` stale when location changes.
   - Updating or deleting a listing does not delete orphaned images from Cloudinary.
   - Navbar search form and index category filter icons remain non-functional UI placeholders; `/privacy` and `/terms` return `404`.
   - Server `stderr` logs Node deprecation warning `[DEP0044] util.isArray` from dependencies.

---

## 6. Readiness Assessment: Is Phase 1 Ready for Phase 2?

**YES — Ready for Phase 2 (with one documented blocked verification item).**

- All Phase 1 backend bug fixes (A–F plus the `!req.file` / geocoding guard discovered in Test #6) are verified working end-to-end against live Express, MongoDB Atlas, Cloudinary, and Mapbox.
- All HTTP, authentication, authorization, cascade-delete, timestamp, and invalid/nonexistent ID checks passed cleanly on the final run.
- Only the **live Chrome DevTools browser console inspection (#13)** remains `BLOCKED` due to Chrome remote debugging not being active; frontend and security fixes are queued directly for Phase 2.

