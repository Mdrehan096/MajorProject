# Wanderlust — Phase 2 Security Hardening & Final Gap Verification Report

**Date:** 2026-11-11  
**Scope:** Phase 2 security hardening, gap verification (Rate Limiting, Content Security Policy, Browser Verification), and live verification against Express (`port 8080`), MongoDB Atlas, Cloudinary, and Mapbox.  
**Modified / Added Application Files:**
- `app.js`
- `cloudConfig.js`
- `middleware.js`
- `schema.js`
- `controllers/listings.js`
- `controllers/reviews.js`
- `controllers/users.js`
- `routes/listing.js`
- `routes/review.js`
- `routes/user.js`
- `public/js/map.js`
- `utils/safeJson.js` *(new)*
- `utils/cloudinaryCleanup.js` *(new)*
- `utils/rateLimiter.js` *(new)*
- `views/layout/boilerplate.ejs`
- `views/include/navbar.ejs`
- `views/users/login.ejs`
- `views/users/signup.ejs`
- `views/listings/new.ejs`
- `views/listings/edit.ejs`
- `views/listings/show.ejs`
- `views/listings/index.ejs`

*(Project folder structure, EJS SSR architecture, MongoDB schemas, and package dependencies remain intact with zero external packages installed.)*

---

## 1. Phase 2 Requirement Classification Summary

| Requirement | Status | Summary of Implementation & Verification Evidence |
| :--- | :---: | :--- |
| **Remove Sensitive Data Exposure** | **PASS** | Removed `console.log(registeredUser)` in `controllers/users.js` and debug document/body dumps across `controllers/listings.js`, `controllers/reviews.js`, `middleware.js`, and `app.js`. Sanitized store/DB/error logs; live server logs verified free of emails, passwords, salts, hashes, and tokens. |
| **Prevent XSS & PII Data Leakage** | **PASS** | `showListing` projects only `username` on `owner`/`reviews.author` and builds minimal `mapListing` (`{ title, geometry }`). Added `utils/safeJson.js` (`</script>`/Unicode breakout protection), DOM `textContent` + `setDOMContent` in `public/js/map.js`, and authorship checks on review Delete UI. Audited all `<%-` tags. Verified in isolated EJS/VM tests and live HTTP responses. |
| **Secure File Uploads & Cloudinary Cleanup** | **PASS** | Fixed `allowedFormat` → `allowed_formats` in `cloudConfig.js`; added Multer MIME/extension `fileFilter` (`png`/`jpg`/`jpeg`/`webp`) and `5MB` size limit in `middleware.js`. Added `utils/cloudinaryCleanup.js` to purge failed post-upload CSRF/Joi/geocoding uploads, purge replaced images only after DB save, clean up on delete, and skip shared/seed images (`Listing.exists` guard). Verified directly via Cloudinary API in live tests. |
| **CSRF Protection & Endpoint Hardening** | **PASS** | Added zero-dependency session-backed synchronizer token CSRF (`attachCsrfToken`, `verifyCsrf` using `crypto.timingSafeEqual`) across URL-encoded, `method-override`, and multipart upload routes. Added `_csrf` inputs to all mutating EJS forms, converted `GET /logout` → `POST /logout`, removed debug routes (`/session-test`, `/check-session`, `/test`), hardened session cookies & Joi/type guards. Verified via unit + live HTTP tests. |
| **Authentication Rate Limiting (`POST /login`, `POST /signup`)** | **PASS** | Implemented reusable zero-dependency `createRateLimiter` in `utils/rateLimiter.js` and applied `loginRateLimiter` (`10` req / `15m`) & `signupRateLimiter` (`10` req / `15m`) in `app.js` / `middleware.js`. Verified normal auth succeeds while repeated attempts trigger HTTP `429` with `RateLimit-*` & `Retry-After` headers (unaffected by `X-Forwarded-For` spoofing). |
| **Content Security Policy (`CSP`)** | **PASS** | Enabled per-request cryptographic nonce (`res.locals.cspNonce`) and `Content-Security-Policy` in `app.js` covering `'self'`, Bootstrap CDN, FontAwesome CDN, Mapbox (`api.mapbox.com`, `*.tiles.mapbox.com`, `events.mapbox.com`, `blob:` workers, `'wasm-unsafe-eval'`), Cloudinary (`res.cloudinary.com`), and Unsplash (`images.unsplash.com`, `plus.unsplash.com`), without `'unsafe-inline'` or `'unsafe-eval'` in `script-src`. Verified across live HTTP pages. *(Live browser evaluation remains BLOCKED — see Section 4).* |
| **Real Browser Verification** | **BLOCKED** | Chrome remote debugging (`DevToolsActivePort`) is unavailable in this environment (`DevToolsActivePort: false`). Live console errors, visual Mapbox rendering, and live browser CSP violation reports could not be executed in Chrome. |
| **Distributed Rate-Limit Store / CSP `report-uri` / Strict Nonce-Only `style-src`** | **NOT IMPLEMENTED** | Out of Phase 2 single-process scope: rate limit state is in-memory per Node process, no CSP violation reporting collector endpoint is configured, and `style-src` retains `'unsafe-inline'` for Mapbox GL JS v3 dynamic styles and Bootstrap compatibility (deferred cleanly beyond Phase 2). |

