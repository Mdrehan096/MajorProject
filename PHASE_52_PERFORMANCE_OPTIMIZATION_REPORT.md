# Wanderlust — Phase 5.2 Performance Optimization Report

**Date:** 2026-11-12  
**Baseline Checkpoint:** `83a4ab9` (`Phase 5.1 production readiness audit completed`)  
**Target Environment:** Node.js `v24.13.1`, Express `^5.2.1`, Mongoose `^9.3.1`, MongoDB Atlas `8.0.37`

---

## 1. Optimization Summary

Phase 5.2 eliminated redundant database round trips, added missing MongoDB compound/lookup indexes across `Booking`, `Listing`, and `Review`, introduced lean queries and field projections on read-only paths, and removed render-blocking Mapbox GL assets from non-map routes.

All booking transaction safety invariants (`bookingVersion` write-lock serialization, half-open `[checkIn, checkOut)` intervals, retry early-conflict short-circuiting, immutable pricing/listing snapshots, and `Payment has not been collected` guarantees) were preserved unchanged.

---

## 2. Database & Query Optimizations Implemented

### 2.1 New Schema Indexes (Synced to MongoDB Atlas)

| Collection | Index Definition | Purpose | Query Plan Improvement (`explain("executionStats")`) |
| --- | --- | --- | --- |
| `bookings` | `{ host: 1, createdAt: -1, _id: -1 }` | Unfiltered `/host/bookings` list & pagination | Eliminated in-memory `SORT` stage (`SORT` -> `LIMIT` over `IXSCAN` -> `FETCH`) |
| `listings` | `{ owner: 1, _id: -1 }` | `getHostBookings` & `getUserDashboard` owned listings | Replaced full collection `_id_` scan with selective `owner_1__id_-1` index scan |
| `listings` | `{ reviews: 1 }` | `getUserDashboard` inverse listing lookup (`reviews: { $in }`) | Replaced `COLLSCAN` with multikey `reviews_1` index scan (`docsExamined: 7 -> 1` in benchmark) |
| `reviews` | `{ author: 1, createdAt: -1, _id: -1 }` | `getUserDashboard` authored reviews | Replaced `COLLSCAN` + in-memory `SORT` with `IXSCAN` (`author_1_createdAt_-1__id_-1`) |

### 2.2 Redundant Query Elimination & Parallelism

