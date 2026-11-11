const crypto = require("node:crypto");
const path = require("node:path");
const express = require("express");
const methodOverride = require("method-override");
const ejsMate = require("ejs-mate");
const flash = require("connect-flash");

const { env, validateCoreEnv } = require("./config/env.js");
const { createSessionOptions } = require("./config/session.js");
const { configurePassport } = require("./config/passport.js");
const ExpressError = require("./utils/ExpressError.js");
const safeJson = require("./utils/safeJson.js");
const { cleanupFileIfUncommitted } = require("./utils/cloudinaryCleanup.js");
const {
  attachCsrfToken,
  verifyCsrf,
  loginRateLimiter,
  signupRateLimiter,
} = require("./middleware.js");

const listingRouter = require("./routes/listing.js");
const reviewRouter = require("./routes/review.js");
const userRouter = require("./routes/user.js");

function securityHeadersMiddleware(isProduction) {
  return (req, res, next) => {
    const cspNonce = crypto.randomBytes(16).toString("base64");
    res.locals.cspNonce = cspNonce;

    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-Frame-Options", "SAMEORIGIN");
    res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
    res.setHeader("X-DNS-Prefetch-Control", "off");
    res.setHeader(
      "Content-Security-Policy",
      [
        "default-src 'self'",
        `script-src 'self' 'nonce-${cspNonce}' 'wasm-unsafe-eval' https://cdn.jsdelivr.net https://api.mapbox.com`,
        "style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net https://cdnjs.cloudflare.com https://api.mapbox.com",
        "font-src 'self' data: https://cdnjs.cloudflare.com https://cdn.jsdelivr.net",
        "img-src 'self' data: blob: https://res.cloudinary.com https://images.unsplash.com https://plus.unsplash.com https://*.mapbox.com https://*.tiles.mapbox.com",
        "connect-src 'self' https://api.mapbox.com https://*.tiles.mapbox.com https://events.mapbox.com https://cdn.jsdelivr.net",
        "worker-src 'self' blob:",
        "child-src 'self' blob:",
        "object-src 'none'",
        "base-uri 'self'",
        "form-action 'self'",
        "frame-ancestors 'self'",
      ].join("; ")
    );

    if (isProduction) {
      res.setHeader(
        "Strict-Transport-Security",
        "max-age=15552000; includeSubDomains"
      );
    }
    next();
  };
}

function isMultipartListingUploadRoute(req) {
  if (!req.is("multipart/form-data")) {
    return false;
  }
  const normalizedPath = req.path.replace(/\/+$/, "") || "/";
  if (req.method === "POST" && normalizedPath === "/listings") {
    return true;
  }
  if (req.method === "PUT" && /^\/listings\/[^/]+$/.test(normalizedPath)) {
    return true;
  }
  return false;
}

function createApp({ sessionStore, sessionOptions } = {}) {
  const sessionMiddlewareFactory = require("express-session");

  if (!sessionStore && !sessionOptions) {
    validateCoreEnv(env);
  }

  const app = express();
  const isProduction = env.isProduction;

  app.disable("x-powered-by");
  if (isProduction) {
    app.set("trust proxy", 1);
  }

  app.use(securityHeadersMiddleware(isProduction));

  app.use(express.urlencoded({ extended: true }));
  app.use(express.json());
  app.use(methodOverride("_method"));
  app.use(express.static(path.join(__dirname, "public")));
  app.engine("ejs", ejsMate);
  app.set("view engine", "ejs");
  app.set("views", path.join(__dirname, "views"));

  const resolvedSessionOptions =
    sessionOptions ||
    createSessionOptions({
      store: sessionStore,
      mongoUrl: env.atlasDbUrl,
      secret: env.sessionSecret,
      isProduction,
    });
  app.use(sessionMiddlewareFactory(resolvedSessionOptions));
  app.use(flash());

  configurePassport(app);

  app.use((req, res, next) => {
    res.locals.success = req.flash("success");
    res.locals.error = req.flash("error");
    res.locals.currUser = req.user;
    res.locals.safeJson = safeJson;
    next();
  });

  app.use(attachCsrfToken);

  app.use((req, res, next) => {
    if (req.method === "POST") {
      const normalizedPath = req.path.replace(/\/+$/, "") || "/";
      if (normalizedPath === "/login") {
        return loginRateLimiter(req, res, next);
      }
      if (normalizedPath === "/signup") {
        return signupRateLimiter(req, res, next);
      }
    }
    next();
  });

  // Multipart upload routes verify CSRF immediately after Multer parses fields.
  app.use((req, res, next) => {
    if (isMultipartListingUploadRoute(req)) {
      return next();
    }
    return verifyCsrf(req, res, next);
  });

  // HOME ROUTE
  app.get("/", (req, res) => {
    res.redirect("/listings");
  });

  app.use("/listings", listingRouter);
  app.use("/listings/:id/reviews", reviewRouter);
  app.use("/", userRouter);

  // 404
  app.use((req, res, next) => {
    next(new ExpressError(404, "Page Not Found"));
  });

  // Error handler
  app.use((err, req, res, next) => {
    if (res.headersSent) {
      return next(err);
    }

    Promise.resolve(cleanupFileIfUncommitted(req)).finally(() => {
      const statusCode =
        err.statusCode || (err.name === "CastError" ? 400 : 500);
      const rawMessage = err?.message || "Something went wrong!";
      const message =
        statusCode >= 500 && isProduction ? "Something went wrong!" : rawMessage;

      console.error(
        `[Error] ${req.method} ${req.originalUrl} -> ${statusCode}: ${rawMessage}`
      );
      res.status(statusCode).render("error.ejs", { message });
    });
  });

  app.closeSessionStore = async () => {
    const store = resolvedSessionOptions?.store;
    if (!store) {
      return;
    }
    if (store.collectionP) {
      await Promise.resolve(store.collectionP).catch(() => {});
    }
    if (!store._usesMongooseClient && typeof store.close === "function") {
      await store.close();
    }
  };

  return app;
}

const app = createApp();
app.createApp = createApp;

module.exports = app;
