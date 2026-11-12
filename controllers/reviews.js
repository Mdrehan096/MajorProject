const reviewService = require("../services/reviewService.js");

module.exports.createReview = async (req, res) => {
  const { id } = req.params;
  await reviewService.createReview(id, req.body?.review, {
    authorId: req.user?._id,
  });
  req.flash("success", "new Review Created");
  res.redirect(`/listings/${id}`);
};

module.exports.destroyReview = async (req, res) => {
  const { id, reviewId } = req.params;
  await reviewService.deleteReview(id, reviewId);
  req.flash("success", " Review Deleted");
  res.redirect(`/listings/${id}`);
};
