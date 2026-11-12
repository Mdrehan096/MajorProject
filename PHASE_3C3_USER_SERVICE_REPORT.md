# Wanderlust — Phase 3C.3 User Service Layer Extraction Report

**Date:** 2026-11-12  
**Baseline State Confirmed:** Git commit `32d45df` (`Phase 3B route and middleware modularization completed`) with Phase 3C.1 (`controllers/listings.js`, `services/listingService.js`, `PHASE_3C1_LISTING_SERVICE_REPORT.md`), Phase 3C.2 + security verification (`controllers/reviews.js`, `services/reviewService.js`, `middleware/auth.js`, `PHASE_3C2_REVIEW_SERVICE_REPORT.md`, `PHASE_3C2_SECURITY_VERIFICATION.md`), and pre-existing whitespace formatting in [`package.json`](file:///e:/Working%20Project/Airbnb/package.json) preserved untouched.  
**Scope:** Phase 3C.3 ONLY — extract user-related business logic and Mongoose operations from [`controllers/users.js`](file:///e:/Working%20Project/Airbnb/controllers/users.js) into [`services/userService.js`](file:///e:/Working%20Project/Airbnb/services/userService.js).

---

## 1. Architecture & Responsibilities

### Architecture Preserved
`Routes → Middleware → Controllers → Services → Models`

### Before Phase 3C.3
- [`controllers/users.js`](file:///e:/Working%20Project/Airbnb/controllers/users.js) directly imported [`models/user.js`](file:///e:/Working%20Project/Airbnb/models/user.js), instantiated `new User({ email, username })`, and invoked `User.register(newUser, password)` inline inside the `signup` controller alongside HTTP session (`req.login`), flash messaging, and redirects.

### After Phase 3C.3
- **Routes ([`routes/user.js`](file:///e:/Working%20Project/Airbnb/routes/user.js#L1-L33)):** Preserved URLs (`/signup`, `/login`, `POST /logout`), HTTP verbs, `validateSignup`, `validateLogin`, `saveRedirectUrl`, Passport `passport.authenticate("local", { failureRedirect: "/login", failureFlash: true })`, and `wrapAsync`.
- **Passport Configuration ([`config/passport.js`](file:///e:/Working%20Project/Airbnb/config/passport.js#L1-L21)):** Kept `LocalStrategy(User.authenticate())`, `serializeUser`, `deserializeUser`, and middleware registration outside the service layer.
- **Controller ([`controllers/users.js`](file:///e:/Working%20Project/Airbnb/controllers/users.js#L1-L54)):** Responsible strictly for HTTP concerns — rendering signup/login EJS views, passing `{ username, email, password }` to [`services/userService.js`](file:///e:/Working%20Project/Airbnb/services/userService.js), handling signup validation/duplicate error flashes and `/signup` redirect, establishing Passport sessions via `req.login`, enforcing safe local `redirectUrl` targets on `login`, clearing sessions via `req.logout`, and zero console logging of user data.
- **Service ([`services/userService.js`](file:///e:/Working%20Project/Airbnb/services/userService.js#L1-L50)):** Owns user input validation/sanitization, field allowlisting, `User` model instantiation and `User.register` persistence (preserving `passport-local-mongoose` salted PBKDF2 hashing and `UserExistsError` contract), and sanitized user lookup helpers (`findUserById`, `findUserByUsername`) projecting out `-hash -salt` — without HTTP objects, Passport session hooks, or a repository layer.

---

## 2. Files Created and Modified

### Created
- [`services/userService.js`](file:///e:/Working%20Project/Airbnb/services/userService.js) — dedicated user service layer.
- [`PHASE_3C3_USER_SERVICE_REPORT.md`](file:///e:/Working%20Project/Airbnb/PHASE_3C3_USER_SERVICE_REPORT.md) — Phase 3C.3 architecture and verification report.

### Modified
- [`controllers/users.js`](file:///e:/Working%20Project/Airbnb/controllers/users.js) — removed direct [`models/user.js`](file:///e:/Working%20Project/Airbnb/models/user.js) import and inline `new User` / `User.register` persistence; delegates registration to [`userService.registerUser`](file:///e:/Working%20Project/Airbnb/services/userService.js#L5-L28).

### Preserved Untouched in Phase 3C.3
- [`services/listingService.js`](file:///e:/Working%20Project/Airbnb/services/listingService.js), [`services/reviewService.js`](file:///e:/Working%20Project/Airbnb/services/reviewService.js), [`controllers/listings.js`](file:///e:/Working%20Project/Airbnb/controllers/listings.js), [`controllers/reviews.js`](file:///e:/Working%20Project/Airbnb/controllers/reviews.js), [`package.json`](file:///e:/Working%20Project/Airbnb/package.json), [`models/user.js`](file:///e:/Working%20Project/Airbnb/models/user.js), [`schema.js`](file:///e:/Working%20Project/Airbnb/schema.js), `routes/*`, `middleware/*`, `config/*`, `utils/*`, `views/*`, `public/*`, [`app.js`](file:///e:/Working%20Project/Airbnb/app.js), and [`server.js`](file:///e:/Working%20Project/Airbnb/server.js).

---

## 3. Service API Reference ([`services/userService.js`](file:///e:/Working%20Project/Airbnb/services/userService.js))

| Function | Signature | Behavior & Return / Error Contract |
| :--- | :--- | :--- |
| [`registerUser`](file:///e:/Working%20Project/Airbnb/services/userService.js#L5-L28) | `(payload)` | Validates `payload` is a non-null, non-array object with non-empty string `username`, `email`, and non-empty string `password` (throwing `ExpressError(400, "Username, email, and password are required.")` otherwise). Trims `username` and `email` while keeping `password` untrimmed (matching `signupSchema`), allowlists only `{ username, email }`, and returns `User.register(newUser, password)` (preserving `passport-local-mongoose` salted PBKDF2 hashing and `UserExistsError` duplicate rejections). |
| [`findUserById`](file:///e:/Working%20Project/Airbnb/services/userService.js#L30-L36) | `(userId)` | Validates `userId` with `mongoose.Types.ObjectId.isValid`; throws `ExpressError(400, "Invalid User ID")` on invalid values; queries `User.findById(userId).select("-hash -salt")`. |
| [`findUserByUsername`](file:///e:/Working%20Project/Airbnb/services/userService.js#L38-L44) | `(username)` | Returns `null` when `username` is non-string or blank; otherwise queries `User.findOne({ username: username.trim() }).select("-hash -salt")`. |

---

## 4. Refactored Controller & Security Summary ([`controllers/users.js`](file:///e:/Working%20Project/Airbnb/controllers/users.js#L1-L54))

- [`renderSignupForm`](file:///e:/Working%20Project/Airbnb/controllers/users.js#L3-L5) / [`renderLoginForm`](file:///e:/Working%20Project/Airbnb/controllers/users.js#L30-L32) — unchanged view rendering (`users/signup.ejs`, `users/login.ejs`).
- [`signup`](file:///e:/Working%20Project/Airbnb/controllers/users.js#L7-L28) — calls [`userService.registerUser({ username, email, password })`](file:///e:/Working%20Project/Airbnb/services/userService.js#L5-L28) inside `try/catch`; on registration failure flashes `e.message` and redirects `/signup`; on success establishes Passport login session via `req.login`, forwards session errors to `next(err)`, flashes `"welcome to wanderlust"`, and redirects `/listings`.
- [`login`](file:///e:/Working%20Project/Airbnb/controllers/users.js#L34-L44) — flashes `"welcome back to wanderlust"` and validates `res.locals.redirectUrl` starts with `/` and not `//`, falling back to `"/listings"`.
- [`logout`](file:///e:/Working%20Project/Airbnb/controllers/users.js#L46-L54) — invokes `req.logout`, forwards errors to `next(err)`, flashes `"you are logged out"`, and redirects `"/listings"`.

### Authentication & Security Contracts Verified
- **Password Hashing & Field Hygiene:** `passport-local-mongoose` generates per-user random `salt` and PBKDF2 `hash`; spoofed `hash`/`salt` properties in input payloads are ignored by `registerUser`; lookup helpers project `"-hash -salt"`.
- **Validation & NoSQL Guard:** `validateSignup` (`signupSchema`) rejects invalid emails/missing fields before controller execution; `validateLogin` blocks non-string JSON operator payloads (e.g. `{ $ne: "" }`); `registerUser` independently enforces object/string invariants (including rejecting `null` and `[]`).
- **Session, CSRF & Rate Limiting:** `HttpOnly` + `SameSite=Lax` cookies, CSRF enforcement (`403` without `_csrf` on `POST /signup`, `POST /login`, `POST /logout`), `GET /logout` `404`, and `429` rate limiting on `POST /login` and `POST /signup` all remain intact.
- **No Sensitive Logging:** Neither [`controllers/users.js`](file:///e:/Working%20Project/Airbnb/controllers/users.js) nor [`services/userService.js`](file:///e:/Working%20Project/Airbnb/services/userService.js) logs user objects, emails, passwords, salts, or hashes.

---

## 5. Verification Results

### 1. Static Syntax Check *(sandbox)*
- Executed `node --check` across every `.js` file in the workspace (excluding `node_modules`/`.git`): **PASS (`exit 0`, `SYNTAX_CHECK_OK`)**.

### 2. Isolated Unit Tests *(offline sandbox; mocked Mongoose/external modules where noted)*
- `verify_phase3a_unit.js`: **PASS (`exit 0`)** — config layout, `env.js`, `session.js`, `cloudinary.js`, `mapbox.js`, `app.js` import safety (`MemoryStore` stub), `show.ejs` & `map.js`.
- `verify_phase3b_unit.js`: **PASS (`exit 0`)** — modular `middleware/*`, `routes/index.js`, CSRF, validation, security headers, production error masking.
- `verify_phase3c1_unit.js`: **PASS (`exit 0`)** — listing service & controller unit suite (mocked Mongoose/Mapbox/Cloudinary stubs).
- `verify_phase3c2_unit.js`: Exited on line 24 (`"Phase 3C.3 userService.js must NOT be created in Phase 3C.2"`), an intentional Phase 3C.2 phase-gate assertion; `verify_phase3c2_regression_unit.js` (same functional assertions updated for `services/userService.js` existence): **PASS (`exit 0`)** — confirmed `reviewService`, `controllers/reviews.js`, and `isReviewAuthor` parent listing/membership rules remain intact.
- `verify_phase3c3_unit.js`: **PASS (`exit 0`)** — verified [`controllers/users.js`](file:///e:/Working%20Project/Airbnb/controllers/users.js) and [`services/userService.js`](file:///e:/Working%20Project/Airbnb/services/userService.js) boundaries and behavior with mocked `User` / `userService` stubs:
  - Architectural checks (controller does not import `models/user`; zero `console.log`; service stays free of `passport`, `req.flash`, and `res.redirect`).
  - `registerUser` validation (`undefined`, `null`, `[]`, `{}`, blank strings, `$ne` object, numeric password -> `ExpressError(400)`), trimming of `username`/`email`, preservation of password spaces, allowlisting against spoofed `hash`/`salt`, and `UserExistsError` propagation.
  - `findUserById` invalid-input checks (`400`) and `findUserById`/`findUserByUsername` `-hash -salt` projection checks.
  - Controller `renderSignupForm`, `renderLoginForm`, `signup` (`req.login` + flash + `/listings`), signup service failure (no `req.login`, error flash + `/signup`), `req.login` error forwarding to `next(err)`, open-redirect rejection on `login`, and `logout` session/error/flash behavior.

### 3. Live Integration Tests *(unmocked against Express 5, MongoDB Atlas, Cloudinary, Mapbox)*
- Initial sandbox runs blocked outbound Atlas SRV DNS (`querySrv ETIMEOUT _mongodb._tcp.majorproject.z4iosg5.mongodb.net`), so both live suites were executed outside the sandbox on dynamically allocated isolated ports (preserving any pre-existing user servers untouched):
  - `verify_phase3c3_live.js` on isolated port `64640`: **PASS (`exit 0`)**
    - Confirmed Express 5 startup and MongoDB Atlas connection (`Connected to DB`, `Server running on port 64640`).
    - Verified CSRF `403` enforcement on `POST /signup` and `POST /login`.
    - Verified Joi `validateSignup` rejects invalid email (`302` `/signup`, no user written).
    - Verified valid signup creates Atlas `User` with salted PBKDF2 `hash` + `salt` (never plaintext password), auto-logs in session with `HttpOnly` + `SameSite=Lax` cookies, and never exposes `email`, `salt`, or `hash` in rendered HTML.
    - Verified duplicate username signup flashes error and redirects `/signup`.
    - Verified `GET /logout` stays `404`, CSRF-less `POST /logout` returns `403`, and CSRF-valid `POST /logout` clears session + flashes `"you are logged out"`.
    - Verified `validateLogin` blocks JSON `{ $ne: "" }`, wrong password redirects `/login`, and valid login restores safe saved `redirectUrl` (`/listings/new`).
    - Verified end-to-end listing creation (Mapbox geocoding + Cloudinary upload), review creation by a second user, and cascade listing deletion + Cloudinary cleanup remain unaffected.
    - Verified `POST /login` and `POST /signup` `429` rate limiting and zero credentials/emails/hashes/salts in server logs.
  - `verify_phase3c2_security_live.js` on isolated port `64666`: **PASS (`exit 0`)**
    - Confirmed zero regression on cross-listing review deletion protections (author blocked from deleting own review through another listing's URL or nonexistent listing URL; direct `reviewService.deleteReview(listingB, review1)` throws `404`; author can delete via the true listing URL).

---

## 6. Regressions & Scope Confirmation

- **Behavioral Regressions Found:** **None** across static syntax, unit suites, and live integration/security suites.
- **Explicit Scope Confirmation:**
  - **Phase 3C.4 / Phase 3D was NOT started.**
  - [`services/listingService.js`](file:///e:/Working%20Project/Airbnb/services/listingService.js), [`services/reviewService.js`](file:///e:/Working%20Project/Airbnb/services/reviewService.js), and [`package.json`](file:///e:/Working%20Project/Airbnb/package.json) were not modified in Phase 3C.3.
  - No dependencies, schema edits, Passport strategy refactors, frontend edits, or repository layer were introduced.