---

## 2. Detailed Implementation Review

### A. Rate Limiting (`POST /login` & `POST /signup`)
- **Gap Found:** `routes/user.js` previously had no request throttling on `POST /login` or `POST /signup`.
- **Implementation:**
  - Created [`utils/rateLimiter.js`](file:///e:/Working%20Project/Airbnb/utils/rateLimiter.js) exporting `createRateLimiter({ windowMs, max, keyPrefix, message, keyGenerator })` with automatic expired-bucket pruning (`cleanupTimer.unref()`), IPv6-mapped IPv4 normalization (`::ffff:127.0.0.1` → `127.0.0.1`), `RateLimit-Limit`, `RateLimit-Remaining`, `RateLimit-Reset`, and `Retry-After` headers returning `ExpressError(429, message)`.
  - Configured `loginRateLimiter` and `signupRateLimiter` in [`middleware.js`](file:///e:/Working%20Project/Airbnb/middleware.js) (defaulting to `10` requests per `15` minutes per IP per route scope) and mounted them early in [`app.js`](file:///e:/Working%20Project/Airbnb/app.js) on `POST /login` and `POST /signup`.
- **Verification Evidence:**
  - Unit tests passed in `verify_phase2_unit.js`: verified request threshold enforcement, `429` + `Retry-After` response headers, independent buckets per scope and per IP, and window reset recovery.
  - Live integration tests passed in `verify_phase2_live.js` (Test 8): verified normal signup and login succeed while under the cap, and repeated requests on both `POST /signup` and `POST /login` trigger HTTP `429` even with spoofed `X-Forwarded-For` headers.

### B. Content Security Policy (`CSP`)
- **Gap Found:** `app.js` set `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, `X-DNS-Prefetch-Control`, and conditional `HSTS`, but had no `Content-Security-Policy` header.
- **Implementation ([`app.js`](file:///e:/Working%20Project/Airbnb/app.js), [`views/listings/show.ejs`](file:///e:/Working%20Project/Airbnb/views/listings/show.ejs), [`views/listings/index.ejs`](file:///e:/Working%20Project/Airbnb/views/listings/index.ejs)):**
  - Generates a fresh 16-byte cryptographic nonce per HTTP request (`res.locals.cspNonce`).
  - Sets `Content-Security-Policy`:
    - `default-src 'self'`
    - `script-src 'self' 'nonce-<per-request-nonce>' 'wasm-unsafe-eval' https://cdn.jsdelivr.net https://api.mapbox.com` *(strictly excludes `'unsafe-inline'` and `'unsafe-eval'`; includes `'wasm-unsafe-eval'` only for Mapbox Standard style WebAssembly)*
    - `style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net https://cdnjs.cloudflare.com https://api.mapbox.com` *(required by Mapbox GL JS v3 dynamic style insertion and existing inline styling without `'nonce-...'` overriding `'unsafe-inline'`)*
    - `font-src 'self' data: https://cdnjs.cloudflare.com https://cdn.jsdelivr.net`
    - `img-src 'self' data: blob: https://res.cloudinary.com https://images.unsplash.com https://plus.unsplash.com https://*.mapbox.com https://*.tiles.mapbox.com`
    - `connect-src 'self' https://api.mapbox.com https://*.tiles.mapbox.com https://events.mapbox.com https://cdn.jsdelivr.net`
    - `worker-src 'self' blob:` and `child-src 'self' blob:`
    - `object-src 'none'`, `base-uri 'self'`, `form-action 'self'`, `frame-ancestors 'self'`
  - Attached `nonce="<%= typeof cspNonce !== 'undefined' ? cspNonce : '' %>"` to the two inline `<script>` elements in `views/listings/show.ejs` and `views/listings/index.ejs`.
- **Verification Evidence:**
  - Live HTTP verification in `verify_phase2_live.js` asserted CSP headers, absence of `'unsafe-inline'`/`'unsafe-eval'` in `script-src`, presence of all Mapbox/Cloudinary/Unsplash/Bootstrap/FontAwesome allowlists, per-request nonce rotation across consecutive requests, and exact nonce/origin compliance for every `<script>` element on `/listings`, `/login`, `/signup`, and `/listings/:id`.

### C. Raw EJS Tag (`<%- ... %>`) Audit
1. [`views/layout/boilerplate.ejs`](file:///e:/Working%20Project/Airbnb/views/layout/boilerplate.ejs): `<%- include("../include/navbar.ejs") %>`, `<%- include("../include/flash.ejs") %>`, `<%- include("../include/footer.ejs") %>`, `<%- body %>` — `ejs-mate` layout/partial composition; user values inside templates use HTML-escaped `<%= ... %>`.
2. [`views/listings/show.ejs`](file:///e:/Working%20Project/Airbnb/views/listings/show.ejs): `<%- safeJson(...) %>` for `mapToken` and `mapListing` inside the nonced inline `<script>` — necessary so JSON quotes are not entity-escaped (`&#34;`), while [`safeJson`](file:///e:/Working%20Project/Airbnb/utils/safeJson.js) escapes `<`, `>`, `&`, `/`, `\u2028`, and `\u2029`.

### D. Changed or Removed Endpoints (Rationale)
- **`GET /logout` → `POST /logout` ([`routes/user.js`](file:///e:/Working%20Project/Airbnb/routes/user.js), [`views/include/navbar.ejs`](file:///e:/Working%20Project/Airbnb/views/include/navbar.ejs)):** Prevents logout CSRF via third-party `GET` requests (`<img src="/logout">`); preserved logout functionality via CSRF-protected navbar `<form method="POST" action="/logout">`.
- **Removed `/session-test`, `/check-session`, `/test` ([`app.js`](file:///e:/Working%20Project/Airbnb/app.js)):** Unauthenticated debug endpoints that mutated/exposed session data and logged arbitrary `POST` bodies.

---

## 3. Executed Test Suites & Actual Results

1. **Syntax Checks (`node --check`):** **PASS** (`exit 0` across all modified/added `.js` files).
2. **Isolated Unit & Template Suite (`verify_phase2_unit.js`):** **PASS** (`ALL PHASE 2 UNIT CHECKS PASSED`) — verified `safeJson`, audited all `<%-` tags in `views/`, tested `show.ejs` PII removal + XSS neutralization + review authorship controls, tested `public/js/map.js` DOM safety in Node VM (`textContent` + `setDOMContent`, no `setHTML`), tested `cloudConfig.js` `allowed_formats`, CSRF timing-safe checks + Joi validation, `utils/cloudinaryCleanup.js` reference checks, and `utils/rateLimiter.js` window/scope/IP behavior.
3. **Live Integration Security Suite (`verify_phase2_live.js`, against live Express + MongoDB Atlas + Cloudinary + Mapbox):** **PASS** (`ALL PHASE 2 LIVE INTEGRATION SECURITY CHECKS PASSED`):
   - **Test 1:** Verified HTTP security headers, CSP headers/nonces/script tags across pages, disabled `X-Powered-By`, `/js/script.js` presence, removal of `/js/map.js` from index, and removal of debug routes + `GET /logout`.
   - **Test 2:** Verified `POST /signup` CSRF enforcement (`403` without token, `302` with token), `HttpOnly` + `SameSite=Lax` cookies, and zero credential/hash/salt/email logging in server stdout/stderr.
   - **Test 3:** Verified `POST /logout` (`403` without token, `302` with token) and `POST /login` (`403` without token, `302` with token).
   - **Test 4:** Verified rejection (`400`) of `.txt`, `.svg`, MIME-spoofed `evil.html`, `>5MB` PNG, and corrupted-byte PNG uploads.
   - **Test 5:** Verified multipart `POST /listings` CSRF rejection (`403`) and Joi validation rejection (`400`, negative price) leave `0` leaked files in Cloudinary (verified directly via `cloudinary.api.resources`).
   - **Test 6:** Verified XSS payload escaping on `GET /listings/:id`, zero owner/reviewer email or unnecessary ID leaks, `GET` vs author review Delete rendering, review CSRF (`403`), and non-owner multipart `PUT` blocking prior to upload.
   - **Test 7:** Verified text-only `PUT` preserves image, failed `PUT` preserves old image and deletes new failed upload, successful replacement deletes old Cloudinary image only after save, authorized review deletion (`DELETE` with CSRF), cascade review deletion on listing deletion, and shared-image reference protection (`Listing.exists`) preventing premature Cloudinary deletion.
   - **Test 8:** Verified legitimate signup under limit succeeds cleanly, then repeated `POST /signup` and `POST /login` requests trigger HTTP `429` + `Retry-After` regardless of spoofed `X-Forwarded-For` headers. All temporary test records and Cloudinary images were cleaned up.

---

## 4. Blocked Tests & Reasons

| Check | Status | Reason & Observed Evidence |
| :--- | :---: | :--- |
| **Live Browser Verification (Homepage, Listing Index, Listing Details + Mapbox Map, Login/Signup Forms, Create/Edit Listing, Reviews, Browser Console Errors, Browser CSP Violations, Blocked Network Resource Inspection)** | **BLOCKED** | Chrome remote debugging (`chrome://inspect/#remote-debugging`) is not active on this machine. Earlier `browser` subagent check (`3d7ae8db-bff0-4662-b302-3d2d51afb07c`) failed with `ENOENT: C:\Users\MD REHAN\AppData\Local\Google\Chrome\User Data\DevToolsActivePort`, and direct verification confirmed `DevToolsActivePort: false`. |

---

## 5. Phase 2 Approval Readiness

- **Backend, Auth, CSRF, XSS, Upload Cleanup, Rate Limiting & Server-Side CSP:** Verified **PASS** via syntax, unit, template, and live integration tests against Express, MongoDB Atlas, Cloudinary, and Mapbox.
- **Browser Runtime Verification:** Marked **BLOCKED** until the application is opened in a live Chrome instance with remote debugging enabled (or manually inspected in Chrome DevTools Console & Network tabs).
- **Phase 3 Work:** Not started; project folder structure remains intact.

