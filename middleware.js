const crypto = require("node:crypto");
const path = require("node:path");
const mongoose = require("mongoose");
const multer = require("multer");
const Listing = require("./models/listing");
const Review = require("./models/review");
const ExpressError = require("./utils/ExpressError.js");
const { listingSchema, reviewSchema, signupSchema } = require("./schema.js");
const { env } = require("./config/env.js");
const {
  storage,
  ALLOWED_IMAGE_MIME_TYPES,
  ALLOWED_IMAGE_EXTENSIONS,
  MAX_IMAGE_FILE_SIZE,
} = require("./config/cloudinary.js");
const { cleanupFileIfUncommitted } = require("./utils/cloudinaryCleanup.js");
const { createRateLimiter } = require("./utils/rateLimiter.js");

const authWindowMs = env.rateLimit.authWindowMs;
const authMaxAttempts = env.rateLimit.authMaxAttempts;

module.exports.loginRateLimiter = createRateLimiter({
  windowMs: authWindowMs,
  max: authMaxAttempts,
  keyPrefix: "login",
  message: "Too many login attempts. Please try again later.",
});

module.exports.signupRateLimiter = createRateLimiter({
  windowMs: authWindowMs,
  max: authMaxAttempts,
  keyPrefix: "signup",
  message: "Too many signup attempts. Please try again later.",
});

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

const imageFileFilter = (req, file, cb) => {
  const ext = path.extname(file.originalname || "").toLowerCase();
  const mime = (file.mimetype || "").toLowerCase();

  if (!ALLOWED_IMAGE_MIME_TYPES.has(mime) || !ALLOWED_IMAGE_EXTENSIONS.has(ext)) {
    return cb(
      new ExpressError(
        400,
        "Unsupported file format. Only PNG, JPG, JPEG, and WEBP images are allowed."
      ),
      false
    );
  }

  cb(null, true);
};

const listingUpload = multer({
  storage,
  limits: {
    fileSize: MAX_IMAGE_FILE_SIZE,
    files: 1,
  },
  fileFilter: imageFileFilter,
});

function isValidCsrfToken(submittedToken, sessionToken) {
  if (typeof submittedToken !== "string" || typeof sessionToken !== "string") {
    return false;
  }
  if (!submittedToken || !sessionToken) {
    return false;
  }
  const submittedBuf = Buffer.from(submittedToken, "utf8");
  const sessionBuf = Buffer.from(sessionToken, "utf8");
  if (submittedBuf.length !== sessionBuf.length) {
    return false;
  }
  return crypto.timingSafeEqual(submittedBuf, sessionBuf);
}

module.exports.attachCsrfToken = (req, res, next) => {
  if (req.session && !req.session.csrfToken && SAFE_METHODS.has(req.method)) {
    req.session.csrfToken = crypto.randomBytes(32).toString("hex");
  }
  res.locals.csrfToken = req.session?.csrfToken || "";
  next();
};

module.exports.verifyCsrf = async (req, res, next) => {
  if (SAFE_METHODS.has(req.method)) {
    return next();
  }

  const bodyToken =
    req.body && typeof req.body._csrf === "string" ? req.body._csrf : null;
  const headerToken = req.get("x-csrf-token") || req.get("csrf-token") || null;
  const submittedToken = bodyToken || headerToken;
  const sessionToken = req.session?.csrfToken;

  if (!isValidCsrfToken(submittedToken, sessionToken)) {
    await cleanupFileIfUncommitted(req);
    return next(
      new ExpressError(
        403,
        "Invalid or missing CSRF token. Please refresh the page and try again."
      )
    );
  }

  next();
};

