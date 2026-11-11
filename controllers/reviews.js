const Listing = require("../models/listing");
const Review = require("../models/review");
const mongoose = require("mongoose");
const ExpressError = require("../utils/ExpressError.js");

module.exports.createReview = async (req, res) => {
  const { id } = req.params;
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new ExpressError(400, "Invalid ID ❌");
  }
  let listing = await Listing.findById(id);
  if (!listing) {
    throw new ExpressError(404, "Listing Not Found ❌");
  }
  let newReview = new Review({
    rating: req.body.review.rating,
    comment: req.body.review.comment,
  });
  newReview.author = req.user._id;
  listing.reviews.push(newReview);
  await newReview.save();
  await listing.save();
  req.flash("success", "new Review Created");
  res.redirect(`/listings/${id}`);
};

module.exports.destroyReview = async (req, res) => {
  let { id, reviewId } = req.params;
  if (
    !mongoose.Types.ObjectId.isValid(id) ||
    !mongoose.Types.ObjectId.isValid(reviewId)
  ) {
    throw new ExpressError(400, "Invalid ID ❌");
  }
  await Listing.findByIdAndUpdate(id, { $pull: { reviews: reviewId } });
  await Review.findByIdAndDelete(reviewId);
  req.flash("success", " Review Deleted");
  res.redirect(`/listings/${id}`);
};
