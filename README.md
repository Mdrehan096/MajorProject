# Wanderlust

Wanderlust is an Airbnb-style accommodation discovery and booking web application built with Node.js, Express, MongoDB, and EJS. Users can explore stays, post listings with photos and maps, write reviews, and manage reservations as both guests and hosts.

## Features

- **User Registration and Login:** Sign up, log in, log out securely, and update your profile details.
- **Browse and Search Listings:** Search stays by title, city, or country from the home page.
- **Categories, Filters, Sorting, and Pagination:** Filter stays by category and price range, sort results by newest or price, toggle estimated tax previews, and navigate paginated pages.
- **Listing Creation, Editing, and Deletion:** Hosts can create, update, and delete their own listings.
- **Cloudinary Image Uploads:** Upload property photos (PNG, JPG, JPEG, or WebP up to 5 MB) hosted via Cloudinary.
- **Mapbox Maps:** Automatically geocode listing locations and display an interactive map on each listing details page.
- **Reviews and Ratings:** Authenticated users can leave star ratings and comments on listings, and delete their own reviews.
- **Guest Booking and Cancellation:** Check available dates, see estimated pricing and taxes, create reservations, view booking history, and cancel bookings. **Note:** Bookings currently do not include online payment processing; reservations are created as unpaid booking requests.
- **Host Booking Management:** Hosts can view reservations for their properties and confirm, cancel, or complete stays.
- **Guest and Host Dashboards:** Manage your hosted listings, authored reviews, guest trips, and host reservations from dedicated dashboards.
- **Booking Availability and Double-Booking Protection:** Prevents overlapping reservations on the same dates, enforces maximum guest limits, and blocks hosts from booking their own listings.
- **Privacy and Terms Pages:** Includes accessible Privacy Policy (`/privacy`) and Terms and Conditions (`/terms`) pages.

## Technologies Used

- **Backend:** Node.js, Express 5, Mongoose
- **Database:** MongoDB Atlas
- **Views & Styling:** EJS, ejs-mate, Bootstrap 5, Font Awesome, custom CSS & client-side JavaScript
- **Authentication & Validation:** Passport (`passport-local`, `passport-local-mongoose`), `express-session`, `connect-mongo`, `connect-flash`, Joi
- **Media & Maps:** Cloudinary, Multer (`multer-storage-cloudinary`), Mapbox SDK & Mapbox GL JS
- **Configuration:** `dotenv`, `method-override`

## Requirements

- **Node.js:** `v24.13.1` (or compatible modern Node.js LTS) with `npm`
- **MongoDB Atlas:** A MongoDB Atlas cluster (or replica-set MongoDB URI, required for multi-document booking transactions)
- **Optional Third-Party Accounts:** Cloudinary (for live image uploads) and Mapbox (for location geocoding and maps)

## Installation

1. **Clone the repository:**

   ```bash
   git clone https://github.com/Mdrehan096/MajorProject.git
   cd MajorProject
   ```

2. **Install dependencies:**

   ```bash
   npm install
   ```

3. **Create your `.env` file from `.env.example`:**

   On macOS / Linux:

   ```bash
   cp .env.example .env
   ```

   On Windows (PowerShell):

   ```powershell
   Copy-Item .env.example .env
   ```

4. **Open `.env` and fill in your own configuration values** (see the Environment Variables section below).

## Environment Variables

Use `.env.example` as the template for your local `.env` file. Never share or commit real keys or passwords.

### Required Variables

| Variable | Description | Example / Default |
| :--- | :--- | :--- |
| `ATLASDB_URL` | MongoDB Atlas (or replica-set MongoDB) connection string | `mongodb+srv://<username>:<password>@<cluster-url>/<database>?retryWrites=true&w=majority` |
| `SECRET` | Session signing secret (use at least 32 random characters in production) | `replace_with_a_long_random_secret` |

### Server & Database Settings

