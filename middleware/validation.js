const ExpressError = require("../utils/ExpressError.js");
const {
  listingSchema,
  reviewSchema,
  signupSchema,
  profileUpdateSchema,
} = require("../schema.js");
const { cleanupFileIfUncommitted } = require("../utils/cloudinaryCleanup.js");

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

module.exports = {
  validateListing,
  validateReview,
  validateSignup,
  validateLogin,
  validateProfileUpdate,
};

