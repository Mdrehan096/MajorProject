const mongoose = require("mongoose");
const Listing = require("../models/listing");
const Review = require("../models/review");
const ExpressError = require("../utils/ExpressError.js");

const ALLOWED_REVIEW_FIELDS = new Set(["rating", "comment"]);
const ALLOWED_CREATE_REVIEW_OPTIONS = new Set(["authorId"]);

function isPlainObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function isStrictObjectId(id) {
  if (typeof id === "string") {
    return /^[0-9a-fA-F]{24}$/.test(id);
  }
  return (
    Boolean(id) &&
    typeof id === "object" &&
    (id instanceof mongoose.Types.ObjectId || id._bsontype === "ObjectId") &&
    mongoose.Types.ObjectId.isValid(id)
  );
}

function validateObjectId(id) {
  if (!isStrictObjectId(id)) {
    throw new ExpressError(400, "Invalid ID ❌");
  }
}

function validateReviewPayload(reviewData) {
  if (!isPlainObject(reviewData)) {
    throw new ExpressError(400, '"review" is required');
  }

  const unexpectedKeys = Object.keys(reviewData).filter(
    (key) => !ALLOWED_REVIEW_FIELDS.has(key)
  );
  if (unexpectedKeys.length > 0) {
    throw new ExpressError(
      400,
      `Unexpected field(s) in review payload: ${unexpectedKeys.join(", ")}`
    );
  }

  const rawRating = reviewData.rating;
  let parsedRating;
  if (typeof rawRating === "number") {
    parsedRating = rawRating;
  } else if (typeof rawRating === "string" && rawRating.trim() !== "") {
    parsedRating = Number(rawRating);
  } else {
    throw new ExpressError(
      400,
      '"rating" is required and must be an integer between 1 and 5'
    );
  }

  if (!Number.isInteger(parsedRating) || parsedRating < 1 || parsedRating > 5) {
    throw new ExpressError(
      400,
      '"rating" must be an integer between 1 and 5'
    );
  }

  const rawComment = reviewData.comment;
  if (typeof rawComment !== "string" || !rawComment.trim()) {
    throw new ExpressError(
      400,
      '"comment" is required and must be a non-empty string'
    );
  }

  return {
    rating: parsedRating,
    comment: rawComment.trim(),
  };
}

async function runInTransaction(work) {
  const session = await mongoose.startSession();
  try {
    session.startTransaction();
    const result = await work(session);
    await session.commitTransaction();
    return result;
  } catch (err) {
    const canAbort =
      typeof session.inTransaction !== "function" || session.inTransaction();
    if (canAbort && typeof session.abortTransaction === "function") {
      await session.abortTransaction().catch(() => {});
    }
    throw err;
  } finally {
    await session.endSession();
  }
}

async function findListingOrThrow(listingId, session = null) {
  validateObjectId(listingId);

  const listing = session
    ? await Listing.findById(listingId, null, { session })
    : await Listing.findById(listingId);
  if (!listing) {
    throw new ExpressError(404, "Listing Not Found ❌");
  }

  return listing;
}

async function createReview(listingId, reviewData, options = {}) {
  validateObjectId(listingId);

  if (options !== undefined && !isPlainObject(options)) {
    throw new ExpressError(400, "Invalid review options");
  }
  const resolvedOptions = options || {};
  const unexpectedOptionKeys = Object.keys(resolvedOptions).filter(
    (key) => !ALLOWED_CREATE_REVIEW_OPTIONS.has(key)
  );
  if (unexpectedOptionKeys.length > 0) {
    throw new ExpressError(
      400,
      `Unexpected option field(s): ${unexpectedOptionKeys.join(", ")}`
    );
  }

  const { authorId } = resolvedOptions;
  if (!authorId) {
    throw new ExpressError(400, "Review author is required");
  }
  if (!isStrictObjectId(authorId)) {
    throw new ExpressError(400, "Invalid Review Author ID");
  }

  const { rating, comment } = validateReviewPayload(reviewData);

  return runInTransaction(async (session) => {
    const listing = await findListingOrThrow(listingId, session);

    const newReview = new Review({
      rating,
      comment,
      author: authorId,
    });

    listing.reviews.push(newReview);
    await newReview.save({ session });
    await listing.save({ session });

    return newReview;
  });
}

async function deleteReview(listingId, reviewId) {
  validateObjectId(listingId);
  validateObjectId(reviewId);

  return runInTransaction(async (session) => {
    const listing = await findListingOrThrow(listingId, session);
    const belongsToListing =
      Array.isArray(listing.reviews) &&
      listing.reviews.some((id) =>
        typeof id?.equals === "function"
          ? id.equals(reviewId)
          : String(id) === String(reviewId)
      );

    if (!belongsToListing) {
      throw new ExpressError(404, "Review Not Found ❌");
    }

    const deletedReview = await Review.findByIdAndDelete(reviewId, { session });
    if (!deletedReview) {
      throw new ExpressError(404, "Review Not Found ❌");
    }

    await Listing.findByIdAndUpdate(
      listingId,
      { $pull: { reviews: reviewId } },
      { session }
    );

    return deletedReview;
  });
}

module.exports = {
  validateObjectId,
  findListingOrThrow,
  createReview,
  deleteReview,
};

