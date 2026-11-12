# Wanderlust — Phase 3D.3 Report (User Profile & Dashboard)

**Phase:** Phase 3D.3 — User Profile & Dashboard  
**Status:** Completed & Verified *(Git checkpoint: `Phase 3D.3 completed`; pre-Phase 3D.3 baseline at `96977d4`)*

---

## 1. Files Created & Modified

| File | Role & Key Changes |
| :--- | :--- |
| [`models/user.js`](file:///e:/Working%20Project/Airbnb/models/user.js) | Added backwards-compatible optional profile fields (`displayName`, `bio`, `location` with trimmed length caps) and `{ timestamps: true }`, keeping `passport-local-mongoose` authentication and existing Atlas user records intact. |
| [`schema.js`](file:///e:/Working%20Project/Airbnb/schema.js#L31-L36) | Added Joi `profileUpdateSchema` (`email` required, optional `displayName`, `bio`, `location`, strict unknown-field rejection). |
| [`middleware/validation.js`](file:///e:/Working%20Project/Airbnb/middleware/validation.js#L60-L76) | Added `validateProfileUpdate` middleware stripping `_csrf`, validating inputs against `profileUpdateSchema`, and flashing errors back to `/profile`. |
| [`utils/listingOptions.js`](file:///e:/Working%20Project/Airbnb/utils/listingOptions.js#L111-L143) | Extracted shared pure helpers `computeReviewStats()` and `resolveCategoryMeta()` so listing details and user dashboard share one canonical implementation without cross-service coupling. |
| [`services/listingService.js`](file:///e:/Working%20Project/Airbnb/services/listingService.js) | Imports `computeReviewStats` and `resolveCategoryMeta` from `utils/listingOptions.js` while keeping all existing exports backwards-compatible. |
| [`services/userService.js`](file:///e:/Working%20Project/Airbnb/services/userService.js) | Added `toSafeUserProfile()`, `getUserProfile()`, `updateUserProfile()`, and `getUserDashboard()`. Enforces ObjectId checks, `-hash -salt` projections, immutable `username`/`hash`/`salt` boundaries, partial-update field preservation, legacy `joinedAt` ObjectId timestamp fallback, inverse `Listing.find({ reviews: { $in: authoredReviewIds } })` parent-listing resolution, and aggregate dashboard metrics cleanly without Express or Passport dependencies. |
| [`controllers/users.js`](file:///e:/Working%20Project/Airbnb/controllers/users.js#L81-L120) | Added HTTP-only `renderProfile`, `updateProfile`, and `renderDashboard` actions delegating to `userService`, flashing validation/expected errors, and preserving clean MVC layering with zero direct Mongoose calls. |
| [`routes/user.js`](file:///e:/Working%20Project/Airbnb/routes/user.js#L35-L41) | Added authenticated routes `GET /profile`, `PUT /profile` (`isLoggedIn` -> `validateProfileUpdate` -> `wrapAsync(updateProfile)`), and `GET /dashboard` (`isLoggedIn` -> `wrapAsync(renderDashboard)`). |
| [`views/users/profile.ejs`](file:///e:/Working%20Project/Airbnb/views/users/profile.ejs) *(new)* | Responsive account profile overview sidebar (`@username`, display name, bio, location, member-since date, hosted listings & reviews count) paired with a CSRF-protected `PUT /profile?_method=PUT` form with read-only username and Bootstrap validation. |
| [`views/users/dashboard.ejs`](file:///e:/Working%20Project/Airbnb/views/users/dashboard.ejs) *(new)* | Responsive host/guest dashboard featuring KPI cards (`My Listings`, `Reviews Received`, `Host Avg. Rating`, `Reviews Written`), **My Listings** cards with category badges, prices, ratings, and View/Edit/CSRF-Delete actions, plus **My Reviews** cards linked to parent listings with CSRF-Delete controls and empty-state CTAs. |
| [`views/include/navbar.ejs`](file:///e:/Working%20Project/Airbnb/views/include/navbar.ejs#L74-L89) | Added authenticated `Dashboard` (`/dashboard`) and `@<%= currUser.username %>` Profile (`/profile`) navigation links while preserving guest signup/login links and CSRF-protected `POST /logout`. |
| [`public/css/style.css`](file:///e:/Working%20Project/Airbnb/public/css/style.css#L279-L315) | Added responsive styles for `.profile-avatar`, `.account-card`, `.dashboard-stat-card`, `.dashboard-item-card`, `.dashboard-thumb`, and `.dashboard-thumb-fallback`. |

---

## 2. Security & Boundary Verification

- **Strict Authentication & Account Isolation:** Unauthenticated requests to `/profile`, `PUT /profile`, and `/dashboard` redirect to `/login` (`isLoggedIn` saves `redirectUrl` on `GET` requests). Controllers scope every lookup strictly to `req.user._id`, preventing cross-user access to private account emails or dashboards.
- **Immutable Session Identity:** `passport-local-mongoose` binds sessions by `username`; `profileUpdateSchema` and `userService.updateUserProfile()` reject attempts to mutate `username`, `hash`, `salt`, or `_id`, preserving session integrity and salted PBKDF2 credentials.
- **Projection & Template Safety:** `userService` explicitly projects `"-hash -salt"` and builds explicit `toSafeUserProfile` DTOs; EJS templates use HTML-escaped `<%= ... %>`, CSRF `_csrf` hidden tokens on all forms, and zero inline `on*` attributes under strict CSP.

---

## 3. Test Execution & Results

> **Environment Note:** Unit suites and `node --check` ran inside the sandbox. Live Express 5 + MongoDB Atlas + Cloudinary + Mapbox suites ran with `BypassSandbox: true` after sandboxed attempts encountered `querySrv ETIMEOUT _mongodb._tcp.majorproject.z4iosg5.mongodb.net`.

### A. Static & Unit Suites *(Offline / Mocked)*
1. **`node --check` Syntax Validation:** **PASS (`exit 0`)** on `models/user.js`, `schema.js`, `middleware/validation.js`, `utils/listingOptions.js`, `services/listingService.js`, `services/userService.js`, `controllers/users.js`, and `routes/user.js`.
2. **`verify_phase3d3_unit.js`:** **PASS (`exit 0`)**
   - Architectural isolation (`controllers/users.js` free of direct model imports/logging; `services/userService.js` free of Express/Passport dependencies).
   - Joi `profileUpdateSchema` & `validateProfileUpdate` trimming, `_csrf` stripping, invalid/unexpected field rejections.
   - `userService.getUserProfile`, `updateUserProfile` (partial-field preservation, allowlist rejection before DB hits, `ObjectId` fallback `joinedAt`), and `getUserDashboard` (weighted rating aggregation, inverse listing lookup for authored reviews, orphan review safety, `-hash -salt` projection).
   - `profile.ejs`, `dashboard.ejs`, and `navbar.ejs` compilation, empty & populated rendering, XSS escaping, CSRF tokens, and CSP inline-handler check.
3. **Prior Unit Suites (`verify_phase3a_unit.js`, `verify_phase3b_unit.js`, `verify_phase3c5_unit.js`, `verify_phase3d1_unit.js`, `verify_phase3d2_unit.js`):** **ALL PASS (`exit 0`)**.

### B. Live Integration Suites *(Unmocked Express 5 + Atlas + Cloudinary + Mapbox)*
1. **`verify_phase3d3_live.js` (isolated port `61539`):** **PASS (`exit 0`)**
   - Auth redirect checks for unauthenticated `/profile` & `/dashboard`, plus post-login `redirectUrl` restoration back to `/dashboard`.
   - CSRF `403` enforcement on `PUT /profile?_method=PUT`.
   - Unexpected field injection block (`username`) + valid persistent `displayName`, `email`, `location`, and `bio` update with zero `hash`/`salt` exposure.
   - Multi-user dashboard accuracy (`My Listings`, weighted `Host Avg. Rating` `4.5`, authored review parent-listing links) and strict cross-user privacy isolation (zero leakage of other users' private emails or unowned edit controls).
   - Full Atlas & Cloudinary fixture cleanup verified (`listings: 1, users: 4, reviews: 0`).
2. **Existing Live Regression Suites (all PASS, `exit 0`):**
   - `verify_phase3d2_live.js`
   - `verify_phase3d1_live.js`
   - `verify_phase3c3_live.js`
   - `verify_phase3b_regression_live.js`

---

**Ready for your review and approval to proceed to Phase 3D.4 (Privacy Policy & Terms and Conditions).**
