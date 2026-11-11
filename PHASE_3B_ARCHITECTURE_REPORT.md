# Wanderlust — Phase 3B Route & Middleware Modularization Report

**Date:** 2026-11-11  
**Baseline Checkpoint Commit:** `3efd0a6` (`Phase 3A application foundation completed`)  
**Scope:** Phase 3B — modularizing routes (`routes/`) and middleware (`middleware/`) while preserving Phase 1 bug fixes, Phase 2 security controls, Phase 3A foundation separation (`config/*`, `server.js`), Express 5 behavior, and all existing URLs/functionality.

---

## 1. Original vs. New Route and Middleware Structure

### Before Phase 3B
```
Wanderlust/
├── app.js                 (contained inline security headers/CSP, locals, auth rate-limit dispatch,
│                           global multipart-deferring CSRF check, home GET /, 404, & error handler)
├── middleware.js          (265-line monolith: rate limiters, Multer upload, CSRF helpers,
│                           auth/ownership guards, and Joi validation)
├── routes/
│   ├── listing.js         (imported ../middleware.js)
│   ├── review.js          (imported ../middleware.js)
│   └── user.js            (imported ../middleware.js + inline login payload check)
└── ...
```

### After Phase 3B
```
Wanderlust/
├── app.js                 (clean Express 5 app factory mounting middleware/* and routes/)
├── server.js              (unchanged Phase 3A startup entry point)
├── middleware/
│   ├── index.js           (central barrel exporting all middleware)
│   ├── auth.js            (isLoggedIn, saveRedirectUrl, isOwner, isReviewAuthor)
│   ├── validation.js      (validateListing, validateReview, validateSignup, validateLogin)
│   ├── csrf.js            (attachCsrfToken, verifyCsrf, isMultipartListingUploadRoute, csrfProtection)
│   ├── upload.js          (uploadListingImage: Multer + CloudinaryStorage + 5MB/format checks)
│   ├── rateLimit.js       (loginRateLimiter, signupRateLimiter, authRateLimitMiddleware)
│   ├── security.js        (securityHeadersMiddleware with CSP nonce, attachLocals)
│   └── error.js           (notFoundHandler, createErrorHandler)
├── routes/
│   ├── index.js           (central router: GET / redirect + mounts listing, review, and user routers)
│   ├── listing.js         (listing CRUD routes)
│   ├── review.js          (review create/delete routes with mergeParams)
│   └── user.js            (signup, login, logout routes)
└── ...
```

---

## 2. Files Created, Modified, and Removed

