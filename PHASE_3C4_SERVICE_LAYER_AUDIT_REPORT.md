# Wanderlust — Phase 3C.4 Service Layer Boundary Audit Report

**Date:** 2026-11-12  
**Audit Type:** Read-Only Architecture, Boundary & Security Verification Audit  
**Git Baseline Observed:** `32d45df` (`Phase 3B route and middleware modularization completed`) + Phase 3C.1–3C.3 service extractions (`services/*`, `controllers/*`, `middleware/auth.js`) and pre-existing `package.json` whitespace formatting preserved unchanged.  
**Target Architecture Audited:** `Routes → Middleware → Controllers → Services → Models`

---

## 1. Executive Summary

The Wanderlust service-layer refactoring (Phases 3C.1–3C.3) cleanly separates HTTP request handling from Mongoose persistence and external integrations across all three domain resources (`Listing`, `Review`, `User`):

- **0 direct Mongoose queries or Model imports** remain inside `controllers/listings.js`, `controllers/reviews.js`, or `controllers/users.js`.
- **0 Express HTTP dependencies** (`req`, `res`, `next`, `req.flash`, `res.redirect`, `passport`) exist inside `services/listingService.js`, `services/reviewService.js`, or `services/userService.js`.
- **0 Critical or High findings.** Security controls (ownership/authorship checks, cross-listing review deletion protection, PBKDF2 hashing, `-hash -salt` projection hygiene, CSRF, Joi validation, rate limiting, and Cloudinary failure rollback) held across static, unit, and live integration suites.
- **No additional service file extraction is warranted.** Existing database touchpoints outside `services/` (middleware guards, Mongoose cascade hook, Passport adapter, DB/session infrastructure, Cloudinary reference guard) are architectural infrastructure boundaries rather than missing domain services.

---

## 2. Architecture & Responsibility Audit