| Service Method | Change Applied | DB Execs Before -> After |
| --- | --- | --- |
| [`services/listingService.js`](file:///e:/Working%20Project/Airbnb/services/listingService.js) `getListingDetails` | Replaced duplicate `Listing.exists` + `Listing.findById` checks (via internal helpers `queryBlockedDatesForListing` and `queryDateAvailabilityForListing` after initial `getListingById`) and executed blocked-dates + date-availability queries in `Promise.all`. | `8 -> 6` (`-25.0%`) |
| [`services/listingService.js`](file:///e:/Working%20Project/Airbnb/services/listingService.js) `getListingAvailability` | Eliminated duplicate `Listing.exists` + `Listing.findById` lookups after initial `Listing.findById(id, "_id price maxGuests", { lean: true })`; parallelized `Booking.find` and `Booking.findOne` in `Promise.all`. | `5 -> 3` (`-40.0%`) |
| [`services/bookingService.js`](file:///e:/Working%20Project/Airbnb/services/bookingService.js) `getBookingReviewDetails` | Eliminated duplicate `Listing.exists` + `Listing.findById` calls after loading listing + host; parallelized `Booking.find` and `Booking.findOne` in `Promise.all`. | `6 -> 4` (`-33.3%`) |

### 2.3 Projections & Lean Queries

- [`services/listingService.js`](file:///e:/Working%20Project/Airbnb/services/listingService.js) (`searchListings`, `getAllListings`): Added explicit card projection `"title location country price category image"` and `{ lean: true }`, avoiding hydration of large `description`, `geometry`, and `reviews` fields on discovery pages.
- [`services/bookingService.js`](file:///e:/Working%20Project/Airbnb/services/bookingService.js) (`getGuestBookings`, `getHostBookings`): Passed `{ lean: true }` to paginated list queries to skip full Mongoose document wrapper instantiation on read-only dashboard views.
- [`services/userService.js`](file:///e:/Working%20Project/Airbnb/services/userService.js) (`getUserProfile`, `getUserDashboard`): Applied `{ lean: true }` on read-only user/listing/review dashboard queries and projected listing card fields.

---

## 3. Frontend & Static Asset Optimizations Implemented

1. **Page-Scoped & Deferred Mapbox Loading ([`views/layout/boilerplate.ejs`](file:///e:/Working%20Project/Airbnb/views/layout/boilerplate.ejs), [`views/listings/show.ejs`](file:///e:/Working%20Project/Airbnb/views/listings/show.ejs)):**
   - Guarded `mapbox-gl.css` and `mapbox-gl.js` so they render **only** on pages with map data (`includeMapbox` or `mapListing` defined — i.e., `listings/show.ejs`), eliminating third-party Mapbox CSS/JS downloads from `/login`, `/signup`, `/listings`, `/bookings`, `/host/bookings`, `/dashboard`, `/profile`, `/privacy`, `/terms`, and error views.
   - Added `defer` to `mapbox-gl.js`, `/js/map.js`, and `/js/listingDetails.js` to avoid render-blocking script execution while preserving strict execution order after the inline `mapToken`/`mapListing` configuration script.
2. **Extracted Inline Navbar CSS ([`views/include/navbar.ejs`](file:///e:/Working%20Project/Airbnb/views/include/navbar.ejs) -> [`public/css/style.css`](file:///e:/Working%20Project/Airbnb/public/css/style.css)):**
   - Moved `.search-btn` and `.search-inp` rules into `public/css/style.css` for cacheable styling and smaller HTML responses on every route.
3. **Lazy Image Loading ([`views/listings/index.ejs`](file:///e:/Working%20Project/Airbnb/views/listings/index.ejs), [`views/bookings/index.ejs`](file:///e:/Working%20Project/Airbnb/views/bookings/index.ejs), [`views/host/bookings.ejs`](file:///e:/Working%20Project/Airbnb/views/host/bookings.ejs), [`views/users/dashboard.ejs`](file:///e:/Working%20Project/Airbnb/views/users/dashboard.ejs), [`views/listings/show.ejs`](file:///e:/Working%20Project/Airbnb/views/listings/show.ejs)):**
   - Added `loading="lazy" decoding="async"` on card grid images and `decoding="async"` on the above-the-fold show-page hero image.
4. **Static Asset Caching ([`app.js`](file:///e:/Working%20Project/Airbnb/app.js)):**
   - Configured `express.static(..., isProduction ? { maxAge: "1d", etag: true } : { etag: true })`.

---

## 4. Measured Before / After Benchmark Results (Live MongoDB Atlas)

Measured against identical seeded temporary fixtures (6 listings, 3 reviews, 4 bookings, 2 users; cleaned up in `finally`):

| Route / Operation | Metric | Before (Phase 5.1) | After (Phase 5.2) | Delta |
| --- | --- | --- | --- | --- |
| `getListingDetails` (SSR + avail) | MongoDB ops | `8` | `6` | `-2` (`-25.0%`) |
| `getListingAvailability` | MongoDB ops | `5` | `3` | `-2` (`-40.0%`) |
| `getBookingReviewDetails` | MongoDB ops | `6` | `4` | `-2` (`-33.3%`) |
| `GET /login` | HTML bytes / Mapbox JS | `5,369 B` / `Yes` | `4,675 B` / `No` | `-694 B` + Mapbox removed |
| `GET /listings?page=1&limit=12` | HTML bytes / Mapbox JS / Lazy img | `19,716 B` / `Yes` / `No` | `19,442 B` / `No` / `Yes` | `-274 B` + Mapbox removed + Lazy |
| `GET /listings/:id?...` | HTTP latency / HTML bytes | `228.71 ms` / `22,426 B` | `123.88 ms` / `21,968 B` | `-45.8%` latency |
| `GET /listings/:id/availability?...` | JSON latency | `141.24 ms` | `74.71 ms` | `-47.1%` latency |

---

## 5. Verification Executed

| Check | Scope | Result |
| --- | --- | --- |
| `scratch/run_unit_suite.js` | All 13 offline Phase 3A–4.7 unit & CSP security suites | `13/13` passed (`exit 0`) |
| `scratch/verify_phase52_unit.js` | Schema index definitions, duplicate-query elimination assertions, conditional Mapbox/defer/lazy-img/CSS extraction checks | Passed (`exit 0`) |
| `scratch/phase52_benchmark.js --sync-indexes` | Live Atlas index sync, HTTP benchmark & `explain("executionStats")` audit | Passed (all target queries use indexes; zero `COLLSCAN` on audited user/host/review paths) |