### Created
- [`middleware/index.js`](file:///e:/Working%20Project/Airbnb/middleware/index.js) — barrel export aggregating all middleware modules.
- [`middleware/auth.js`](file:///e:/Working%20Project/Airbnb/middleware/auth.js) — [`isLoggedIn`](file:///e:/Working%20Project/Airbnb/middleware/auth.js#L6-L15), [`saveRedirectUrl`](file:///e:/Working%20Project/Airbnb/middleware/auth.js#L17-L22), [`isOwner`](file:///e:/Working%20Project/Airbnb/middleware/auth.js#L24-L48), and [`isReviewAuthor`](file:///e:/Working%20Project/Airbnb/middleware/auth.js#L50-L77).
- [`middleware/validation.js`](file:///e:/Working%20Project/Airbnb/middleware/validation.js) — [`validateListing`](file:///e:/Working%20Project/Airbnb/middleware/validation.js#L5-L18), [`validateReview`](file:///e:/Working%20Project/Airbnb/middleware/validation.js#L20-L30), [`validateSignup`](file:///e:/Working%20Project/Airbnb/middleware/validation.js#L32-L43), and [`validateLogin`](file:///e:/Working%20Project/Airbnb/middleware/validation.js#L45-L55).
- [`middleware/csrf.js`](file:///e:/Working%20Project/Airbnb/middleware/csrf.js) — [`isValidCsrfToken`](file:///e:/Working%20Project/Airbnb/middleware/csrf.js#L6-L19), [`attachCsrfToken`](file:///e:/Working%20Project/Airbnb/middleware/csrf.js#L21-L27), [`verifyCsrf`](file:///e:/Working%20Project/Airbnb/middleware/csrf.js#L29-L51), [`isMultipartListingUploadRoute`](file:///e:/Working%20Project/Airbnb/middleware/csrf.js#L53-L65), and [`csrfProtection`](file:///e:/Working%20Project/Airbnb/middleware/csrf.js#L68-L73).
- [`middleware/upload.js`](file:///e:/Working%20Project/Airbnb/middleware/upload.js) — [`uploadListingImage`](file:///e:/Working%20Project/Airbnb/middleware/upload.js#L37-L78) (`MulterError`, `ExpressError`, and image corruption error mapping; `5 MB` max, `1` file, PNG/JPG/JPEG/WEBP filter).
- [`middleware/rateLimit.js`](file:///e:/Working%20Project/Airbnb/middleware/rateLimit.js) — [`loginRateLimiter`](file:///e:/Working%20Project/Airbnb/middleware/rateLimit.js#L7-L12), [`signupRateLimiter`](file:///e:/Working%20Project/Airbnb/middleware/rateLimit.js#L14-L19), and [`authRateLimitMiddleware`](file:///e:/Working%20Project/Airbnb/middleware/rateLimit.js#L21-L32).
- [`middleware/security.js`](file:///e:/Working%20Project/Airbnb/middleware/security.js) — [`securityHeadersMiddleware`](file:///e:/Working%20Project/Airbnb/middleware/security.js#L4-L41) and [`attachLocals`](file:///e:/Working%20Project/Airbnb/middleware/security.js#L43-L49).
- [`middleware/error.js`](file:///e:/Working%20Project/Airbnb/middleware/error.js) — [`notFoundHandler`](file:///e:/Working%20Project/Airbnb/middleware/error.js#L4-L6) and [`createErrorHandler`](file:///e:/Working%20Project/Airbnb/middleware/error.js#L8-L27).
- [`routes/index.js`](file:///e:/Working%20Project/Airbnb/routes/index.js) — central route mount point (`GET /` → `/listings`, `/listings`, `/listings/:id/reviews`, and `/` user routes).

### Modified
- [`app.js`](file:///e:/Working%20Project/Airbnb/app.js) — simplified to app factory/export wiring `config/*`, `middleware/*`, and `routes/`.
- [`routes/listing.js`](file:///e:/Working%20Project/Airbnb/routes/listing.js) — updated middleware import from `../middleware.js` to `../middleware`.
- [`routes/review.js`](file:///e:/Working%20Project/Airbnb/routes/review.js) — updated middleware import from `../middleware.js` to `../middleware`.
- [`routes/user.js`](file:///e:/Working%20Project/Airbnb/routes/user.js) — updated middleware import to `../middleware` and replaced inline login format guard with [`validateLogin`](file:///e:/Working%20Project/Airbnb/middleware/validation.js#L45-L55).

### Removed
- `middleware.js` *(root monolith cleanly superseded by `middleware/*.js`)*

*(Unchanged in Phase 3B: `config/*`, `server.js`, `package.json`, `controllers/*`, `models/*`, `schema.js`, `utils/*`, `views/*`, `public/*`, `init/*`.)*

---

## 3. Updated Import Paths

| Consumer File | Previous Import | Updated Import |
| :--- | :--- | :--- |
| [`app.js`](file:///e:/Working%20Project/Airbnb/app.js#L11-L20) | `./middleware.js` + inline handlers/routers | `./middleware` + `./routes` (`routes/index.js`) |
| [`routes/listing.js`](file:///e:/Working%20Project/Airbnb/routes/listing.js#L4-L10) | `../middleware.js` | `../middleware` |
| [`routes/review.js`](file:///e:/Working%20Project/Airbnb/routes/review.js#L4-L8) | `../middleware.js` | `../middleware` |
| [`routes/user.js`](file:///e:/Working%20Project/Airbnb/routes/user.js#L5-L9) | `../middleware.js` + inline login check | `../middleware` (adds `validateLogin`) |

---

## 4. Middleware Registration Order (in [`app.js`](file:///e:/Working%20Project/Airbnb/app.js#L29-L64))

1. Disable `x-powered-by` & conditional production `trust proxy`
2. [`securityHeadersMiddleware`](file:///e:/Working%20Project/Airbnb/middleware/security.js#L4-L41) — generates per-request `res.locals.cspNonce`, sets CSP & security headers (+ HSTS in prod)
3. Body parsers (`express.urlencoded`, `express.json`)
4. `methodOverride("_method")` *(runs before CSRF/rate-limit so `?_method=PUT`/`DELETE` resolves cleanly)*
5. `express.static("public")` & `ejs-mate` view engine setup
6. MongoDB-backed `express-session` ([`createSessionOptions`](file:///e:/Working%20Project/Airbnb/config/session.js#L48-L74)) & `connect-flash`
7. [`configurePassport(app)`](file:///e:/Working%20Project/Airbnb/config/passport.js#L5-L16) (`passport.initialize()` + `passport.session()`)
8. [`attachLocals`](file:///e:/Working%20Project/Airbnb/middleware/security.js#L43-L49) (`success`, `error`, `currUser`, `safeJson`)
9. [`attachCsrfToken`](file:///e:/Working%20Project/Airbnb/middleware/csrf.js#L21-L27)
10. [`authRateLimitMiddleware`](file:///e:/Working%20Project/Airbnb/middleware/rateLimit.js#L21-L32) (`POST /login` & `POST /signup` rate limiters before CSRF check)
11. [`csrfProtection`](file:///e:/Working%20Project/Airbnb/middleware/csrf.js#L68-L73) (global CSRF verification; defers multipart `/listings` `POST` and `/listings/:id` `PUT` to route-level post-Multer [`verifyCsrf`](file:///e:/Working%20Project/Airbnb/middleware/csrf.js#L29-L51))
12. [`routes/index.js`](file:///e:/Working%20Project/Airbnb/routes/index.js) (`GET /`, `/listings`, `/listings/:id/reviews`, `/`)
13. [`notFoundHandler`](file:///e:/Working%20Project/Airbnb/middleware/error.js#L4-L6) (404 `ExpressError`)
14. [`createErrorHandler(isProduction)`](file:///e:/Working%20Project/Airbnb/middleware/error.js#L8-L27) (uncommitted Cloudinary file cleanup, `CastError` → `400`, production `5xx` masking, sanitized error logs, `error.ejs` render)

### Preserved Route-Level Ordering
- **Listings ([`routes/listing.js`](file:///e:/Working%20Project/Airbnb/routes/listing.js#L14-L47)):**
  - `GET /new` stays before `GET /:id`.
  - `POST /listings`: `isLoggedIn` → `uploadListingImage` → `verifyCsrf` → `validateListing` → `createListing`.
  - `PUT /listings/:id`: `isLoggedIn` → `isOwner` → `uploadListingImage` → `verifyCsrf` → `validateListing` → `updateListing`.
  - `DELETE /listings/:id`: `isLoggedIn` → `isOwner` → `destroyListing`.
- **Reviews ([`routes/review.js`](file:///e:/Working%20Project/Airbnb/routes/review.js#L1-L29)):** `mergeParams: true` preserved (`POST /`, `DELETE /:reviewId` with `isLoggedIn`, `validateReview`/`isReviewAuthor`).
- **Users ([`routes/user.js`](file:///e:/Working%20Project/Airbnb/routes/user.js#L13-L37)):** `validateLogin` → `saveRedirectUrl` → `passport.authenticate` → `login`; `POST /logout` preserved.

---

## 5. Preserved Security Controls & Verification Matrix

| Security Feature | Verification Mode | Actual Result |
| :--- | :--- | :---: |
| Security headers & disabled `X-Powered-By` | Unit (`verify_phase3b_unit.js`) + Live HTTP (`verify_phase3b_live.js`) | **PASS** |
| CSP & per-request nonce rotation | Unit + Live HTTP (`verify_phase3b_live.js`) | **PASS** |
| CSRF on unsafe methods (`POST`/`PUT`/`DELETE`) | Unit + Live HTTP (`403` without token) | **PASS** |
| CSRF + zero-leak Cloudinary cleanup on multipart | Live HTTP + Cloudinary API check (`0` leaked assets) | **PASS** |
| Login & signup rate limiting | Live HTTP (`POST /login` & `POST /signup` hit `429`) | **PASS** |
| Session cookie hardening (`HttpOnly`, `SameSite=Lax`) & Atlas persistence | Live HTTP across requests | **PASS** |
| Passport local auth & `redirectUrl` preservation | Live HTTP (`GET /listings/new` → `/login` → `POST /login`) | **PASS** |
| Ownership & review author guards (`isOwner`, `isReviewAuthor`) | Live HTTP (User B blocked from User A listing; A blocked from B review) | **PASS** |
| Joi & login input validation (`validateListing`, `validateLogin`, `validateSignup`, `validateReview`) | Unit + Live HTTP | **PASS** |
| Multer MIME/extension/5MB upload validation & replacement/delete Cloudinary cleanup | Live HTTP + Cloudinary resource check | **PASS** |
| Safe Mapbox rendering & XSS escaping | Unit (`map.js` DOM check) + Live HTML check (`safeJson` + `mapToken`) | **PASS** |
| Sanitized prod error masking & zero secret/credential logging | Unit (`createErrorHandler(true)`) + Live server stdout inspection | **PASS** |

---

## 6. Executed Verification Runs

1. **Static Syntax Check (`node --check` across all workspace `.js` files):** **PASS** (`exit 0`, including all `config/`, `middleware/`, `routes/`, `controllers/`, `models/`, `utils/`, `app.js`, `server.js`).
2. **Unit Tests (Isolated / Mocked `MongoStore` in offline sandbox):**
   - Existing Phase 3A Unit Suite (`verify_phase3a_unit.js`): **PASS** (`exit 0`) — verified `config/*`, `app.js` zero auto-listen/DB connect on import (offline `MemoryStore` stub for `MongoStore.create`), `show.ejs`, `map.js`.
   - Phase 3B Unit Suite (`verify_phase3b_unit.js`): **PASS** (`exit 0`) — verified `middleware.js` removed, all `middleware/*.js` & `routes/index.js` exports, CSRF timing-safe & multipart deferral logic, `validateReview` & `validateLogin`, `securityHeadersMiddleware`, production 500 error masking, and clean `app.js` import (`MemoryStore` stub).
3. **Live Integration Tests (Unmocked, against Express 5, MongoDB Atlas, Cloudinary, Mapbox):**
   - Phase 3B Live Suite via `npm start` (`verify_phase3b_live.js`, port `8080`): **PASS** (`exit 0`) — covered `GET /` → `/listings`, `/listings`, rotating CSP nonces, `404` error page, signup/login/logout, session cookies & persistence, `redirectUrl`, `validateLogin`, multipart CSRF `403` + bad `.txt` `400` + negative price `400` with `0` leaked Cloudinary uploads, Mapbox geocoding + `show.ejs` `mapToken`/`mapListing` JSON serialization + `</script>` escaping, cross-user `isOwner`/`isReviewAuthor` blocks, review CRUD through `mergeParams`, Cloudinary asset replacement & deletion cleanup, cascade review deletion, and `POST /login` + `POST /signup` `429` rate limiting.
   - Existing Phase 3A Live Suite (`verify_phase3a_live.js`): **PASS** (`exit 0`) — re-verified unmocked `require("./app.js")` without DB/port binding, startup failures (missing `SECRET`, invalid `PORT`, bad MongoDB URI, `EADDRINUSE`), and full CRUD/auth flow via `node server.js`.
   - Graceful Startup & Shutdown Check (`server.js` `startServer()` + HTTP `200` + `shutdown("SIGTERM", 0)` on port `8088`): **PASS** (`exit 0`).

*(Note on prior test scripts: earlier Phase 2 scratch scripts referenced pre-3A/3B paths `cloudConfig.js`, root `middleware.js`, and direct `node app.js` startup; all Phase 2 security behaviors were re-verified through the Phase 3B live suite above. Live GUI Chrome DevTools verification remains outside automated terminal execution until inspected in a browser with remote debugging enabled.)*

---

## 7. Regressions & Remaining Technical Debt

- **Behavioral Regressions Found:** **None** across executed static, unit, and live integration suites.
- **Remaining Technical Debt (intentionally outside Phase 3B scope):**
  - **Controller / Business Logic Extraction (Phase 3C):** Controllers (`controllers/listings.js`, `reviews.js`, `users.js`) still execute Mongoose queries, flash messages, and HTTP redirects directly with no service layer.
  - **Existing Incomplete Features:** `updateListing` still does not re-geocode edited `location`; navbar search and index category filters remain UI placeholders; `/privacy` and `/terms` routes are unimplemented.
  - **Rate-Limit Persistence & View Styles:** Auth rate limiting uses an in-memory per-process `Map`; minor inline styles remain in `views/listings/index.ejs`, `edit.ejs`, and `views/include/navbar.ejs`.

---

## 8. Scope Confirmation

- **Phase 3C was NOT started:** No service layer was created, no database queries were moved out of controllers, models and `schema.js` were not rewritten, EJS templates and CSS styling were not redesigned, and no new dependencies or application features were introduced.

