# Wanderlust Project Analysis & Functionality Audit

**Project Name (Workspace / App):** Wanderlust (`package.json` name: `majorproject`, `README.md`: `#UrbanStay`)  
**Audit Scope:** Complete static inspection of backend, frontend, database schemas, middleware, configuration, security, code quality, and MVC architecture.  
**Audit Mode:** Read-only analysis — no existing source files were modified, deleted, or refactored.

---

## 1. Project Overview

**Wanderlust** is a server-rendered full-stack accommodation listing web application (an Airbnb-style clone) built with **Node.js**, **Express 5**, **MongoDB/Mongoose**, and **EJS** (`ejs-mate`). Users can browse property listings, inspect property details with an interactive Mapbox map and star-rated user reviews, sign up and log in with session-based authentication, create new listings with Cloudinary image uploads and Mapbox forward geocoding, edit/delete listings they own, and post/delete reviews.

At the same time, the audit reveals that the codebase is currently in a **learning/prototype state** with several critical runtime bugs (missing `ExpressError` imports in controllers, broken review cascade deletion, broken client-side validation script loading, silent flash message typos), incomplete UI features (non-functional search bar, static decorative category filters, missing `/privacy` and `/terms` pages), and significant architectural/security gaps (no CSRF protection, XSS vectors in `show.ejs` and `map.js`, unrestricted Cloudinary upload parameter typo, debug endpoints in `app.js`, and tight coupling between routes, models, views, and third-party SDKs).

---

## 2. Technology Stack

| Layer | Technology / Package | Version (`package.json`) | Purpose in Project |
| :--- | :--- | :--- | :--- |
| **Runtime** | Node.js (CommonJS) | `v24.13.1` (`engines.node`) | Server execution environment |
| **Web Framework** | `express` | `^5.2.1` | HTTP routing, middleware pipeline, SSR rendering |
| **View Engine** | `ejs`, `ejs-mate` | `^5.0.1`, `^4.0.0` | Server-side HTML templating & layout inheritance |
| **Database & ODM** | `mongoose` (MongoDB Atlas) | `^9.3.1` | Document modeling, schemas, queries, populate |
| **Session & Flash** | `express-session`, `connect-mongo`, `connect-flash` | `^1.19.0`, `^6.0.0`, `^0.1.1` | Persistent MongoDB-backed sessions & flash alerts |
| **Authentication** | `passport`, `passport-local`, `passport-local-mongoose` | `^0.7.0`, `^1.0.0`, `^9.1.0` | Username/password authentication & PBKDF2 hashing |
| **Validation** | `joi` | `^18.1.2` | Request payload validation (`schema.js`) |
| **File Uploads** | `multer`, `multer-storage-cloudinary`, `cloudinary` | `^2.1.1`, `^4.0.0`, `^1.41.3` | Multipart parsing & streaming image uploads to Cloudinary |
| **Maps & Geocoding** | `@mapbox/mapbox-sdk`, Mapbox GL JS (CDN) | `^0.16.2`, `v3.24.0` | Server-side forward geocoding & client-side map display |
| **HTTP Utilities** | `method-override`, `dotenv`, `cookie-parser` | `^3.0.0`, `^17.4.2`, `^1.4.7` | `_method` overrides for PUT/DELETE; env vars (`cookie-parser` is unused) |
| **Frontend UI (CDN)** | Bootstrap CSS/JS, Font Awesome CSS, Starability CSS | `5.3.8` + `5.3.0`, `7.0.1` | Responsive layout, icons, star-rating sprites |

---

## 3. Complete Folder Structure

Excluding `node_modules/` and `.git/`, the project contains the following files and directories:

```text
e:\Working Project\Airbnb\
├── .env                        # Environment variables (secret values redacted)
├── .gitignore                  # Ignores .env and node_modules/
├── README.md                   # Contains "#UrbanStay"
├── package.json                # Dependencies and project metadata
├── package-lock.json           # Dependency lockfile
├── app.js                      # Express server entrypoint, middleware, session, DB init
├── cloudConfig.js              # Cloudinary SDK & Multer CloudinaryStorage config
├── middleware.js               # Auth, ownership, and Joi validation middleware
├── schema.js                   # Joi validation schemas (listingSchema, reviewSchema)
├── controllers/
│   ├── listings.js             # Listing CRUD + Mapbox geocoding handlers
│   ├── reviews.js              # Review creation & deletion handlers
│   └── users.js                # Signup, login, logout handlers
├── init/
│   ├── data.js                 # 29 sample listing objects (seed dataset)
│   └── index.js                # Standalone DB seeding script (connects to local MongoDB)
├── models/
│   ├── listing.js              # Listing Mongoose schema + post-delete middleware
│   ├── review.js               # Review Mongoose schema
│   └── user.js                 # User Mongoose schema with passport-local-mongoose plugin
├── public/
│   ├── css/
│   │   ├── rating.css          # Starability slot & result CSS with inline base64 sprites
│   │   └── style.css           # Global application styles
│   └── js/
│       ├── map.js              # Client-side Mapbox GL JS map and marker popup script
│       └── script.js           # Bootstrap form validation script (currently unreferenced)
├── routes/
│   ├── listing.js              # Express router mounted at /listings
│   ├── review.js               # Express router mounted at /listings/:id/reviews
│   └── user.js                 # Express router mounted at /
├── utils/
│   ├── ExpressError.js         # Custom Error subclass with HTTP statusCode & message
│   └── wrapAsync.js            # Async route wrapper forwarding rejected promises to next()
└── views/
    ├── error.ejs               # Error page template
    ├── include/
    │   ├── flash.ejs           # Flash success/error alert partial
    │   ├── footer.ejs          # Footer partial
    │   └── navbar.ejs          # Top navigation bar + search bar partial + inline CSS
    ├── layout/
    │   └── boilerplate.ejs     # Master HTML layout template (ejs-mate)
    ├── listings/
    │   ├── edit.ejs            # Edit listing form
    │   ├── index.ejs           # Listings gallery + category filters + GST toggle
    │   ├── new.ejs             # Create new listing form
    │   └── show.ejs            # Listing details, owner controls, reviews, Mapbox map
    └── users/
        ├── login.ejs           # Login form
        └── signup.ejs          # Registration form
```

---

## 4. File-by-File Responsibilities

