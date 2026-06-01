const Listing = require("../models/listing");
const Review = require("../models/review");
const mongoose = require("mongoose"); 

module.exports.createReview = async (req, res) => {
    console.log("ROUTE HIT ✅");      // 👈 ADD THIS
    console.log("BODY:", req.body);  // 👈 ADD THIS
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      throw new ExpressError(400, "Invalid ID ❌");
    }
    let listing = await Listing.findById(id);
    if (!listing) {
      throw new ExpressError(404, "Listing Not Found ❌");
    }
    let newReview = new Review(req.body.review);
    newReview.author = req.user._id;
    console.log(newReview);
    listing.reviews.push(newReview);
    await newReview.save();        // save review first
    await listing.save();
    req.flash("success", "new Review Created");
    res.redirect(`/listings/${id}`);
  };

  module.exports.destroyReview = async(req,res)=>{
  let { id, reviewId } = req.params;
  await Listing.findByIdAndUpdate(id,{$pull: {reviews: reviewId}});
  await Review.findByIdAndDelete(reviewId);
  req.flash("success", " Review Deleted");
  res.redirect(`/listings/${id}`);
}