| Variable | Description | Default |
| :--- | :--- | :--- |
| `NODE_ENV` | Runtime mode (`development` or `production`) | `development` |
| `PORT` | Port the server listens on | `8080` |
| `BODY_LIMIT` | Maximum JSON/form request body size | `100kb` |
| `SHUTDOWN_TIMEOUT_MS` | Graceful shutdown timeout in milliseconds | `10000` |
| `DB_DNS_SERVERS` | DNS servers used for MongoDB SRV lookup (`none` or `system` to disable override) | `8.8.8.8,8.8.4.4` |
| `DB_MAX_POOL_SIZE` | Maximum MongoDB connection pool size | `10` |
| `DB_SERVER_SELECTION_TIMEOUT_MS` | MongoDB server selection timeout (ms) | `10000` |
| `DB_SOCKET_TIMEOUT_MS` | MongoDB socket timeout (ms) | `45000` |

### Cloudinary & Mapbox Integrations

| Variable | Description | Default / Notes |
| :--- | :--- | :--- |
| `CLOUD_NAME` | Cloudinary cloud name | Required for live image uploads |
| `CLOUD_API_KEY` | Cloudinary API key | Required for live image uploads |
| `CLOUD_API_SECRET` | Cloudinary API secret | Required for live image uploads |
| `CLOUD_FOLDER` | Cloudinary destination folder | `wanderlust_DEV` |
| `MAP_TOKEN` | Mapbox public access token | Required for geocoding and map rendering |

### Booking, Pricing & Rate-Limit Settings

| Variable | Description | Default |
| :--- | :--- | :--- |
| `AUTH_RATE_LIMIT_WINDOW_MS` | Login/signup rate-limit window (ms) | `900000` |
| `AUTH_RATE_LIMIT_MAX` | Max auth attempts per window | `10` |
| `TAX_MODE` | Tax calculation mode (`indian_gst_slabs`, `flat`, or `none`) | `indian_gst_slabs` |
| `TAX_RATE` | Percentage rate used when `TAX_MODE=flat` (`0`–`100`) | *(empty)* |
| `TAX_LABEL` | Display label for estimated taxes | `Estimated GST` |
| `MAX_STAY_NIGHTS` | Maximum nights allowed per reservation | `90` |
| `BOOKING_DEFAULT_MAX_GUESTS` | Default maximum guests per listing | `8` |
| `BOOKING_TX_MAX_RETRIES` | Transaction retry limit on write conflicts | `4` |

## Run the Project

Start the application:

```bash
npm start
```

Once the server is running, open your browser and visit:

- `http://localhost:8080`

## Project Structure

```text
.
├── app.js              # Express app setup, security headers, sessions, and routes
├── server.js           # Server startup, database connection, and graceful shutdown
├── schema.js           # Joi validation schemas for listings and reviews
├── config/             # Environment, database, Cloudinary, Mapbox, Passport, and session config
├── controllers/        # Request handlers connecting routes, services, and views
├── middleware/         # Auth, ownership, CSRF, rate limiting, security, uploads, validation, errors
├── models/             # Mongoose models (Listing, Booking, Review, User)
├── routes/             # Express route definitions
├── services/           # Business logic for listings, bookings, reviews, users, and health checks
├── utils/              # Date helpers, pricing calculations, sanitizers, logger, and utilities
├── public/             # Static assets (CSS stylesheets, client-side JS, favicons)
├── views/              # EJS templates and layouts
├── init/               # Sample seed data helper
├── .env.example        # Environment variable template
└── package.json        # Dependencies and start script
```

## Important Notes

- **MongoDB Atlas Configuration:** Booking creation and review updates use MongoDB multi-document transactions, so `ATLASDB_URL` must point to a MongoDB Atlas cluster or a replica-set MongoDB deployment (a standalone non-replica-set local `mongod` will not support transactions).
- **Cloudinary and Mapbox Configuration:** Without valid `CLOUD_*` credentials and `MAP_TOKEN`, basic local development can still start with fallbacks, but live image uploads, forward geocoding, and interactive Mapbox maps require valid tokens.
- **No Online Payment Processing:** Wanderlust does not integrate a payment gateway or collect online payments. Reservations are stored as unpaid booking requests with explicit payment notices shown to guests and hosts.
- **Protect Your Secrets:** Never commit `.env` or any real API keys, database passwords, or session secrets to Git or GitHub.