module.exports.uploadListingImage = (req, res, next) => {
  listingUpload.single("listing[image]")(req, res, (err) => {
    if (!err) {
      return next();
    }

    if (err instanceof multer.MulterError) {
      if (err.code === "LIMIT_FILE_SIZE") {
        return next(
          new ExpressError(
            400,
            "File too large. Maximum allowed image size is 5MB."
          )
        );
      }
      if (err.code === "LIMIT_UNEXPECTED_FILE" || err.code === "LIMIT_FILE_COUNT") {
        return next(
          new ExpressError(
            400,
            "Invalid upload field or too many files. Only one image file is allowed."
          )
        );
      }
      return next(new ExpressError(400, `Upload error: ${err.message}`));
    }

    if (err instanceof ExpressError) {
      return next(err);
    }

    const statusCode =
      err.http_code && err.http_code >= 400 && err.http_code < 500
        ? err.http_code
        : 400;
    return next(
      new ExpressError(
        statusCode,
        "Invalid or corrupted image file. Only PNG, JPG, JPEG, and WEBP images are allowed."
      )
    );
  });
};

module.exports.isLoggedIn = (req, res, next) => {
  if (!req.isAuthenticated()) {
    if (req.method === "GET") {
      req.session.redirectUrl = req.originalUrl;
    }
    req.flash("error", "you must be logged in!");
    return res.redirect("/login");
  }
  next();
};

module.exports.saveRedirectUrl = (req, res, next) => {
  if (req.session.redirectUrl) {
    res.locals.redirectUrl = req.session.redirectUrl;
  }
  next();
};

module.exports.isOwner = async (req, res, next) => {
  try {
    let { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return next(new ExpressError(400, "Invalid Listing ID"));
    }
    let listing = await Listing.findById(id);
    if (!listing) {
      req.flash("error", "Listing you requested for does not exist");
      return res.redirect("/listings");
    }
    if (
      !listing.owner ||
      !res.locals.currUser ||
      !listing.owner.equals(res.locals.currUser._id)
    ) {
      req.flash("error", "you are not the owner of this listing");
      return res.redirect(`/listings/${id}`);
    }

    next();
  } catch (err) {
    next(err);
  }
};

module.exports.validateListing = async (req, res, next) => {
  const listing = req.body?.listing;
  if (!listing) {
    await cleanupFileIfUncommitted(req);
    return next(new ExpressError(400, '"listing" is required'));
  }
  const { error, value } = listingSchema.validate(listing);
  if (error) {
    await cleanupFileIfUncommitted(req);
    return next(new ExpressError(400, error.details[0].message));
  }
  req.body.listing = value;
  next();
};

module.exports.validateReview = (req, res, next) => {
  const { _csrf, ...reviewPayload } = req.body || {};
  const { error, value } = reviewSchema.validate(reviewPayload);

  if (error) {
    const errMsg = error.details.map((el) => el.message).join(",");
    throw new ExpressError(400, errMsg);
  }
  req.body = value;
  next();
};

module.exports.validateSignup = (req, res, next) => {
  const { _csrf, ...signupPayload } = req.body || {};
  const { error, value } = signupSchema.validate(signupPayload);
  if (error) {
    req.flash("error", error.details[0].message);
    return res.redirect("/signup");
  }
  req.body.username = value.username;
  req.body.email = value.email;
  req.body.password = value.password;
  next();
};

module.exports.isReviewAuthor = async (req, res, next) => {
  try {
    let { id, reviewId } = req.params;
    if (
      !mongoose.Types.ObjectId.isValid(id) ||
      !mongoose.Types.ObjectId.isValid(reviewId)
    ) {
      return next(new ExpressError(400, "Invalid ID"));
    }
    let review = await Review.findById(reviewId);
    if (!review) {
      req.flash("error", "Review you requested for does not exist");
      return res.redirect(`/listings/${id}`);
    }
    if (
      !review.author ||
      !res.locals.currUser ||
      !review.author.equals(res.locals.currUser._id)
    ) {
      req.flash("error", "you are not the author of this review");
      return res.redirect(`/listings/${id}`);
    }

    next();
  } catch (err) {
    next(err);
  }
};