### Root Configuration & Entry Files
- [`app.js`](file:///e:/Working%20Project/Airbnb/app.js): Application entrypoint. Overrides Node DNS servers (`8.8.8.8`, `8.8.4.4`), loads `.env` in non-production, initializes Express, configures `ejs-mate`, body parsers, `method-override`, static assets, MongoDB session store (`connect-mongo`), `express-session`, `connect-flash`, Passport `LocalStrategy`, `res.locals` injection, route mounting, MongoDB connection, debug test routes (`/session-test`, `/check-session`, `/test`), 404 handler, global error handler, and HTTP listener on port `8080`.
- [`cloudConfig.js`](file:///e:/Working%20Project/Airbnb/cloudConfig.js): Configures `cloudinary.v2` from environment variables and exports `CloudinaryStorage` configured for folder `wanderlust_DEV`.
- [`middleware.js`](file:///e:/Working%20Project/Airbnb/middleware.js): Exports route guards (`isLoggedIn`, `saveRedirectUrl`, `isOwner`, `isReviewAuthor`) and Joi payload validators (`validateListing`, `validateReview`).
- [`schema.js`](file:///e:/Working%20Project/Airbnb/schema.js): Exports Joi validation schemas `listingSchema` and `reviewSchema`.
- [`package.json`](file:///e:/Working%20Project/Airbnb/package.json): Defines Node engine (`v24.13.1`), project metadata (`main: "index.js"`, which does not exist; actual entry is `app.js`), and dependencies. Contains no `start` or `dev` scripts and no test runner.
- [`.env`](file:///e:/Working%20Project/Airbnb/.env): Stores environment variable keys `CLOUD_NAME`, `CLOUD_API_KEY`, `CLOUD_API_SECRET`, `MAP_TOKEN`, `ATLASDB_URL`, `SECRET` (all secret values redacted).
- [`.gitignore`](file:///e:/Working%20Project/Airbnb/.gitignore): Excludes `.env` and `node_modules/`.
- [`README.md`](file:///e:/Working%20Project/Airbnb/README.md): Single-line file containing `#UrbanStay`.

### Routes (`routes/`)
- [`routes/listing.js`](file:///e:/Working%20Project/Airbnb/routes/listing.js): Defines RESTful endpoints for listings (`/`, `/new`, `/:id`, `/:id/edit`), integrates Multer (`upload.single('listing[image]')`), `isLoggedIn`, `isOwner`, and `validateListing`. Contains unused imports (`Listing`, `mongoose`).
- [`routes/review.js`](file:///e:/Working%20Project/Airbnb/routes/review.js): Merged-param router (`{ mergeParams: true }`) for `POST /` and `DELETE /:reviewId` under `/listings/:id/reviews`. Contains unused imports (`ExpressError`, `Review`, `Listing`, `mongoose`).
- [`routes/user.js`](file:///e:/Working%20Project/Airbnb/routes/user.js): Defines authentication routes (`/signup`, `/login`, `/logout`). Contains unused import (`User`).

### Controllers (`controllers/`)
- [`controllers/listings.js`](file:///e:/Working%20Project/Airbnb/controllers/listings.js): Implements `index`, `renderNewForm`, `showListing`, `createListing`, `renderEditForm`, `updateListing`, and `destroyListing`, plus Mapbox geocoding client initialization. References `ExpressError` in 7 places without importing it.
- [`controllers/reviews.js`](file:///e:/Working%20Project/Airbnb/controllers/reviews.js): Implements `createReview` and `destroyReview`. References `ExpressError` in 2 places without importing it.
- [`controllers/users.js`](file:///e:/Working%20Project/Airbnb/controllers/users.js): Implements `renderSignupForm`, `signup`, `renderLoginForm`, `login`, and `logout`.

### Models (`models/`)
- [`models/listing.js`](file:///e:/Working%20Project/Airbnb/models/listing.js): Defines `Listing` schema (`title`, `description`, `image`, `price`, `location`, `country`, `reviews`, `owner`, `geometry`) and a `findOneAndDelete` post-hook intended to cascade-delete reviews. Contains an unused `joi` import.
- [`models/review.js`](file:///e:/Working%20Project/Airbnb/models/review.js): Defines `Review` schema (`comment`, `rating`, `createdAt`, `author`).
- [`models/user.js`](file:///e:/Working%20Project/Airbnb/models/user.js): Defines `User` schema (`email`) and attaches `passport-local-mongoose` plugin for `username`, `hash`, `salt`, and authentication helpers.

### Utilities (`utils/`)
- [`utils/ExpressError.js`](file:///e:/Working%20Project/Airbnb/utils/ExpressError.js): Custom `Error` subclass accepting `(statusCode, message)`.
- [`utils/wrapAsync.js`](file:///e:/Working%20Project/Airbnb/utils/wrapAsync.js): Higher-order wrapper `(fn) => (req, res, next) => fn(req, res, next).catch(next)`.

### Seed / Initialization (`init/`)
- [`init/data.js`](file:///e:/Working%20Project/Airbnb/init/data.js): Exports `data` array of 29 sample listings with Unsplash image URLs (missing `geometry` field required by `Listing` schema).
- [`init/index.js`](file:///e:/Working%20Project/Airbnb/init/index.js): Connects directly to local `mongodb://127.0.0.1:27017/wanderlust`, wipes all listings, assigns a hardcoded `owner` ObjectId (`6a185fcfefe3a2edc604ad2f`), and runs `Listing.insertMany`.

### Views (`views/`) & Public Assets (`public/`)
- [`views/layout/boilerplate.ejs`](file:///e:/Working%20Project/Airbnb/views/layout/boilerplate.ejs): Master layout shell containing header links, navbar include, container with flash include + `<%- body %>`, footer include, Bootstrap JS, and `/js/map.js`.
- [`views/include/navbar.ejs`](file:///e:/Working%20Project/Airbnb/views/include/navbar.ejs): Sticky navbar with brand icon, Explore link, search form, "Airbnb your Home" link, and auth links (`sign up`, `log in`, `log out`).
- [`views/include/footer.ejs`](file:///e:/Working%20Project/Airbnb/views/include/footer.ejs): Static social icons, copyright line, and `/privacy` + `/terms` links.
- [`views/include/flash.ejs`](file:///e:/Working%20Project/Airbnb/views/include/flash.ejs): Bootstrap dismissible alert renderer for `success` and `error` locals.
- [`views/error.ejs`](file:///e:/Working%20Project/Airbnb/views/error.ejs): Generic error view displaying `message` and a "Go Back" button.
- [`views/listings/index.ejs`](file:///e:/Working%20Project/Airbnb/views/listings/index.ejs): Category filter bar, GST toggle switch, and 3-column responsive grid of listing cards.
- [`views/listings/show.ejs`](file:///e:/Working%20Project/Airbnb/views/listings/show.ejs): Listing details card, conditional Edit/Delete buttons, conditional review submission form, review cards list, and `#map` container.
- [`views/listings/new.ejs`](file:///e:/Working%20Project/Airbnb/views/listings/new.ejs): Multipart listing creation form.
- [`views/listings/edit.ejs`](file:///e:/Working%20Project/Airbnb/views/listings/edit.ejs): Multipart listing edit form with scaled preview of current image.
- [`views/users/login.ejs`](file:///e:/Working%20Project/Airbnb/views/users/login.ejs): Username + password login form.
- [`views/users/signup.ejs`](file:///e:/Working%20Project/Airbnb/views/users/signup.ejs): Username + email + password registration form.
- [`public/css/style.css`](file:///e:/Working%20Project/Airbnb/public/css/style.css): Styles for sticky footer layout, navbar, cards, buttons, and `#map`.
- [`public/css/rating.css`](file:///e:/Working%20Project/Airbnb/public/css/rating.css): Starability rating widget and display styles.
- [`public/js/map.js`](file:///e:/Working%20Project/Airbnb/public/js/map.js): Instantiates Mapbox GL map and marker popup using global `mapToken` and `listing`.
- [`public/js/script.js`](file:///e:/Working%20Project/Airbnb/public/js/script.js): Bootstrap `.needs-validation` submit listener (not imported in any view).

---

## 5. Existing Features

| # | Feature Name | Description & User Interaction | Implementation Location | Route | Controller / Function | Model / Collection | EJS View | Status |
| :-: | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | **Home Redirect** | Redirects root `/` directly to `/listings`. | `app.js` | `GET /` | Inline handler | N/A | N/A | **Fully Working** |
| 2 | **User Registration** | Renders signup form; registers user via `User.register()`, logs user in automatically, redirects to `/listings`. | `routes/user.js`, `controllers/users.js`, `models/user.js` | `GET /signup`, `POST /signup` | `renderSignupForm`, `signup` | `User` (`users`) | `views/users/signup.ejs` | **Partially Working** (Flash uses typo `"sucess"`, so welcome banner never appears; missing `next` param in `signup` crashes if `req.login` errors; no email uniqueness or password strength validation) |
| 3 | **User Login & Redirect Back** | Renders login form; authenticates credentials via Passport LocalStrategy; restores pre-login `redirectUrl` or defaults to `/listings`. | `routes/user.js`, `controllers/users.js`, `middleware.js` | `GET /login`, `POST /login` | `renderLoginForm`, `login` (`saveRedirectUrl`) | `User` (`users`), `sessions` | `views/users/login.ejs` | **Partially Working** (Auth works; flash uses typo `"sucess"` so welcome banner never appears; `redirectUrl` fails if original protected request was `POST`/`PUT`/`DELETE`) |
| 4 | **User Logout** | Calls `req.logout()`, flashes `"success"`, redirects to `/listings`. | `routes/user.js`, `controllers/users.js` | `GET /logout` | `logout` | `sessions` | Triggered from `navbar.ejs` | **Partially Working** (Functional, but uses `GET` instead of `POST`, exposing logout to CSRF) |
| 5 | **Session Management** | Persists Express sessions in MongoDB Atlas (`connect-mongo`) encrypted via `SECRET`, 7-day `httpOnly` cookie. | `app.js` | Global middleware | `express-session` + `MongoStore` | `sessions` | N/A | **Fully Working** (Missing `secure`/`sameSite` cookie hardening; debug routes `/session-test` & `/check-session` still exposed) |
| 6 | **Browse All Listings** | Fetches all documents from `Listing.find({})` and displays cards with image, title, and nightly INR price. | `routes/listing.js`, `controllers/listings.js` | `GET /listings` | `index` | `Listing` (`listings`) | `views/listings/index.ejs` | **Fully Working** (Crashes if a listing lacks `price`; no pagination; loads `/js/map.js` causing console `ReferenceError`) |
| 7 | **Tax / GST Toggle** | Client-side switch reveals `+18% GST` label beside each listing price. | `views/listings/index.ejs` | N/A (client-only) | Inline `<script>` | N/A | `views/listings/index.ejs` | **Partially Working** (Toggles static text `+18% GST`, does not calculate actual 18% total price as label "Display total after taxes" implies) |
| 8 | **Listing Details View** | Displays listing image, owner username, description, price, location, country, reviews, and Mapbox map. | `routes/listing.js`, `controllers/listings.js` | `GET /listings/:id` | `showListing` | `Listing`, `Review`, `User` | `views/listings/show.ejs` | **Partially Working** (Works for valid listings with geometry & owner; crashes with `ReferenceError: ExpressError is not defined` + `ERR_HTTP_HEADERS_SENT` if listing not found or invalid ID; crashes if `listing.owner` or `review.author` is null) |
| 9 | **Create Listing & Image Upload & Geocoding** | Authenticated user submits title, description, price, country, location, and image file; Multer streams file to Cloudinary; Mapbox geocodes `location` into GeoJSON Point; saves listing with `owner`. | `routes/listing.js`, `controllers/listings.js`, `cloudConfig.js`, `middleware.js` | `GET /listings/new`, `POST /listings` | `renderNewForm`, `createListing` | `Listing` (`listings`) | `views/listings/new.ejs` | **Partially Working** (Works on happy path with valid image + geocodable location; crashes if `req.file` missing or Mapbox returns 0 features; `allowedFormat` typo allows any file format; image uploaded before Joi validation runs) |
| 10 | **Edit & Update Listing** | Owner opens pre-populated edit form showing `w_250` resized image preview and submits updates (optionally replacing image). | `routes/listing.js`, `controllers/listings.js`, `middleware.js` | `GET /listings/:id/edit`, `PUT /listings/:id` | `renderEditForm`, `updateListing` | `Listing` (`listings`) | `views/listings/edit.ejs` | **Partially Working** (Does NOT re-geocode when `location` changes; does not delete old Cloudinary image; `isOwner` crashes on null listing or invalid ID; textarea pre-fills extra leading spaces) |
| 11 | **Delete Listing** | Owner deletes listing via `?_method=DELETE`. | `routes/listing.js`, `controllers/listings.js`, `models/listing.js` | `DELETE /listings/:id` | `destroyListing` | `Listing`, `Review` | `views/listings/show.ejs` | **Partially Working** (Deletes listing document, but cascade delete of reviews fails due to `listingSchema.reviews` bug; orphaned Cloudinary image is not deleted) |
| 12 | **Create Review & Star Rating** | Logged-in user selects 1–5 star rating and comment on listing page; review saved and referenced in `listing.reviews`. | `routes/review.js`, `controllers/reviews.js`, `middleware.js` | `POST /listings/:id/reviews` | `createReview` | `Review`, `Listing` | `views/listings/show.ejs` | **Partially Working** (Works on valid listing; `createdAt` defaults to server boot time due to `Date.now()`; crashes with `ReferenceError: ExpressError` on invalid/missing listing ID; client validation disabled) |
| 13 | **Delete Review** | Review author clicks Delete button on review card (`?_method=DELETE`); removes ID from `listing.reviews` and deletes `Review`. | `routes/review.js`, `controllers/reviews.js`, `middleware.js` | `DELETE /listings/:id/reviews/:reviewId` | `destroyReview` | `Review`, `Listing` | `views/listings/show.ejs` | **Partially Working** (Delete button visible to ALL visitors including non-authors/guests; `isReviewAuthor` crashes if review does not exist; does not verify `reviewId` belongs to listing `:id`) |
| 14 | **Map Integration** | Renders static Mapbox GL JS map centered on `listing.geometry.coordinates` with red marker and popup. | `controllers/listings.js`, `views/listings/show.ejs`, `public/js/map.js` | Embedded in `GET /listings/:id` | `createListing`, `showListing` | `Listing.geometry` | `views/listings/show.ejs` | **Partially Working** (Works on `show.ejs` for geocoded listings; `/js/map.js` loads on every page causing JS errors elsewhere; `<scrip>` typo in `show.ejs`; fails for seeded listings without `geometry`; non-interactive; stale after location edit) |
| 15 | **Flash Messages** | Stores one-time messages in `req.flash` and renders dismissible Bootstrap alerts via `res.locals`. | `app.js`, `views/include/flash.ejs` | All routes | `connect-flash` | `sessions` | `views/include/flash.ejs` | **Partially Working** (Works for `"success"` and `"error"` keys, broken on signup/login due to `"sucess"` typo) |
| 16 | **Error Handling** | Catches unhandled routes (`404`) and forwarded errors, rendering `error.ejs`. | `app.js`, `utils/ExpressError.js`, `utils/wrapAsync.js` | Fallback middleware | Global error handler | N/A | `views/error.ejs` | **Partially Working** (Catches errors, but `controllers/listings.js` and `controllers/reviews.js` fail to import `ExpressError`; `statusCode` is not rendered; raw error messages exposed) |
| 17 | **Search & Category Filtering** | Search input in navbar; 10 category filter icons on index page. | `views/include/navbar.ejs`, `views/listings/index.ejs` | None | None | None | `navbar.ejs`, `index.ejs` | **Incomplete / Non-Functional** (Purely static UI; search form has no `action`/`name`, filter icons have no links/listeners/backend query support) |
| 18 | **Privacy & Terms Pages** | Footer links to `/privacy` and `/terms`. | `views/include/footer.ejs` | None | None | None | None | **Incomplete / Missing** (Clicking either link returns `404 Page Not Found`) |

---

## 6. Backend Architecture

### Express Server Initialization & Middleware Execution Order (`app.js`)
The application boots synchronously around a single Express instance (`app`) in [`app.js`](file:///e:/Working%20Project/Airbnb/app.js):
1. **DNS & Env Initialization (lines 1–11):** Overrides global DNS resolvers to Google Public DNS (`8.8.8.8`, `8.8.4.4`) and calls `dotenv.config()` if `NODE_ENV !== "production"`.
2. **Core Express Middleware (lines 37–43):**
   - `express.urlencoded({ extended: true })` (parses nested form names like `listing[title]`, `review[rating]`)
   - `express.json()`
   - `methodOverride("_method")` (allows HTML forms using `POST` with `?_method=PUT` or `?_method=DELETE`)
   - `express.static(path.join(__dirname, "public"))`
   - `app.engine("ejs", ejsMate)` + `views` directory configuration
3. **Session & Flash Middleware (lines 48–73):**
   - `MongoStore` connects independently to `process.env.ATLASDB_URL` with encrypted session payloads (`crypto.secret: process.env.SECRET`, `touchAfter: 86400s`).
   - `session(sessionOptions)` sets cookie `httpOnly: true`, `maxAge: 7 days`.
   - `flash()` attaches `req.flash`.
4. **Passport Authentication Middleware (lines 75–80):**
   - `passport.initialize()` and `passport.session()`
   - Registers `LocalStrategy(User.authenticate())`, `User.serializeUser()`, `User.deserializeUser()`.
5. **View Locals Middleware (lines 82–87):**
   - Populates `res.locals.success`, `res.locals.error`, and `res.locals.currUser = req.user` on every request.
6. **Route Mounting (lines 91–134):**
   - `GET /` -> redirect `/listings`
   - `/listings` -> `listingRouter`
   - `/listings/:id/reviews` -> `reviewRouter`
   - `/` -> `userRouter`
   - Unprotected debug endpoints: `GET /session-test`, `GET /check-session`, `POST /test`
7. **Database Connection (lines 113–118):**
   - `mongoose.connect(db)` executes asynchronously *after* routes are registered and runs concurrently with `app.listen(8080)` (requests arriving before Atlas connects can fail or buffer).
8. **404 & Global Error Handler (lines 137–146):**
   - Catch-all middleware constructs `new ExpressError(404, "Page Not Found")`.
   - Error middleware logs `err` and runs `res.status(statusCode).render("error.ejs", { message })`.

### File Upload Flow (`multer` + `cloudConfig.js`)
1. `routes/listing.js` instantiates `upload = multer({ storage })` using `CloudinaryStorage`.
2. On `POST /listings` and `PUT /listings/:id`, `upload.single('listing[image]')` runs **before** `validateListing`.
3. `multer` parses multipart fields into `req.body` (with `null` prototype in Multer 2.x) and pipes the uploaded file stream directly to `cloudinary.uploader.upload_stream`.
4. `multer-storage-cloudinary` populates `req.file.path` (Cloudinary `secure_url`), `req.file.filename` (Cloudinary `public_id`), and `req.file.size`.
5. **Defect:** `cloudConfig.js` specifies `allowedFormat: ["png", "jpg", "jpeg"]`, whereas Cloudinary's `upload_stream` expects `allowed_formats` — so format restriction is ignored. Furthermore, because `upload.single` executes before `validateListing`, invalid form submissions still upload images to Cloudinary, leaking orphaned assets.

### Validation Logic (`schema.js` + `middleware.js`)
- `validateListing`: Extracts `req.body?.listing`, rejects missing `listing` object with `400`, validates via Joi `listingSchema`, and forwards errors to `next(new ExpressError(400, ...))`.
  - Gaps: `price` lacks `.min(0)`; `req.file` presence is not validated; `image: Joi.string().allow("")` mismatches multipart file uploads.
- `validateReview`: Validates entire `req.body` against `reviewSchema` (`review: { rating: 1..5, comment }`) and `throw`s `ExpressError(400, errMsg)` synchronously.
  - Gaps: `rating` allows floats (`3.7`); no string length caps; no Joi validation exists for user signup/login payloads.

### Error-Handling Mechanism
- Async errors in most routes are caught by `wrapAsync(fn)` (note: Express 5 natively catches rejected async route handlers, though `middleware.js` async guards `isOwner` and `isReviewAuthor` also rely on Express 5's native promise rejection handling since they are not wrapped in `wrapAsync`).
- **Critical Defect:** Both [`controllers/listings.js`](file:///e:/Working%20Project/Airbnb/controllers/listings.js) and [`controllers/reviews.js`](file:///e:/Working%20Project/Airbnb/controllers/reviews.js) throw `new ExpressError(...)` without importing `ExpressError` from `../utils/ExpressError.js`, causing `ReferenceError` (500) whenever invalid ObjectIds or missing listings trigger those branches.
- In `showListing`, missing `return` before `res.redirect("/listings")` causes double execution and `ERR_HTTP_HEADERS_SENT`.

---

## 7. Frontend Architecture

### Template Rendering & Layout System (`ejs-mate`)
- Configured via `app.engine("ejs", ejsMate)` in `app.js`.
- All page views declare `<% layout("/layout/boilerplate") %>` (except `error.ejs`, which uses `"layout/boilerplate"`).
- [`views/layout/boilerplate.ejs`](file:///e:/Working%20Project/Airbnb/views/layout/boilerplate.ejs) wraps every view with:
  - [`views/include/navbar.ejs`](file:///e:/Working%20Project/Airbnb/views/include/navbar.ejs)
  - `<div class="container">` containing [`views/include/flash.ejs`](file:///e:/Working%20Project/Airbnb/views/include/flash.ejs) and `<%- body %>`
  - [`views/include/footer.ejs`](file:///e:/Working%20Project/Airbnb/views/include/footer.ejs)

### Data Passing & Client Communication
- **Server -> Template:** Controllers pass explicit locals (`allListings`, `listing`, `originalImageUrl`), while `app.js` injects global `res.locals` (`success`, `error`, `currUser`).
- **Template -> Client JS:** `views/listings/show.ejs` embeds `process.env.MAP_TOKEN` and `<%- JSON.stringify(listing) %>` directly into global `<script>` variables consumed by `public/js/map.js`.
- **Client -> Server:** Standard HTML `<form>` submissions (`GET` / `POST`) and query-string method overrides (`?_method=PUT`, `?_method=DELETE`). There are no `fetch`/AJAX calls anywhere.

### CSS & Frontend JS Organization
- Global styles in [`public/css/style.css`](file:///e:/Working%20Project/Airbnb/public/css/style.css) and star rating CSS in [`public/css/rating.css`](file:///e:/Working%20Project/Airbnb/public/css/rating.css).
- Inline `<style>` blocks exist directly inside [`navbar.ejs`](file:///e:/Working%20Project/Airbnb/views/include/navbar.ejs) and [`index.ejs`](file:///e:/Working%20Project/Airbnb/views/listings/index.ejs).
- Inline `<script>` blocks exist inside [`index.ejs`](file:///e:/Working%20Project/Airbnb/views/listings/index.ejs) (tax toggle) and [`show.ejs`](file:///e:/Working%20Project/Airbnb/views/listings/show.ejs) (Mapbox variables).
- [`public/js/script.js`](file:///e:/Working%20Project/Airbnb/public/js/script.js) (Bootstrap `.needs-validation` handler) is **never loaded** in `boilerplate.ejs` or any view, leaving all forms with `novalidate` unvalidated on the client side.

### Duplicated Frontend Code & Inconsistent UI Patterns
- **Duplicate Bootstrap CSS CDN:** `boilerplate.ejs` loads Bootstrap `5.3.8` CSS in `<head>` (line 9) AND Bootstrap `5.3.0` CSS inside `<body>` (line 34).
- **Broken/Duplicate Map Script Loading:** `boilerplate.ejs` loads `/js/map.js` globally on *every* page (causing uncaught `ReferenceError: mapToken is not defined` on every page except `/listings/:id`), while `show.ejs` also attempts to load it via a misspelled `<scrip src="/js/map.js"></scrip>` tag.
- **Form Markup Inconsistencies:**
  - `new.ejs` and `edit.ejs` duplicate the entire listing form structure with `<label for="...">` attributes whose inputs have no matching `id` attributes; `edit.ejs` uses `col-md-4` + `col-md-4` (8/12 columns) vs `col-md-4` + `col-md-8` (12/12 columns) in `new.ejs`.
  - `edit.ejs` wraps `<%= listing.description %>` with newline and indentation inside `<textarea>`, prepending spaces on every edit.
- **Broken/Unused CSS Rules:**
  - `navbar.ejs` styles `.btn-search:hover`, while the button uses class `.search-btn`.
  - `index.ejs` omits `.listing-line` (defined in `style.css` to remove link underlines) and applies two separate `style=` attributes on `<img>`.
  - `style.css` sets `font-family: "Plus jakarta Sans"` without importing the font, uses invalid `align-items: space-evenly;` on `.f-info`, and sets `#map { width: 100vh; }` (viewport height instead of `100%`).
- **UI Authorization Mismatch:** `show.ejs` hides Edit/Delete listing buttons from non-owners, yet renders the Review Delete button on every review card regardless of user login or authorship.
- **Branding & Typos:** `"Wandurlust"` (`signup.ejs`), `"Airbnb your Home"` (`navbar.ejs`), `"#UrbanStay"` (`README.md`), `"wanderlust"` (`boilerplate.ejs`), `"castals"`, `"Amezing pools"`, `"Artic"` (`index.ejs`), `"Add a cachy title"` (`new.ejs`), `&copy:Wanderlust` (`footer.ejs`), mixed casing (`sign up`, `log in`, `Explore`).

---

## 8. Route and Controller Mapping

| HTTP Method | Full Route | Middleware Chain | Controller / Handler | Mongoose Model(s) | Response |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `GET` | `/` | Global middleware | Inline in `app.js` | None | `302 Redirect` -> `/listings` |
| `GET` | `/listings` | Global middleware | `listingsController.index` (`wrapAsync`) | `Listing.find({})` | `200` Render `listings/index.ejs` |
| `GET` | `/listings/new` | `isLoggedIn` | `listingsController.renderNewForm` | None | `200` Render `listings/new.ejs` (or `302` `/login`) |
| `POST` | `/listings` | `isLoggedIn` -> `upload.single('listing[image]')` -> `validateListing` | `listingsController.createListing` (`wrapAsync`) | `Listing` (create + save) | `302 Redirect` -> `/listings` with flash |
| `GET` | `/listings/:id` | Global middleware | `listingsController.showListing` (`wrapAsync`) | `Listing.findById` + populate `reviews.author`, `owner` | `200` Render `listings/show.ejs` (bugs on missing/invalid ID) |
| `GET` | `/listings/:id/edit` | `isLoggedIn` -> `isOwner` | `listingsController.renderEditForm` (`wrapAsync`) | `Listing.findById` (twice: `isOwner` + controller) | `200` Render `listings/edit.ejs` |
| `PUT` | `/listings/:id` | `isLoggedIn` -> `isOwner` -> `upload.single('listing[image]')` -> `validateListing` | `listingsController.updateListing` (`wrapAsync`) | `Listing.findById` (`isOwner`), `Listing.findByIdAndUpdate`, optional `.save()` | `302 Redirect` -> `/listings/:id` with flash |
| `DELETE` | `/listings/:id` | `isLoggedIn` -> `isOwner` | `listingsController.destroyListing` (`wrapAsync`) | `Listing.findById` (`isOwner`), `Listing.findByIdAndDelete` | `302 Redirect` -> `/listings` with flash |
| `POST` | `/listings/:id/reviews` | `isLoggedIn` -> `validateReview` | `reviewsController.createReview` (`wrapAsync`) | `Listing.findById`, `Review.save()`, `Listing.save()` | `302 Redirect` -> `/listings/:id` with flash |
| `DELETE` | `/listings/:id/reviews/:reviewId` | `isLoggedIn` -> `isReviewAuthor` | `reviewsController.destroyReview` (`wrapAsync`) | `Review.findById` (`isReviewAuthor`), `Listing.findByIdAndUpdate($pull)`, `Review.findByIdAndDelete` | `302 Redirect` -> `/listings/:id` with flash |
| `GET` | `/signup` | Global middleware | `usersController.renderSignupForm` | None | `200` Render `users/signup.ejs` |
| `POST` | `/signup` | Global middleware | `usersController.signup` (`wrapAsync`) | `User.register()` | `302 Redirect` -> `/listings` (or `/signup` on error) |
| `GET` | `/login` | Global middleware | `usersController.renderLoginForm` | None | `200` Render `users/login.ejs` |
| `POST` | `/login` | `saveRedirectUrl` -> `passport.authenticate("local")` | `usersController.login` | `User.authenticate()` | `302 Redirect` -> saved `redirectUrl` or `/listings` (or `/login`) |
| `GET` | `/logout` | Global middleware | `usersController.logout` | Session store | `302 Redirect` -> `/listings` with flash |
| `GET` | `/session-test` | Global middleware | Inline debug route (`app.js`) | Session store | `200` `"Session created!"` |
| `GET` | `/check-session` | Global middleware | Inline debug route (`app.js`) | Session store | `200` Text response |
| `POST` | `/test` | Global middleware | Inline debug route (`app.js`) | None | `200` `"check terminal"` |
| `ALL` | `/*` (unmatched) | Global middleware | 404 middleware -> Error handler | None | `404` Render `error.ejs` |

---

## 9. Database Schema and Relationships

MongoDB Atlas hosts 4 collections managed by Mongoose and `connect-mongo`: `listings`, `reviews`, `users`, and `sessions`.

### Entity Relationship Diagram
```text
User (users)
 ├── 1 ───────< N  Listing (listings.owner -> ObjectId ref "User")
 └── 1 ───────< N  Review  (reviews.author -> ObjectId ref "User")

Listing (listings)
 └── 1 ───────< N  Review  (listings.reviews -> [ObjectId] ref "Review")
```

### 1. `listings` Collection ([`models/listing.js`](file:///e:/Working%20Project/Airbnb/models/listing.js))
| Field | Type | Constraints / Validation | Notes |
| :--- | :--- | :--- | :--- |
| `title` | `String` | `required: true` | Only top-level scalar with Mongoose `required` |
| `description` | `String` | None in Mongoose | Required via Joi |
| `image` | `{ url: String, filename: String }` | None | Stores Cloudinary `secure_url` & `public_id` |
| `price` | `Number` | None in Mongoose | No `min: 0` constraint in Mongoose or Joi |
| `location` | `String` | None in Mongoose | Used for Mapbox forward geocoding on create only |
| `country` | `String` | None in Mongoose | Required via Joi |
| `reviews` | `[Schema.Types.ObjectId]` | `ref: "Review"` | Unbounded embedded array of Review IDs |
| `owner` | `Schema.Types.ObjectId` | `ref: "User"` | Set from `req.user._id` on create |
| `geometry.type` | `String` | `enum: ["Point"], required: true` | GeoJSON type; missing in `init/data.js` |
| `geometry.coordinates` | `[Number]` | `required: true` | `[longitude, latitude]` from Mapbox |

- **Indexes:** Default `_id` index only. **Missing** `2dsphere` index on `geometry`, text/search indexes on `title`/`location`/`country`, and index on `owner`.
- **Populate Operations:** `showListing` executes `.populate({ path: "reviews", populate: { path: "author" } }).populate("owner")`.
- **Hooks:** `listingSchema.post("findOneAndDelete")` attempts `Review.deleteMany({ _id: { $in: listingSchema.reviews } })` — **BROKEN** because it accesses `listingSchema.reviews` (`undefined`) instead of `listing.reviews`.

### 2. `reviews` Collection ([`models/review.js`](file:///e:/Working%20Project/Airbnb/models/review.js))
| Field | Type | Constraints / Validation | Notes |
| :--- | :--- | :--- | :--- |
| `comment` | `String` | None in Mongoose | Required via Joi |
| `rating` | `Number` | `min: 1, max: 5` | Required via Joi |
| `createdAt` | `Date` | `default: Date.now()` | **BUG:** Calls `Date.now()` at module load time instead of passing function reference `Date.now` |
| `author` | `Schema.Types.ObjectId` | `ref: "User"` | Set from `req.user._id` on create |

### 3. `users` Collection ([`models/user.js`](file:///e:/Working%20Project/Airbnb/models/user.js))
| Field | Type | Constraints / Validation | Notes |
| :--- | :--- | :--- | :--- |
| `email` | `String` | `required: true` | **Not unique**; allows duplicate emails |
| `username` | `String` (plugin) | `unique: true` | Added & indexed by `passport-local-mongoose` |
| `hash` | `String` (plugin) | `select: false` | PBKDF2-SHA256 (25,000 iterations, 512-byte key) |
| `salt` | `String` (plugin) | `select: false` | 32-byte random hex salt |

### 4. `sessions` Collection (`connect-mongo`)
- Managed automatically by `MongoStore` in `app.js` using encrypted session documents (`crypto.secret: process.env.SECRET`, `touchAfter: 86400s`, TTL 7 days).

---

## 10. Authentication and Authorization Flow

### Authentication Mechanism
1. **Registration (`POST /signup`):** `User.register(newUser, password)` validates non-empty username, checks username uniqueness, generates a 32-byte salt and PBKDF2 hash, saves the `User` document, and calls `req.login(registeredUser, cb)`. Passport v0.7 regenerates the session ID and stores `username` (`serializeUser`).
2. **Login (`POST /login`):**
   - `saveRedirectUrl` copies `req.session.redirectUrl` into `res.locals.redirectUrl` *before* Passport executes (necessary because Passport 0.7's `SessionManager.logIn` calls `req.session.regenerate()`, wiping pre-login session keys).
   - `passport.authenticate("local", { failureRedirect: "/login", failureFlash: true })` runs `User.authenticate()` -> `findByUsername` -> PBKDF2 verification.
   - `usersController.login` redirects to `res.locals.redirectUrl || "/listings"`.
3. **Subsequent Requests:** `passport.session()` reads `username` from the session, calls `User.deserializeUser` (`findByUsername`), and populates `req.user`, which `app.js` mirrors into `res.locals.currUser`.
4. **Logout (`GET /logout`):** Calls `req.logout()`, deletes `req.session.passport.user`, saves and regenerates session, redirects to `/listings`.

### Authorization Checks (`middleware.js`)
- **Authentication Gate (`isLoggedIn`):** Verifies `req.isAuthenticated()`. Applied to `GET /listings/new`, `POST /listings`, `GET /listings/:id/edit`, `PUT /listings/:id`, `DELETE /listings/:id`, `POST /listings/:id/reviews`, `DELETE /listings/:id/reviews/:reviewId`.
- **Listing Ownership (`isOwner`):** Fetches `Listing.findById(id)` and compares `listing.owner.equals(res.locals.currUser._id)`. Applied to edit form, update, and delete listing routes.
- **Review Authorship (`isReviewAuthor`):** Fetches `Review.findById(reviewId)` and compares `review.author.equals(res.locals.currUser._id)`. Applied to `DELETE /listings/:id/reviews/:reviewId`.

---

## 11. Complete User Journey

Tracing the actual end-to-end flow supported by the current codebase:

1. **Landing & Browsing:**
   `GET /` -> `302 /listings` -> `listingsController.index` queries `Listing.find({})` -> renders `listings/index.ejs`. User can toggle `+18% GST` display locally; clicking search or filter icons does nothing useful.
2. **Viewing a Listing:**
   User clicks a listing card -> `GET /listings/:id` -> `showListing` populates `reviews` (+ `author`) and `owner` -> renders `show.ejs` -> browser executes `public/js/map.js` to render Mapbox map centered on `listing.geometry.coordinates` with a popup.
3. **Signup / Login:**
   Unauthenticated user clicks `sign up` (`GET /signup` -> `POST /signup`) or `log in` (`GET /login` -> `POST /login`) -> Passport sets encrypted Mongo-backed session cookie and redirects to `/listings` (or `redirectUrl` if redirected from a `GET` protected page). *No welcome flash appears due to `"sucess"` typo.*
4. **Creating a Listing (with Image Upload & Geocoding):**
   Logged-in user visits `GET /listings/new` -> fills form and selects an image -> submits `POST /listings` (`multipart/form-data`). `isLoggedIn` passes -> `upload.single('listing[image]')` streams file to Cloudinary -> `validateListing` validates text fields -> `createListing` calls Mapbox Geocoding API -> saves `Listing` with `owner`, `image`, and `geometry` -> redirects to `/listings` with `"new Listing created"` flash.
5. **Posting & Deleting Reviews:**
   Logged-in user submits rating (1–5) + comment on `show.ejs` (`POST /listings/:id/reviews`) -> `isLoggedIn` -> `validateReview` -> `createReview` saves `Review` and pushes ID into `listing.reviews` -> redirects back to `/listings/:id`. Author can click Delete (`POST /listings/:id/reviews/:reviewId?_method=DELETE`) -> `isLoggedIn` -> `isReviewAuthor` -> pulls ID from `listing.reviews` and deletes `Review`.
6. **Editing & Deleting a Listing:**
   Owner clicks Edit (`GET /listings/:id/edit`) -> `isLoggedIn` -> `isOwner` -> renders `edit.ejs` with `w_250` Cloudinary preview. Submitting (`PUT /listings/:id`) optionally uploads a new image and updates scalar fields (without re-geocoding `geometry` or deleting the old image). Clicking Delete (`DELETE /listings/:id`) deletes the listing document (leaving reviews orphaned in MongoDB and image orphaned in Cloudinary).
7. **Logout:**
   User clicks `log out` (`GET /logout`) -> session cleared/regenerated -> redirects to `/listings` with `"you are logged out"` flash.

---

## 12. External Integrations

1. **MongoDB Atlas (`mongoose` + `connect-mongo`):**
   - Configured via `process.env.ATLASDB_URL`.
   - Used for application collections (`listings`, `reviews`, `users`) and Express session storage (`sessions`).
   - `app.js` manually overrides Node DNS (`8.8.8.8`, `8.8.4.4`) globally to work around local DNS SRV issues.
2. **Cloudinary (`cloudinary` v1 + `multer-storage-cloudinary`):**
   - Configured via `CLOUD_NAME`, `CLOUD_API_KEY`, `CLOUD_API_SECRET` in `cloudConfig.js`.
   - Uploads go into folder `wanderlust_DEV`.
   - **No cleanup:** Deleting or replacing a listing image never calls `cloudinary.uploader.destroy(...)`.
3. **Mapbox Geocoding SDK (`@mapbox/mapbox-sdk`) & Mapbox GL JS (`v3.24.0`):**
   - Server-side `geocodingClient.forwardGeocode({ query: req.body.listing.location, limit: 1 })` runs only during `createListing` using `process.env.MAP_TOKEN`.
   - Client-side Mapbox GL JS renders `mapbox://styles/mapbox/standard` in `public/js/map.js` using `mapToken` injected directly into `show.ejs` from `process.env.MAP_TOKEN`.

---

## 13. Security Audit

### Critical & High Severity Findings
1. **Stored Cross-Site Scripting (XSS) in `show.ejs` & `map.js`:**
   - [`views/listings/show.ejs`](file:///e:/Working%20Project/Airbnb/views/listings/show.ejs#L4): `const listing = <%- JSON.stringify(listing) %>;` uses unescaped EJS output inside a `<script>` tag. Any listing field or review comment containing `</script><script>...` breaks out of the script context and executes arbitrary JavaScript in visitors' browsers.
   - [`public/js/map.js`](file:///e:/Working%20Project/Airbnb/public/js/map.js#L15): `.setHTML(\`<h1>${listing.title}</h1>...\`)` injects raw `listing.title` into DOM HTML, enabling HTML/JS injection via Mapbox popup.
2. **Sensitive PII Exposure in Public HTML (`show.ejs`):**
   - `showListing` populates full `owner` and `reviews.author` `User` documents without `.select("username")`, and `<%- JSON.stringify(listing) %>` serializes `owner.email`, `owner._id`, and every reviewer's `email` and `_id` into the public HTML source of `/listings/:id`.
3. **Missing CSRF Protection & `GET /logout` Vulnerability:**
   - No CSRF token middleware (`csrf-csrf`, etc.) protects state-changing forms (`POST /listings`, `PUT /listings/:id`, `DELETE`, `POST /reviews`, `POST /signup`).
   - Logout is implemented as `GET /logout` ([`routes/user.js`](file:///e:/Working%20Project/Airbnb/routes/user.js#L25)), allowing malicious third-party sites to force user logouts via `<img src=".../logout">`.
4. **Unrestricted File Uploads & Lack of Size Limits (`cloudConfig.js`, `routes/listing.js`):**
   - `cloudConfig.js` has typo `allowedFormat` instead of `allowed_formats`, bypassing format restrictions.
   - `multer({ storage })` defines no `limits` (e.g., `fileSize`) and no `fileFilter`, allowing arbitrary file types (including HTML/SVG/executables) and huge payloads to stream to Cloudinary.
5. **Authorization Crashes & Missing Scope Checks (`middleware.js`, `controllers/reviews.js`):**
   - `isOwner` and `isReviewAuthor` do not validate `ObjectId` or check `if (!listing)` / `if (!review)` before calling `.equals(...)`, resulting in unhandled `TypeError` / `CastError` 500 crashes on malformed or nonexistent IDs.
   - `destroyReview` does not verify that `reviewId` actually belongs to listing `:id`.
6. **Exposed Debug Routes & Weak Session Cookie Hardening (`app.js`):**
   - `/session-test`, `/check-session`, and `/test` remain mounted in production (`app.js` lines 121–134).
   - Session cookie lacks `secure` (when in production HTTPS) and `sameSite: "lax"`, and `app.set("trust proxy", 1)` is missing.
7. **No Brute-Force / Rate Limiting Protection:**
   - No `express-rate-limit` on `/login`, `/signup`, or geocoding/upload routes; `passport-local-mongoose` `limitAttempts` is `false` by default.
   - No security HTTP headers (`helmet` is absent).
8. **Missing Input Validation & Unsanitized Error Leakage:**
   - `/signup` and `/login` have zero Joi validation (no password length/complexity, no email validation, duplicate emails allowed).
   - `listingSchema` allows negative `price`; client-side validation is completely non-functional because `/js/script.js` is not loaded.
   - Global error handler renders raw `err.message` directly in `error.ejs`, potentially leaking Mongoose/Cloudinary/Mapbox internals.
9. **Environment / Secret Handling:**
   - `.env` is correctly listed in `.gitignore`, and no secret values are hardcoded in `.js` files (keys present in `.env`: `CLOUD_NAME`, `CLOUD_API_KEY`, `CLOUD_API_SECRET`, `MAP_TOKEN`, `ATLASDB_URL`, `SECRET` — values redacted).
   - However, `views/listings/show.ejs` reads `process.env.MAP_TOKEN` directly inside an EJS view rather than passing a public restricted token cleanly via controller/config.

---

## 14. Code Quality Issues

| Category | Specific Findings (File & Symbol) |
| :--- | :--- |
| **Missing Imports (Runtime Crashes)** | `ExpressError` used without `require` in [`controllers/listings.js`](file:///e:/Working%20Project/Airbnb/controllers/listings.js) (7 occurrences) and [`controllers/reviews.js`](file:///e:/Working%20Project/Airbnb/controllers/reviews.js) (2 occurrences). `signup` in [`controllers/users.js`](file:///e:/Working%20Project/Airbnb/controllers/users.js#L14) calls `next(err)` without declaring `next` in parameters. |
| **Critical Logic Bugs** | 1. [`models/listing.js`](file:///e:/Working%20Project/Airbnb/models/listing.js#L45): `listingSchema.reviews` instead of `listing.reviews` breaks cascade review deletion.<br>2. [`models/review.js`](file:///e:/Working%20Project/Airbnb/models/review.js#L13): `default: Date.now()` sets every review timestamp to server boot time.<br>3. [`controllers/listings.js`](file:///e:/Working%20Project/Airbnb/controllers/listings.js#L32): Missing `return` after `res.redirect("/listings")` in `showListing`.<br>4. [`controllers/users.js`](file:///e:/Working%20Project/Airbnb/controllers/users.js#L16): `req.flash("sucess", ...)` typo silently drops signup/login flash messages.<br>5. [`controllers/listings.js`](file:///e:/Working%20Project/Airbnb/controllers/listings.js#L86): `updateListing` fails to re-geocode `geometry` when `location` changes.<br>6. [`controllers/listings.js`](file:///e:/Working%20Project/Airbnb/controllers/listings.js#L49): `createListing` crashes if `req.file` is missing or `response.body.features[0]` is empty. |
| **Dead Code & Unused Imports** | Unused `joi` import in `models/listing.js`; unused `Listing`/`mongoose` in `routes/listing.js`; unused `ExpressError`/`Review`/`Listing`/`mongoose` in `routes/review.js`; unused `User` in `routes/user.js`; unused `cookie-parser` dependency in `package.json`; unreachable `if (!listing)` blocks in `showListing` & `renderEditForm`; dead `/js/script.js`; commented-out `/demouser` and form controls. |
| **Debug Artifacts** | `console.log("SERVER FILE LOADED ✔")`, `console.log(listing)`, `console.log(savedListing)`, `console.log("LISTING:", listing)`, `console.log("ROUTE HIT ✅")`, `console.log("BODY:", req.body)`, `console.log(registeredUser)`, `/session-test`, `/check-session`, `/test`. |
| **Duplicate DB Queries** | `renderEditForm`, `updateListing`, and `destroyListing` each query `Listing.findById(id)` in `isOwner` and then query the exact same listing a second time inside the controller. |
| **Tight Coupling & Configuration Gaps** | `app.js` hardcodes port `8080` and DNS servers (`8.8.8.8`, `8.8.4.4`); `init/index.js` hardcodes local Mongo URL and a fake `owner` ID while `init/data.js` lacks required `geometry`; `controllers/listings.js` instantiates Mapbox client at module top-level (fails if imported before `dotenv` loads); `package.json` `main` points to nonexistent `index.js`. |
| **Frontend Defects** | `<scrip>` typo in `show.ejs`; duplicate Bootstrap `5.3.0` + `5.3.8` CSS in `boilerplate.ejs`; global `/js/map.js` execution on non-map pages; missing `id` attributes on form inputs; `#map { width: 100vh }`; invalid `align-items: space-evenly`; implicit global `info` in `index.ejs` loop. |

---

## 15. Current MVC Architecture Evaluation

### What Is Already Organized Correctly
- **Folder separation exists at a basic level:** `models/`, `views/`, `routes/`, `controllers/`, `utils/`, and `public/` already reflect a classic Express MVC starting structure.
- **Router-level modularization:** Routes are split by domain (`listing.js`, `review.js`, `user.js`) rather than all residing in `app.js`.
- **Layout templating:** `ejs-mate` (`boilerplate.ejs` + `include/` partials) cleanly separates shared chrome from page-specific bodies.
- **Error abstraction intent:** `ExpressError` and `wrapAsync` provide clean building blocks for centralized Express error handling.

### What Needs Restructuring & Mixed Responsibilities
- **Entrypoint Overload (`app.js`):** Database connection, session store creation, Passport configuration, debug routes, route mounting, and server startup are all mixed into `app.js` instead of dedicated `config/` modules.
- **Flat Root Files (`middleware.js`, `schema.js`, `cloudConfig.js`):** Validation schemas, middleware functions, and external storage configs sit loose in the project root instead of `validators/`, `middleware/`, and `config/`.
- **Fat / Coupled Controllers:** `controllers/listings.js` directly handles HTTP req/res, `ObjectId` checks, Mapbox API calls, Cloudinary response properties, and Mongoose persistence. `controllers/reviews.js` manipulates both `Review` and `Listing` directly without transactional guarantees.
- **Inconsistent Validation & Error Patterns:** Some checks live in `middleware.js` (`isOwner`, `validateListing`), some inside controllers (`ObjectId.isValid` checks duplicated 5 times across controllers), and some fail inconsistently (`throw` vs `next(err)` vs `res.redirect`).
- **Views Coupled to Environment & Internal Schemas:** `show.ejs` reads `process.env.MAP_TOKEN` directly and leaks full User DB documents via `JSON.stringify(listing)`. Inline CSS/JS sits inside `navbar.ejs` and `index.ejs`.
- **Zero Automated Tests:** No `tests/` directory or test script exists (`package.json` only has a placeholder `echo "Error: no test specified" && exit 1`).

### Evaluation Against Target Conceptual Architecture

| Conceptual Directory | Current Status | Assessment & Recommendation (Keep SSR Express + EJS) |
| :--- | :--- | :--- |
| `config/` | Missing (`cloudConfig.js` & DB/session/Passport logic in `app.js`) | **Essential.** Extract `db.js`, `session.js`, `passport.js`, `cloudinary.js`, `mapbox.js`, and validated `env.js`. |
| `controllers/` | Exists (`listings.js`, `reviews.js`, `users.js`) | **Keep & Slim Down.** Keep strictly responsible for extracting `req` params/body/user, invoking services, setting flash/status, and calling `res.render` or `res.redirect`. |
| `models/` | Exists (`listing.js`, `review.js`, `user.js`) | **Keep & Fix.** Fix `findOneAndDelete` hook, `Date.now` default, required constraints, and add MongoDB indexes (`2dsphere`, `owner`, text/search). |
| `routes/` | Exists (`listing.js`, `review.js`, `user.js`) | **Keep & Clean.** Remove unused imports, convert logout to `POST /logout`, add static/legal routes or health check if needed. |
| `middleware/` | Single root file `middleware.js` | **Move & Split.** Organize into `middleware/auth.js`, `middleware/ownership.js`, `middleware/validate.js`, `middleware/upload.js`, `middleware/errorHandler.js` (also attach `res.locals.listing`/`review` during ownership checks to eliminate duplicate DB queries). |
| `services/` | Missing | **Strongly Justified.** Extract Mapbox geocoding, Cloudinary asset upload/deletion, listing lifecycle (create + geocode, update + re-geocode + replace old image, delete + cleanup Cloudinary + cascade reviews), and review operations into `services/`. |
| `repositories/` | Missing | **Not Justified Currently (Optional Later).** For a Mongoose + Express SSR app of this scale, adding a full repository layer over Mongoose models adds boilerplate with little gain; keep Mongoose queries in `services/` (or model statics) unless supporting multiple data sources or complex query composition later. |
| `utils/` | Exists (`ExpressError.js`, `wrapAsync.js`) | **Keep & Expand.** Add safe JSON serializer / HTML sanitizer helpers (to prevent XSS in `show.ejs` / `map.js`) and ObjectId validator helpers. |
| `validators/` | Root `schema.js` | **Move & Expand.** Move `schema.js` into `validators/` (split by resource: `listingValidator.js`, `reviewValidator.js`, `authValidator.js`), add param/ID validation and file validation. |
| `views/` | Exists (`layout/`, `include/`, `listings/`, `users/`, `error.ejs`) | **Retain SSR & Clean.** Keep `ejs-mate` SSR architecture; move inline CSS/JS into `public/`, pass only sanitized/minimal view-models (e.g. `mapToken` + `mapListing` DTO from controller), and fix duplicate Bootstrap / broken `<scrip>` tags. |
| `public/` | Exists (`css/`, `js/`) | **Keep & Fix.** Load `/js/script.js` in `boilerplate.ejs` (or form pages), load `/js/map.js` only on `show.ejs`, add `filters.js` if implementing interactive filtering/tax calc. |
| `tests/` | Missing | **Needed.** Add integration tests (Supertest + in-memory MongoDB) and unit tests for validators, middleware, and services. |

### How EJS Should Remain Integrated with Express
Keep the existing **Express + `ejs-mate` server-side rendering (SSR)** flow intact:
- Express routes continue returning rendered HTML (`res.render(...)`) and PRG redirects (`POST/PUT/DELETE` -> `res.redirect(...)` with `connect-flash`), rather than converting to a SPA/REST JSON API.
- Controllers act as the bridge between `services/` and `views/`: services return plain domain objects or throw `ExpressError`, and controllers pass **explicit, minimal view DTOs** (e.g., excluding user `email` from public listing JSON passed to Mapbox) to `res.render(...)`.
- Shared UI state (`currUser`, `success`, `error`, safe public config like `mapToken`) can be cleanly exposed via `res.locals` middleware rather than reading `process.env` inside `.ejs` templates.

---

## 16. Missing or Incomplete Features

1. **Destination Search (`navbar.ejs`):** Form has no `action`, `method`, or `name` attribute; backend has no search endpoint or query filtering.
2. **Category Filtering (`index.ejs`):** 10 filter icons exist visually (`Trending`, `Rooms`, `Iconic cities`, etc.), but `Listing` schema has no `category` field, icons have no links/JS, and `listingsController.index` ignores query filters.
3. **Total Price After Taxes Calculation (`index.ejs`):** Toggle switch only unhides static `+18% GST` text instead of displaying the computed post-tax total.
4. **Pagination / Sorting:** `Listing.find({})` fetches the entire collection unconditionally.
5. **Legal & Info Pages (`footer.ejs`):** `/privacy`, `/terms`, and social links are unimplemented (`404` on `/privacy` and `/terms`).
6. **Cloudinary Asset Cleanup:** Updating or deleting a listing never deletes old images from Cloudinary.
7. **Location Re-Geocoding on Update:** Editing a listing's `location` never updates `geometry.coordinates`.
8. **User Profile / "My Listings" / Booking Flow:** No user dashboard, no listing ownership view, no reservations/bookings model or availability calendar.
9. **Consistent Seed Script (`init/index.js` + `init/data.js`):** `init/data.js` lacks required `geometry` GeoJSON objects, and `init/index.js` targets hardcoded local MongoDB instead of `ATLASDB_URL` with a valid existing user ID.

---

## 17. Recommended Industry-Level Architecture

Target modular SSR layout (for future refactoring — **not implemented yet**):

```text
wanderlust/
├── app.js                      # Express app assembly (middleware + route mounting)
├── server.js                   # Env check, DB connection, HTTP server listen & graceful shutdown
├── config/
│   ├── env.js                  # Validates required env vars on startup
│   ├── db.js                   # Mongoose connection logic
│   ├── session.js              # express-session + connect-mongo config
│   ├── passport.js             # LocalStrategy & serialize/deserialize config
│   ├── cloudinary.js           # Cloudinary SDK & Multer storage config
│   └── mapbox.js               # Mapbox geocoding client setup
├── routes/
│   ├── index.js                # Aggregates routers + root/health/legal routes
│   ├── listing.routes.js
│   ├── review.routes.js
│   └── user.routes.js
├── middleware/
│   ├── auth.middleware.js      # isLoggedIn, saveRedirectUrl
│   ├── ownership.middleware.js # isOwner, isReviewAuthor (loads & attaches doc to req/res.locals)
│   ├── validate.middleware.js  # Joi request & ObjectId validation wrappers
│   ├── upload.middleware.js    # Multer limits, fileFilter, upload error handling
│   └── error.middleware.js     # 404 & centralized error renderer
├── validators/
│   ├── listing.validator.js
│   ├── review.validator.js
│   └── user.validator.js
├── controllers/
│   ├── listing.controller.js
│   ├── review.controller.js
│   └── user.controller.js
├── services/
│   ├── listing.service.js      # Orchestrates CRUD + geocoding + Cloudinary cleanup
│   ├── review.service.js       # Transactional/coordinated review add & delete
│   ├── geocoding.service.js    # Safe Mapbox wrapper with fallback/error handling
│   └── storage.service.js      # Cloudinary delete/upload helper
├── models/
│   ├── listing.model.js
│   ├── review.model.js
│   └── user.model.js
├── utils/
│   ├── ExpressError.js
│   ├── wrapAsync.js
│   └── sanitize.js             # Escaping for inline JSON/HTML scripts
├── views/                      # EJS templates (partials, layouts, domain pages)
├── public/                     # CSS & modular client-side JS (loaded per-page via blocks)
├── init/                       # Seed script using config/db & geocoding fallback
└── tests/                      # Unit & integration tests
```

---

## 18. Refactoring Priority List

1. **P0 — Fix Runtime Crashers & Broken Core Behavior:**
   - Import `ExpressError` in `controllers/listings.js` and `controllers/reviews.js`.
   - Add `return` after `res.redirect("/listings")` in `showListing`.
   - Fix `listingSchema.reviews` -> `listing.reviews` in `models/listing.js` post-delete hook.
   - Fix `Date.now()` -> `Date.now` in `models/review.js`.
   - Fix `req.flash("sucess", ...)` -> `"success"` and add `next` param in `controllers/users.js`.
   - Fix `ObjectId` & null checks in `isOwner`, `isReviewAuthor`, `createListing` (`req.file`, `features[0]`), and `show.ejs` (`listing.owner`, `review.author`).
2. **P0 — Remediate Critical Security Vulnerabilities:**
   - Remove PII (`email`, `_id`) from client-serialized `listing` in `show.ejs` and safely serialize JSON (escaping `<`/`/`/`\u2028`/`\u2029`) + sanitize/use `.setText()` instead of raw HTML interpolation in `map.js`.
   - Add CSRF protection (`csrf-csrf` or `csurf` alternative) and change `GET /logout` to `POST /logout`.
   - Fix `allowedFormat` -> `allowed_formats` in `cloudConfig.js`, add Multer `fileFilter` & `limits.fileSize`, and move `validateListing` before or clean up failed uploads.
   - Remove `/session-test`, `/check-session`, `/test` debug routes; add `helmet`, rate limiting on `/login`/`/signup`, and hardened cookie flags (`secure`, `sameSite`).
3. **P1 — Fix Frontend Validation, Layout & UI Defects:**
   - Remove duplicate Bootstrap 5.3.0 CSS from `boilerplate.ejs`, move `/js/map.js` exclusively to `show.ejs` (fixing `<scrip>` typo), and load `/js/script.js` globally or on form views so `.needs-validation` actually runs.
   - Hide Review Delete button unless `currUser && review.author?._id.equals(currUser._id)`.
   - Fix missing `id` attributes on form inputs, textarea whitespace in `edit.ejs`, `#map` CSS width, and branding/spelling typos.
4. **P1 — Fix Data Integrity & External Service Gaps:**
   - Re-geocode `location` inside `updateListing` when location changes; delete replaced/deleted listing images from Cloudinary (`cloudinary.uploader.destroy`).
   - Run `validateListing` validation cleanly without leaking orphaned files; enforce `price >= 0` and auth Joi schemas.
   - Add MongoDB indexes (`2dsphere` on `geometry`, `owner`, search fields).
5. **P2 — Restructure into Modular MVC + Complete Missing Features:**
   - Extract `config/`, `validators/`, `services/`, and granular `middleware/` modules.
   - Implement real search & category filtering (add `category` field to `Listing`), pagination, `/privacy` & `/terms` routes, and update `init/` seed script.
6. **P3 — Add Testing & Operational Polish:**
   - Add `start`/`dev`/`test` scripts to `package.json`, use `process.env.PORT`, add automated tests in `tests/`.

---

## 19. Overall Project Health Assessment

- **Overall Maturity:** **Early Prototype / Student Capstone Level (4.5 / 10)**.
- **Strengths:** Clean baseline understanding of Express routers, `ejs-mate` layouts, Passport local authentication, MongoDB session persistence, Joi schema usage, Cloudinary streaming, and Mapbox geocoding integration.
- **Weaknesses:** Multiple silent runtime bugs (`ExpressError` unimported, `listingSchema.reviews` cascade bug, `Date.now()` bug, `"sucess"` flash typo, unlinked `script.js`), several high-risk security issues (Stored XSS via raw `JSON.stringify` + `setHTML`, PII exposure, missing CSRF, `GET /logout`, broken `allowedFormat`), incomplete UI affordances (search & filters), and zero test coverage.
- **Readiness:** Not production-ready in its current state; requires P0 bug and security remediation before deployment, followed by P1–P2 MVC refactoring.

---

## Feature Classification Summary

### WORKING FEATURES
- **Root redirect** (`GET /` -> `/listings`)
- **Listing gallery browse** (`GET /listings` — assuming all seeded/saved documents have valid `price` & `image.url`)
- **MongoDB-backed Express sessions** (`connect-mongo` + `express-session`, aside from missing production cookie flags)
- **Listing creation happy path** (`POST /listings` when authenticated with valid fields, valid image file, and geocodable location)
- **Review creation happy path** (`POST /listings/:id/reviews` when authenticated on a valid listing)

### PARTIALLY WORKING FEATURES
- **User signup (`POST /signup`):** Creates & logs in user, but `"sucess"` typo prevents welcome flash, `next` is undefined on `req.login` error, and email uniqueness/password validation are absent.
- **User login (`POST /login`):** Authenticates and restores `GET` `redirectUrl`, but `"sucess"` typo prevents welcome flash and `POST`/`PUT`/`DELETE` redirects fail.
- **User logout (`GET /logout`):** Logs out user, but uses unsafe `GET` method.
- **Listing detail view (`GET /listings/:id`):** Works for valid listings with `owner` & `geometry`, but crashes on missing/invalid IDs (`ExpressError` missing + missing `return`), leaks owner/reviewer emails, and exposes XSS vectors.
- **Listing edit & update (`GET /:id/edit`, `PUT /:id`):** Updates scalar fields & image, but does not re-geocode `location`, leaves old Cloudinary images orphaned, adds whitespace to textarea, and crashes on missing listing IDs in `isOwner`.
- **Listing deletion (`DELETE /listings/:id`):** Deletes listing, but fails to cascade-delete reviews (`listingSchema.reviews` bug) and leaves Cloudinary images orphaned.
- **Review deletion (`DELETE /listings/:id/reviews/:reviewId`):** Deletes review for author, but Delete button is rendered for everyone and `isReviewAuthor` crashes on nonexistent review IDs.
- **Image upload (`Multer` + `Cloudinary`):** Uploads images, but `allowedFormat` typo disables file type restriction, no file size limit exists, and failed validations still upload images.
- **Mapbox map display (`public/js/map.js`):** Renders on `show.ejs`, but `/js/map.js` executes on every page throwing JS errors, `<scrip>` tag in `show.ejs` is misspelled, `#map` width uses `100vh`, and seeded listings lack `geometry`.
- **Tax toggle (`views/listings/index.ejs`):** Toggles `+18% GST` label text, does not calculate total price.
- **Flash messages & Error handler:** Partially functional, broken by `"sucess"` typos, missing `ExpressError` imports, and raw error exposure.
- **Client-side form validation (`public/js/script.js`):** Written but never imported, while `novalidate` disables browser validation.

### MISSING FEATURES
- **Search functionality** (navbar form has no `action`, `name`, or backend query handler)
- **Category filtering** (10 filter icons on `index.ejs` have no schema field, routes, or click handlers)
- **Pagination & sorting** on listings index
- **Privacy Policy (`/privacy`) & Terms (`/terms`) pages** (links return 404)
- **Cloudinary image cleanup** on listing update/delete
- **User profile / dashboard & bookings/reservations system**
- **CSRF protection, HTTP rate limiting, and security headers (`helmet`)**
- **Automated test suite (`tests/`)**

---

## Recommended Step-by-Step Refactoring Roadmap

1. **Step 1 — Stabilize Critical Bugs (Zero Structural Risk):**
   Fix missing `ExpressError` imports, `showListing` early `return`, `listing.reviews` in post-delete hook, `Date.now` function reference in `Review`, `"success"` flash typos + `next` arg in `users.js`, null/ObjectId checks in `middleware.js` and `show.ejs`, and missing `req.file` / empty Mapbox `features` checks in `createListing`.
2. **Step 2 — Harden Security & Upload Pipeline:**
   Fix `show.ejs` PII exposure and JSON XSS escaping, replace `setHTML` interpolation in `map.js` with safe DOM creation/text nodes, convert `/logout` to `POST`, add CSRF protection, fix `allowed_formats` + Multer `fileFilter`/size limits, remove debug routes in `app.js`, and add `helmet` + `express-rate-limit`.
3. **Step 3 — Fix Frontend Assets & Validation:**
   Clean up `boilerplate.ejs` (remove duplicate Bootstrap CSS, move `/js/map.js` exclusively to `show.ejs`), include `/js/script.js`, move inline `<style>`/`<script>` from `navbar.ejs`/`index.ejs` to `public/`, fix form `id` attributes and `edit.ejs` textarea formatting, and hide review delete buttons from non-authors.
4. **Step 4 — Extract Configuration & Validation Layers:**
   Create `config/` (`env.js`, `db.js`, `session.js`, `passport.js`, `cloudinary.js`, `mapbox.js`) and `validators/` (`listing.validator.js`, `review.validator.js`, `user.validator.js`), slimming down `app.js` and removing root clutter (`cloudConfig.js`, `schema.js`).
5. **Step 5 — Introduce `services/` & Granular `middleware/`:**
   Split `middleware.js` into focused files under `middleware/`. Move Mapbox geocoding/re-geocoding, Cloudinary cleanup, and listing/review orchestration into `services/`, keeping controllers thin and purely focused on HTTP request/response + `res.render`/`res.redirect`.
6. **Step 6 — Complete Incomplete Features & Database Indexes:**
   Add `category` + MongoDB indexes (`2dsphere`, `owner`, text/regex search), implement working search and category filters in `listingsController.index`, add pagination, compute actual GST total on toggle (if desired), implement `/privacy` & `/terms`, and update `init/` seed script to populate valid `geometry` and `owner`.
7. **Step 7 — Add Automated Testing & Scripts:**
   Add `start`, `dev`, and `test` scripts in `package.json`, write unit tests for validators/services and integration tests for routes/auth/ownership under `tests/`, and configure `process.env.PORT`.

