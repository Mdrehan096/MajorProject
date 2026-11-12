const mongoose = require("mongoose");
const Listing = require("../models/listing");
const Review = require("../models/review");
const ExpressError = require("../utils/ExpressError.js");

function isLoggedIn(req, res, next) {
  if (!req.isAuthenticated()) {
    if (req.method === "GET") {
      req.session.redirectUrl = req.originalUrl;
    }
    req.flash("error", "you must be logged in!");
    return res.redirect("/login");
  }
  next();
}

function saveRedirectUrl(req, res, next) {
  if (req.session.redirectUrl) {
    res.locals.redirectUrl = req.session.redirectUrl;
  }
  next();
}

async function isOwner(req, res, next) {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return next(new ExpressError(400, "Invalid Listing ID"));
    }
    const listing = await Listing.findById(id);
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
}

async function isReviewAuthor(req, res, next) {
  try {
    const { id, reviewId } = req.params;
    if (
      !mongoose.Types.ObjectId.isValid(id) ||
      !mongoose.Types.ObjectId.isValid(reviewId)
    ) {
      return next(new ExpressError(400, "Invalid ID"));
    }

    const [listing, review] = await Promise.all([
      Listing.findById(id),
      Review.findById(reviewId),
    ]);

    if (!listing) {
      req.flash("error", "Listing you requested for does not exist");
      return res.redirect("/listings");
    }

    const belongsToListing =
      review &&
      Array.isArray(listing.reviews) &&
      listing.reviews.some((rid) =>
        typeof rid?.equals === "function"
          ? rid.equals(review._id)
          : String(rid) === String(review._id)
      );

    if (!review || !belongsToListing) {
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
}

module.exports = {
  isLoggedIn,
  saveRedirectUrl,
  isOwner,
  isReviewAuthor,
};

