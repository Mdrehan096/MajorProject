const ExpressError = require("../utils/ExpressError.js");
const {
  listingSchema,
  reviewSchema,
  signupSchema,
  profileUpdateSchema,
  bookingSchema,
  bookingCancellationSchema,
} = require("../schema.js");
const { cleanupFileIfUncommitted } = require("../utils/cloudinaryCleanup.js");

function isPlainObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function isStrictScalarOrUndefined(value) {
  return (
    value === undefined ||
    value === null ||
    typeof value === "string" ||
    typeof value === "number"
  );
}

async function validateListing(req, res, next) {
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
}

function validateReview(req, res, next) {
  const { _csrf, ...reviewPayload } = req.body || {};
  const { error, value } = reviewSchema.validate(reviewPayload);

  if (error) {
    const errMsg = error.details.map((el) => el.message).join(",");
    throw new ExpressError(400, errMsg);
  }
  req.body = value;
  next();
}

function validateSignup(req, res, next) {
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
}

function validateLogin(req, res, next) {
  if (
    typeof req.body?.username !== "string" ||
    typeof req.body?.password !== "string"
  ) {
    req.flash("error", "Invalid username or password format.");
    return res.redirect("/login");
  }
  next();
}

function validateProfileUpdate(req, res, next) {
  const { _csrf, ...profilePayload } = req.body || {};
  const { error, value } = profileUpdateSchema.validate(profilePayload);
  if (error) {
    req.flash("error", error.details[0].message);
    return res.redirect("/profile");
  }
  req.body = value;
  next();
}

function validateBooking(req, res, next) {
  const listingId = req.params?.id;
  if (typeof listingId !== "string" || !/^[0-9a-fA-F]{24}$/.test(listingId)) {
    return next(new ExpressError(400, "Invalid Listing ID"));
  }

  if (req.body !== undefined && req.body !== null && !isPlainObject(req.body)) {
    return next(new ExpressError(400, "Invalid booking request payload."));
  }

  const body = req.body || {};
  let source = body;
  if (Object.prototype.hasOwnProperty.call(body, "booking")) {
    if (!isPlainObject(body.booking)) {
      return next(new ExpressError(400, "Invalid booking payload."));
    }
    source = body.booking;
  }

  if (
    !isStrictScalarOrUndefined(source.checkIn) ||
    !isStrictScalarOrUndefined(source.checkOut) ||
    !isStrictScalarOrUndefined(source.guests)
  ) {
    return next(new ExpressError(400, "Invalid booking input format."));
  }

  const sanitizedInput = {
    checkIn:
      source.checkIn === undefined || source.checkIn === null
        ? ""
        : String(source.checkIn).trim(),
    checkOut:
      source.checkOut === undefined || source.checkOut === null
        ? ""
        : String(source.checkOut).trim(),
    guests:
      source.guests === undefined || source.guests === null
        ? ""
        : String(source.guests).trim(),
  };

  const { error, value } = bookingSchema.validate(sanitizedInput);
  if (error) {
    req.validatedBooking = sanitizedInput;
    req.bookingValidationError = error.details[0].message;
    return next();
  }

  req.validatedBooking = {
    checkIn: value.checkIn,
    checkOut: value.checkOut,
    guests: value.guests,
  };
  req.bookingValidationError = null;
  return next();
}

function validateBookingCancellation(req, res, next) {
  const bookingId = req.params?.id;
  if (typeof bookingId !== "string" || !/^[0-9a-fA-F]{24}$/.test(bookingId)) {
    return next(new ExpressError(400, "Invalid Booking ID"));
  }

  if (req.body !== undefined && req.body !== null && !isPlainObject(req.body)) {
    return next(new ExpressError(400, "Invalid cancellation request payload."));
  }

  const body = req.body || {};
  if (!isStrictScalarOrUndefined(body.reason)) {
    return next(new ExpressError(400, "Cancellation reason must be text."));
  }

  const sanitizedReason =
    body.reason === undefined || body.reason === null
      ? ""
      : String(body.reason).trim();

  const { error, value } = bookingCancellationSchema.validate({
    reason: sanitizedReason,
  });
  if (error) {
    req.validatedBookingCancellation = { reason: sanitizedReason };
    req.bookingCancelValidationError = error.details[0].message;
    return next();
  }

  req.validatedBookingCancellation = { reason: value.reason || "" };
  req.bookingCancelValidationError = null;
  return next();
}

module.exports = {
  validateListing,
  validateReview,
  validateSignup,
  validateLogin,
  validateProfileUpdate,
  validateBooking,
  validateBookingCancellation,
};