### Current Layering
- **Routes ([`routes/index.js`](file:///e:/Working%20Project/Airbnb/routes/index.js), [`routes/listing.js`](file:///e:/Working%20Project/Airbnb/routes/listing.js), [`routes/review.js`](file:///e:/Working%20Project/Airbnb/routes/review.js), [`routes/user.js`](file:///e:/Working%20Project/Airbnb/routes/user.js)):** Pure Express routing, middleware wiring, Passport local authenticate route hook, and `wrapAsync` error forwarding.
- **Middleware (`middleware/*`):** Cross-cutting security headers/CSP/locals ([`security.js`](file:///e:/Working%20Project/Airbnb/middleware/security.js)), rate limiting ([`rateLimit.js`](file:///e:/Working%20Project/Airbnb/middleware/rateLimit.js)), CSRF generation/validation ([`csrf.js`](file:///e:/Working%20Project/Airbnb/middleware/csrf.js)), Multer-Cloudinary upload filter/limits ([`upload.js`](file:///e:/Working%20Project/Airbnb/middleware/upload.js)), Joi & login payload validation ([`validation.js`](file:///e:/Working%20Project/Airbnb/middleware/validation.js)), session authentication & resource ownership guards ([`auth.js`](file:///e:/Working%20Project/Airbnb/middleware/auth.js)), and centralized error/upload cleanup ([`error.js`](file:///e:/Working%20Project/Airbnb/middleware/error.js)).
- **Controllers:**
  - [`controllers/listings.js`](file:///e:/Working%20Project/Airbnb/controllers/listings.js#L1-L87): Extracts HTTP params/body/user/file, delegates all 6 data-backed actions to [`listingService`](file:///e:/Working%20Project/Airbnb/services/listingService.js), tracks `req.fileCommitted` / `req.fileCleanedUp` flags, sets flashes, renders EJS, and redirects.
  - [`controllers/reviews.js`](file:///e:/Working%20Project/Airbnb/controllers/reviews.js#L1-L17): Delegates `createReview` and `destroyReview` to [`reviewService`](file:///e:/Working%20Project/Airbnb/services/reviewService.js), flashes, and redirects.
  - [`controllers/users.js`](file:///e:/Working%20Project/Airbnb/controllers/users.js#L1-L54): Delegates user registration to [`userService`](file:///e:/Working%20Project/Airbnb/services/userService.js), handles Passport session login/logout (`req.login`, `req.logout`), enforces safe local `redirectUrl`, flashes, and renders signup/login forms.
- **Services:**
  - [`services/listingService.js`](file:///e:/Working%20Project/Airbnb/services/listingService.js#L1-L235): Listing CRUD, ObjectId checks, nested `reviews.author` + `owner` username population, Mapbox geocoding on create, map/thumbnail view DTO formatting, and Cloudinary rollback/replacement/delete coordination.
  - [`services/reviewService.js`](file:///e:/Working%20Project/Airbnb/services/reviewService.js#L1-L93): ObjectId checks, parent listing lookup/membership enforcement, allowlisted review creation + rollback if `listing.save()` fails, and safe `$pull` review deletion.
  - [`services/userService.js`](file:///e:/Working%20Project/Airbnb/services/userService.js#L1-L50): Payload validation/allowlisting, `User.register` persistence (PBKDF2 via `passport-local-mongoose`), and sanitized lookup queries (`-hash -salt`).
- **Models & Config:**
  - [`models/listing.js`](file:///e:/Working%20Project/Airbnb/models/listing.js), [`models/review.js`](file:///e:/Working%20Project/Airbnb/models/review.js), [`models/user.js`](file:///e:/Working%20Project/Airbnb/models/user.js): Mongoose schemas, `passport-local-mongoose` plugin, and listing-to-review `findOneAndDelete` cascade hook.
  - [`config/*`](file:///e:/Working%20Project/Airbnb/config/env.js): Isolated `env`, `db`, `session`, `passport`, `cloudinary`, and `mapbox` setup.

### Is Additional Service Extraction Necessary?
**No.** All three domain entities in `models/` (`Listing`, `Review`, `User`) have clean domain services, and all three controllers delegate 100% of business and persistence work. Creating separate services for Passport setup ([`config/passport.js`](file:///e:/Working%20Project/Airbnb/config/passport.js)), Multer/Cloudinary SDK config ([`config/cloudinary.js`](file:///e:/Working%20Project/Airbnb/config/cloudinary.js)), or middleware auth checks ([`middleware/auth.js`](file:///e:/Working%20Project/Airbnb/middleware/auth.js)) would introduce unnecessary indirection or circular dependency risk without improving separation of concerns.

---

## 3. Direct Database Operations Remaining in Controllers

| Controller | Direct Mongoose / Model Imports | Direct DB Queries | HTTP-Only Operations Retained | Status |
| :--- | :--- | :--- | :--- | :--- |
| [`controllers/listings.js`](file:///e:/Working%20Project/Airbnb/controllers/listings.js#L1-L87) | **None** | **None** | `req.params`, `req.body?.listing`, `req.user?._id`, `req.file`, `req.fileCommitted`/`req.fileCleanedUp`, `req.flash`, `res.render`, `res.redirect` | Clean |
| [`controllers/reviews.js`](file:///e:/Working%20Project/Airbnb/controllers/reviews.js#L1-L17) | **None** | **None** | `req.params`, `req.body?.review`, `req.user?._id`, `req.flash`, `res.redirect` | Clean |
| [`controllers/users.js`](file:///e:/Working%20Project/Airbnb/controllers/users.js#L1-L54) | **None** | **None** | `req.body`, `req.login`, `req.logout`, `res.locals.redirectUrl`, `next(err)`, `req.flash`, `res.render`, `res.redirect` | Clean |

### Mongoose Operations Intentionally Outside `services/`
- [`middleware/auth.js`](file:///e:/Working%20Project/Airbnb/middleware/auth.js#L24-L97): `isOwner` runs `Listing.findById(id)`; `isReviewAuthor` runs `Listing.findById(id)` and `Review.findById(reviewId)`.
- [`utils/cloudinaryCleanup.js`](file:///e:/Working%20Project/Airbnb/utils/cloudinaryCleanup.js#L25-L50): `safeDestroyCloudinaryImage` runs `Listing.exists(query)` before destroying assets.
- [`models/listing.js`](file:///e:/Working%20Project/Airbnb/models/listing.js#L43-L47): `listingSchema.post("findOneAndDelete")` runs `Review.deleteMany({ _id: { $in: listing.reviews } })`.
- [`config/passport.js`](file:///e:/Working%20Project/Airbnb/config/passport.js#L5-L9): Binds `User.authenticate()`, `User.serializeUser()`, `User.deserializeUser()` to Passport.
- [`config/db.js`](file:///e:/Working%20Project/Airbnb/config/db.js) & [`config/session.js`](file:///e:/Working%20Project/Airbnb/config/session.js): Manage MongoDB Atlas connectivity and `MongoStore` sessions.
- [`init/index.js`](file:///e:/Working%20Project/Airbnb/init/index.js): Legacy standalone CLI seeding script targeting local `127.0.0.1:27017` (not loaded by `app.js`/`server.js`).

---

## 4. Service Dependency & Coupling Analysis

| Module | Outbound Dependencies | Inbound Callers | Express Coupling (`req`/`res`/`next`/`flash`/`redirect`/`passport`) | Console Logging |
| :--- | :--- | :--- | :--- | :--- |
| [`services/listingService.js`](file:///e:/Working%20Project/Airbnb/services/listingService.js#L1-L235) | `mongoose`, `models/listing`, `utils/ExpressError.js`, `config/mapbox.js`, `utils/cloudinaryCleanup.js` | `controllers/listings.js` | **None** | **None** |
| [`services/reviewService.js`](file:///e:/Working%20Project/Airbnb/services/reviewService.js#L1-L93) | `mongoose`, `models/listing`, `models/review`, `utils/ExpressError.js` | `controllers/reviews.js` | **None** | **None** |
| [`services/userService.js`](file:///e:/Working%20Project/Airbnb/services/userService.js#L1-L50) | `mongoose`, `models/user`, `utils/ExpressError.js` | `controllers/users.js` | **None** | **None** |
| [`utils/cloudinaryCleanup.js`](file:///e:/Working%20Project/Airbnb/utils/cloudinaryCleanup.js#L1-L69) | `config/cloudinary.js`, `models/listing.js` | `services/listingService.js`, `middleware/csrf.js`, `middleware/validation.js`, `middleware/error.js` | Reads `req.file`, `req.fileCommitted`, `req.fileCleanedUp` in `cleanupFileIfUncommitted(req)` | `console.error` (err message only) |

### Key Coupling Observations
1. **Clean Service-to-HTTP Isolation:** None of the three services accept `req`/`res`/`next` or reference Passport, cookies, sessions, or EJS templates. Errors cross the service boundary via `ExpressError(statusCode, message)` or domain returns (`null`/documents), leaving flash/redirect/render decisions to controllers.
2. **Upload Rollback State Coordination:** Multipart failure cleanup coordinates across [`middleware/upload.js`](file:///e:/Working%20Project/Airbnb/middleware/upload.js), [`middleware/csrf.js`](file:///e:/Working%20Project/Airbnb/middleware/csrf.js), [`middleware/validation.js`](file:///e:/Working%20Project/Airbnb/middleware/validation.js), [`controllers/listings.js`](file:///e:/Working%20Project/Airbnb/controllers/listings.js), [`services/listingService.js`](file:///e:/Working%20Project/Airbnb/services/listingService.js), [`middleware/error.js`](file:///e:/Working%20Project/Airbnb/middleware/error.js), and [`utils/cloudinaryCleanup.js`](file:///e:/Working%20Project/Airbnb/utils/cloudinaryCleanup.js). Because `listingService` rolls back failed creates/updates internally and [`controllers/listings.js`](file:///e:/Working%20Project/Airbnb/controllers/listings.js#L28-L35) sets `req.fileCommitted` / `req.fileCleanedUp`, `createErrorHandler` does not double-delete committed or already-cleaned assets.
3. **`utils/cloudinaryCleanup.js` Model Dependency:** Keeps `Listing.exists` inside `utils/` so middleware (`csrf.js`, `error.js`, `validation.js`) can clean up uncommitted Multer uploads without importing `services/listingService.js` (avoiding circular or upside-down `middleware → service → util` coupling).

---

## 5. Security Boundary Verification

| Security Area | Verified Enforcement Path | Audit Result |
| :--- | :--- | :--- |
| **Listing Ownership & Deletion** | `routes/listing.js` gates `PUT /:id`, `DELETE /:id`, and `GET /:id/edit` with `isLoggedIn` → `isOwner`. `listingService.createListing` binds `owner: ownerId` from `req.user._id` rather than request body. `deleteListing` triggers [`models/listing.js`](file:///e:/Working%20Project/Airbnb/models/listing.js#L43-L47) post-hook cascade review cleanup and destroys the listing image only when unreferenced elsewhere (`excludeListingId`). *(Note service-level ownership gap in Finding M-1.)* | Enforced at HTTP & model layers |
| **Review Author & Parent-Listing Membership** | Both [`middleware/auth.js`](file:///e:/Working%20Project/Airbnb/middleware/auth.js#L50-L97) (`isReviewAuthor`) and [`services/reviewService.js`](file:///e:/Working%20Project/Airbnb/services/reviewService.js#L58-L85) (`deleteReview`) verify listing existence, `listing.reviews` membership of `reviewId`, and author equality (`isReviewAuthor`). `createReview` binds `author: authorId` and allowlists `{ rating, comment }`. | Enforced at both HTTP & service layers |
| **User Password Hashing & PII Projections** | [`services/userService.js`](file:///e:/Working%20Project/Airbnb/services/userService.js#L5-L44) validates payloads (rejecting `null`/`[]`/non-strings), allowlists `{ username, email }`, and invokes `User.register(newUser, password)` (salted PBKDF2). Lookup helpers enforce `.select("-hash -salt")`; [`listingService.getListingById`](file:///e:/Working%20Project/Airbnb/services/listingService.js#L73-L81) selects only `"username"` on `owner` and `reviews.author`. Zero emails, hashes, salts, or passwords appear in HTML or console logs. | Verified intact |
| **Cloudinary Cleanup & Rollback** | Missing/invalid fields, CSRF failure (`403`), Joi failure (`400`), geocode failure (`400`), and DB save errors roll back newly uploaded Cloudinary assets while preserving old images on failed updates (`isSaved` guard in [`services/listingService.js`](file:///e:/Working%20Project/Airbnb/services/listingService.js#L155-L205)) and skipping seed/`listingimage` or shared `filename` assets (`Listing.exists`). | Verified live (0 leaked assets) |
| **ObjectId Validation** | `mongoose.Types.ObjectId.isValid` is checked before DB queries in `listingService`, `reviewService`, `userService`, and `middleware/auth.js`. Empirically tested against Mongoose `9.3.1`: `undefined`, `null`, `""`, `"bad"`, `"12bytesExact"`, `123`, `{}` all return `false` *(see Finding I-4 for `Uint8Array(12)`/`{ _id }` note)*. | Verified intact |

---

## 6. Verification Results (Executed Read-Only After Phase 3C.3)

### 1. Static Syntax Check *(sandbox)*
- Executed `node --check` across every `.js` file in the project (excluding `node_modules` and `.git`): **PASS (`exit 0`, `39` JS files checked)**.

### 2. Isolated Unit Tests *(offline sandbox; mocked Mongoose/Mapbox/Cloudinary/service stubs where noted)*
- `verify_phase3a_unit.js`: **PASS (`exit 0`)** — foundation config modules, `app.js` import isolation (`MemoryStore` stub), `show.ejs` `safeJson` & `map.js` DOM XSS checks.
- `verify_phase3b_unit.js`: **PASS (`exit 0`)** — modular `middleware/*` exports, CSRF verification & multipart deferral, Joi/login validation guards, CSP/HSTS headers, production 500 masking, `routes/index.js` & `app.js` startup isolation.
- `verify_phase3c1_unit.js`: **PASS (`exit 0`)** — `listingService` & `controllers/listings.js` delegation, failure upload cleanup, image replacement rollback, no-regeocode guarantee.
- `verify_phase3c2_regression_unit.js`: **PASS (`exit 0`)** — all functional assertions from `verify_phase3c2_unit.js` covering `reviewService`, `controllers/reviews.js`, and `isReviewAuthor` parent-listing checks (with the Phase 3C.2 pre-3C.3 gate check updated to permit `services/userService.js`).
- `verify_phase3c3_unit.js`: **PASS (`exit 0`)** — `userService` validation/allowlisting/`UserExistsError`/`-hash -salt` projections and `controllers/users.js` delegation, `req.login`/`req.logout`, safe `redirectUrl`, and zero `console.log`.

### 3. Live Integration Tests *(unmocked against Express 5, MongoDB Atlas, Cloudinary, Mapbox)*
- Initial sandboxed runs timed out on Atlas SRV DNS (`querySrv ETIMEOUT _mongodb._tcp.majorproject.z4iosg5.mongodb.net` because standard sandbox blocks external network access), so all live suites below were executed outside the sandbox against live Atlas/Cloudinary/Mapbox on isolated ports:
  - `verify_phase3b_regression_live.js` (`PORT=8088`): **PASS (`exit 0`)** — rotating CSP nonces, security headers, `404` handling, signup/logout/`validateLogin`/`redirectUrl`/MongoStore sessions, `POST /listings` (Mapbox + Cloudinary), review `mergeParams` + `isReviewAuthor`, image replacement cleanup, cascade delete cleanup, and login/signup `429` rate limiting.
  - `verify_phase3c2_live.js` (isolated port `56478`): **PASS (`exit 0`)** — full review CRUD, CSRF, Joi validation, invalid/missing listing IDs (`400`/`404`), cross-user delete block, cascade delete + Cloudinary cleanup.
  - `verify_phase3c2_security_live.js` (isolated port `56508`): **PASS (`exit 0`)** — cross-listing review deletion blocked at both HTTP (`isReviewAuthor`) and service (`reviewService.deleteReview`) layers; correct listing URL succeeds cleanly.
  - `verify_phase3c3_live.js` (isolated port `56534`): **PASS (`exit 0`)** — CSRF `403`, Joi `validateSignup`, Atlas PBKDF2 user creation & `HttpOnly`/`SameSite=Lax` sessions, duplicate user flash redirect, `POST /logout` & `GET /logout` `404`, `validateLogin` NoSQL guard, safe `redirectUrl`, listing/Mapbox/Cloudinary/review flows, login/signup `429` rate limits, zero credentials/hashes/salts in HTML or logs.

### 4. Tests That Could Not Run As-Is & Why
- `verify_phase2_unit.js`: **Stopped (`exit 1`) at line 223 (`Cannot find module 'cloudConfig.js'`)** — this historical Phase 2 script imports pre-Phase 3A/3B root files `cloudConfig.js` and `middleware.js` removed in Phases 3A/3B; its DOM, `safeJson`, EJS `<%-`, CSRF, schema, Cloudinary cleanup, and rate-limiter checks were migrated into `verify_phase3a_unit.js` and `verify_phase3b_unit.js`, which both passed.
- `verify_phase3c2_unit.js`: **Stopped (`exit 1`) at line 24 (`"Phase 3C.3 userService.js must NOT be created in Phase 3C.2"`)** — expected historical phase-gate assertion written before Phase 3C.3 created `services/userService.js`; all functional review service and `isReviewAuthor` assertions verified via `verify_phase3c2_regression_unit.js`.
- Default-port `8080` live scripts (`verify_phase1.js`, `verify_phase2_live.js`, `verify_phase3a_live.js`, `verify_phase3b_live.js`, `verify_phase3c1_live.js`, `live_integration_verify.js`): **Skipped direct execution** because they spawn `npm start` hardcoded to port `8080` (previously observed occupied by a separate local listener, risking `EADDRINUSE` collisions or disrupting an active server). Their live Phase 3A/3B/3C.1 behaviors are covered by `verify_phase3b_regression_live.js` (`8088`), `verify_phase3c2_live.js`, and `verify_phase3c3_live.js`.

---

## 7. Audit Findings by Severity

### Critical
- None.

### High
- None.

### Medium

1. **M-1: Service Mutation APIs Do Not Enforce Listing Ownership / Review Authorship Internally**
   - **Locations:** [`services/listingService.js#L153-L221`](file:///e:/Working%20Project/Airbnb/services/listingService.js#L153-L221) (`updateListing`, `deleteListing`), [`services/reviewService.js#L58-L85`](file:///e:/Working%20Project/Airbnb/services/reviewService.js#L58-L85) (`deleteReview`).
   - **Details:** Unlike `reviewService.deleteReview`'s parent-listing membership guard or `createListing`'s `{ ownerId }` requirement, `updateListing(id, listingData, { file })`, `deleteListing(id)`, and `deleteReview(listingId, reviewId)` do not accept or verify an `actorId`/`ownerId`/`authorId`. Over HTTP this is fully protected by `isOwner` and `isReviewAuthor` in [`middleware/auth.js`](file:///e:/Working%20Project/Airbnb/middleware/auth.js), but non-HTTP or future internal callers invoking those service functions directly would bypass ownership/authorship enforcement.

2. **M-2: Duplicate DB Lookups and Parent-Membership Logic Across `middleware/auth.js` and Services**
   - **Locations:** [`middleware/auth.js#L24-L97`](file:///e:/Working%20Project/Airbnb/middleware/auth.js#L24-L97) (`isOwner`, `isReviewAuthor`) vs [`services/listingService.js`](file:///e:/Working%20Project/Airbnb/services/listingService.js) & [`services/reviewService.js#L58-L85`](file:///e:/Working%20Project/Airbnb/services/reviewService.js#L58-L85).
   - **Details:** Authorized edit/update/delete requests query the same `Listing` (and for review delete, `Review`) twice — once in auth middleware and again in the service — and duplicate the `listing.reviews.some(...)` membership check in both `isReviewAuthor` and `reviewService.deleteReview`. While this duplication provides defense-in-depth when `deleteReview` is called outside Express routes and preserves middleware redirect UX, it adds redundant DB reads and two maintenance points if listing/review association rules evolve.

3. **M-3: Inconsistent Service Input Self-Validation & Non-Transactional Multi-Document Writes**
   - **Locations:** [`services/listingService.js#L123-L185`](file:///e:/Working%20Project/Airbnb/services/listingService.js#L123-L185), [`services/reviewService.js#L26-L85`](file:///e:/Working%20Project/Airbnb/services/reviewService.js#L26-L85), [`services/userService.js#L5-L28`](file:///e:/Working%20Project/Airbnb/services/userService.js#L5-L28).
   - **Details:** `userService.registerUser` strictly validates non-null/non-array objects and non-empty string fields independently of `validateSignup`, whereas `listingService.createListing`/`updateListing` and `reviewService.createReview` accept any truthy object (including arrays or partial payloads that would overwrite listing fields with `undefined` on `updateListing` if called directly without `validateListing` Joi middleware). Separately, `reviewService.deleteReview` performs `Review.findByIdAndDelete` (`line 75`) and `Listing.findByIdAndUpdate` (`line 80`) without a MongoDB transaction/session; a process failure between those two statements would leave a dangling review ObjectId in `listing.reviews` (render-safe because Mongoose `.populate("reviews")` omits missing docs, though stored ref remains).

### Low

1. **L-1: Duplicated ObjectId Validation & Divergent Error Messages**
   - **Locations:** [`listingService.js#L7-L11`](file:///e:/Working%20Project/Airbnb/services/listingService.js#L7-L11) (`"Invalid ID ❌"`), [`reviewService.js#L6-L10`](file:///e:/Working%20Project/Airbnb/services/reviewService.js#L6-L10) (`"Invalid ID ❌"`), [`userService.js#L30-L33`](file:///e:/Working%20Project/Airbnb/services/userService.js#L30-L33) (`"Invalid User ID"`), [`middleware/auth.js#L27-L58`](file:///e:/Working%20Project/Airbnb/middleware/auth.js#L27-L58) (`"Invalid Listing ID"`, `"Invalid ID"`).
   - **Details:** ObjectId validation logic and error strings are repeated across four modules.

2. **L-2: Asymmetric Not-Found Behavior (`null` vs `ExpressError(404)`) Across Service Methods**
   - **Locations:** [`listingService.js#L84-L109`](file:///e:/Working%20Project/Airbnb/services/listingService.js#L84-L109) / [`#L160-L164`](file:///e:/Working%20Project/Airbnb/services/listingService.js#L160-L164) / [`#L211-L214`](file:///e:/Working%20Project/Airbnb/services/listingService.js#L211-L214), [`reviewService.js#L15-L18`](file:///e:/Working%20Project/Airbnb/services/reviewService.js#L15-L18), [`userService.js#L35-L43`](file:///e:/Working%20Project/Airbnb/services/userService.js#L35-L43).
   - **Details:** `getListingDetails`, `getListingForEdit`, `updateListing`, `findUserById`, and `findUserByUsername` return `null` on missing records, while `deleteListing`, `findListingOrThrow`, and `deleteReview` throw `ExpressError(404, ...)`. All route callers behave consistently today (`isOwner` catches missing listings before `updateListing`/`deleteListing` execute), but direct service consumers face mixed not-found contracts.

3. **L-3: Broad `catch (e)` in [`controllers/users.js`](file:///e:/Working%20Project/Airbnb/controllers/users.js#L16-L19) Flashes Raw Database/Runtime Errors on Signup**
   - **Details:** Preserved from the pre-Phase 3C controller, `signup` catches any error from `userService.registerUser` and passes `e.message` directly to `req.flash("error", e.message)` + redirect `/signup`, bypassing [`middleware/error.js`](file:///e:/Working%20Project/Airbnb/middleware/error.js#L18-L24)'s production 500 masking (`"Something went wrong!"`) if an unexpected DB/network error occurs during registration.

4. **L-4: Multi-Module Upload Flag Coupling (`req.fileCommitted` / `req.fileCleanedUp`)**
   - **Locations:** [`controllers/listings.js#L28-L77`](file:///e:/Working%20Project/Airbnb/controllers/listings.js#L28-L77), [`utils/cloudinaryCleanup.js#L52-L62`](file:///e:/Working%20Project/Airbnb/utils/cloudinaryCleanup.js#L52-L62), [`middleware/error.js#L14`](file:///e:/Working%20Project/Airbnb/middleware/error.js#L14), [`services/listingService.js`](file:///e:/Working%20Project/Airbnb/services/listingService.js).
   - **Details:** Works reliably today, but forgetting to set `req.fileCleanedUp = true` or `req.fileCommitted = true` in a future multipart controller handler would cause duplicate or missed Cloudinary cleanup.

5. **L-5: Minor Unused Import, Uncalled Helpers & Legacy Code**
   - [`models/listing.js#L4`](file:///e:/Working%20Project/Airbnb/models/listing.js#L4): Unused `const { required } = require("joi");`.
   - [`services/userService.js#L30-L44`](file:///e:/Working%20Project/Airbnb/services/userService.js#L30-L44): `findUserById` and `findUserByUsername` currently have zero runtime callers outside tests.
   - [`controllers/users.js#L34`](file:///e:/Working%20Project/Airbnb/controllers/users.js#L34): `login` is marked `async` without any `await`.
   - [`controllers/reviews.js#L15`](file:///e:/Working%20Project/Airbnb/controllers/reviews.js#L15): Leading space in flash string `" Review Deleted"`.
   - [`init/index.js#L5`](file:///e:/Working%20Project/Airbnb/init/index.js#L5): Legacy seed script hardcodes local `mongodb://127.0.0.1:27017/wanderlust`.

### Informational

1. **I-1: Zero HTTP/Express Coupling & Sensitive Logging Across Controllers and Services** — Verified via automated dependency scan across all 35 backend JS files.
2. **I-2: `ExpressError` Used Consistently as Application-Layer Error Type** — Services throw `ExpressError` carrying numeric status semantics without touching `res.status()` or error templates.
3. **I-3: Intentional No-Re-Geocoding on Listing Edit** — [`listingService.updateListing`](file:///e:/Working%20Project/Airbnb/services/listingService.js#L153-L206) intentionally preserves original `geometry` coordinates when `location` is edited.
4. **I-4: `ObjectId.isValid` Non-String Edge Case** — Under Mongoose `9.3.1`, string/integer/empty-object values behave safely, while `new Uint8Array(12)` and `{ _id: "<24-hex>" }` pass `ObjectId.isValid`; not reachable via Express string `req.params`, relevant only if internal callers pass raw objects/buffers.
5. **I-5: Existing Untouched Workspace Formatting** — [`package.json`](file:///e:/Working%20Project/Airbnb/package.json) retains pre-existing `engines` whitespace formatting untouched from before Phase 3C.2.

---

## 8. Recommended Actions (For Future Maintenance / Phase 3D — Not Applied Here)

1. **Optional Service Hardening (Medium priority if non-HTTP callers are added):**
   - Pass `{ actorId }` (optional or required) into `listingService.updateListing`, `listingService.deleteListing`, and `reviewService.deleteReview` if background jobs, CLI tools, or GraphQL/REST adapters will call services directly outside Express auth middleware.
   - Guard `listingService.createListing`/`updateListing` and `reviewService.createReview` against `Array.isArray(payload)` and partial field payloads cleanly inside the services (matching `userService.registerUser`).
2. **Error Handling & Helper Consolidation (Low priority):**
   - In [`controllers/users.js`](file:///e:/Working%20Project/Airbnb/controllers/users.js#L16-L19), forward unexpected 5xx infrastructure errors (`err.statusCode >= 500` or unexpected DB failures) to `next(e)` while continuing to flash validation and `UserExistsError` errors to `/signup`.
   - Extract a single shared ObjectId validator helper in `utils/` used by `services/*` and `middleware/auth.js` (while keeping desired message strings or unified contract).
   - Remove the unused `require("joi")` in [`models/listing.js#L4`](file:///e:/Working%20Project/Airbnb/models/listing.js#L4) and redundant `async` on [`controllers/users.js#L34`](file:///e:/Working%20Project/Airbnb/controllers/users.js#L34) when touching those files in a later refactor.
3. **Live Test Script Hygiene:**
   - Update `verify_phase3b_live.js` / `verify_phase3c1_live.js` in the test scratch harness to allocate ephemeral ports (`findAvailablePort()` + `node server.js`) so default port `8080` listeners never conflict with automated runs.

---

## 9. Scope & Non-Modification Confirmation

- **No source files were modified, refactored, renamed, or deleted** (only this read-only audit report [`PHASE_3C4_SERVICE_LAYER_AUDIT_REPORT.md`](file:///e:/Working%20Project/Airbnb/PHASE_3C4_SERVICE_LAYER_AUDIT_REPORT.md) was created in the repository root).
- **No dependencies were installed**, and routes, models, controllers, services, middleware, configuration, views, and `package.json` remain identical to the pre-audit Phase 3C.3 state.
- **Phase 3D was NOT started.**

