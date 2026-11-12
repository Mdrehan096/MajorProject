const mongoose = require("mongoose");
const User = require("../models/user");
const Listing = require("../models/listing");
const Review = require("../models/review");
const ExpressError = require("../utils/ExpressError.js");
const { env } = require("../config/env.js");
const {
  computeReviewStats,
  resolveCategoryMeta,
} = require("../utils/listingOptions.js");
const {
  calculatePriceBreakdown,
  resolveTaxConfig,
} = require("../utils/pricing.js");

const ALLOWED_REGISTER_FIELDS = new Set(["username", "email", "password"]);
const ALLOWED_PROFILE_UPDATE_FIELDS = new Set([
  "email",
  "displayName",
  "bio",
  "location",
]);
const BASIC_EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const PROFILE_LIMITS = Object.freeze({
  email: 254,
  displayName: 80,
  bio: 500,
  location: 100,
});

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

function validateUserId(userId) {
  if (!isStrictObjectId(userId)) {
    throw new ExpressError(400, "Invalid User ID");
  }
}

function resolveJoinedAt(userDoc) {
  if (
    userDoc?.createdAt instanceof Date &&
    !Number.isNaN(userDoc.createdAt.getTime())
  ) {
    return userDoc.createdAt;
  }
  if (typeof userDoc?._id?.getTimestamp === "function") {
    const ts = userDoc._id.getTimestamp();
    if (ts instanceof Date && !Number.isNaN(ts.getTime())) {
      return ts;
    }
  }
  return null;
}

function toSafeUserProfile(userDoc) {
  if (!userDoc) {
    return null;
  }
  return {
    _id: userDoc._id,
    username: typeof userDoc.username === "string" ? userDoc.username : "",
    email: typeof userDoc.email === "string" ? userDoc.email : "",
    displayName:
      typeof userDoc.displayName === "string" ? userDoc.displayName : "",
    bio: typeof userDoc.bio === "string" ? userDoc.bio : "",
    location: typeof userDoc.location === "string" ? userDoc.location : "",
    joinedAt: resolveJoinedAt(userDoc),
  };
}

function validateProfileUpdatePayload(payload) {
  if (!isPlainObject(payload)) {
    throw new ExpressError(400, "Invalid profile payload.");
  }

  const unexpectedKeys = Object.keys(payload).filter(
    (key) => !ALLOWED_PROFILE_UPDATE_FIELDS.has(key)
  );
  if (unexpectedKeys.length > 0) {
    throw new ExpressError(
      400,
      `Unexpected field(s) in profile payload: ${unexpectedKeys.join(", ")}`
    );
  }

  const { email } = payload;
  if (typeof email !== "string" || !email.trim()) {
    throw new ExpressError(400, "Please provide a valid email address.");
  }
  const trimmedEmail = email.trim();
  if (
    trimmedEmail.length > PROFILE_LIMITS.email ||
    !BASIC_EMAIL_REGEX.test(trimmedEmail)
  ) {
    throw new ExpressError(400, "Please provide a valid email address.");
  }

  const normalized = { email: trimmedEmail };
  for (const field of ["displayName", "bio", "location"]) {
    if (
      Object.prototype.hasOwnProperty.call(payload, field) &&
      payload[field] !== undefined
    ) {
      if (typeof payload[field] !== "string") {
        throw new ExpressError(400, `"${field}" must be a string.`);
      }
      const trimmed = payload[field].trim();
      if (trimmed.length > PROFILE_LIMITS[field]) {
        throw new ExpressError(
          400,
          `"${field}" cannot exceed ${PROFILE_LIMITS[field]} characters.`
        );
      }
      normalized[field] = trimmed;
    }
  }

  return normalized;
}

async function registerUser(payload) {
  if (!isPlainObject(payload)) {
    throw new ExpressError(400, "Username, email, and password are required.");
  }

  const unexpectedKeys = Object.keys(payload).filter(
    (key) => !ALLOWED_REGISTER_FIELDS.has(key)
  );
  if (unexpectedKeys.length > 0) {
    throw new ExpressError(
      400,
      `Unexpected field(s) in signup payload: ${unexpectedKeys.join(", ")}`
    );
  }

  const { username, email, password } = payload;
  if (
    typeof username !== "string" ||
    !username.trim() ||
    typeof email !== "string" ||
    !email.trim() ||
    typeof password !== "string" ||
    !password
  ) {
    throw new ExpressError(400, "Username, email, and password are required.");
  }

  const trimmedUsername = username.trim();
  const trimmedEmail = email.trim();
  if (!BASIC_EMAIL_REGEX.test(trimmedEmail)) {
    throw new ExpressError(400, "Please provide a valid email address.");
  }

  const newUser = new User({
    username: trimmedUsername,
    email: trimmedEmail,
  });

  return User.register(newUser, password);
}

async function findUserById(userId) {
  validateUserId(userId);

  return User.findById(userId).select("-hash -salt");
}

async function findUserByUsername(username) {
  if (typeof username !== "string" || !username.trim()) {
    throw new ExpressError(400, "Username must be a non-empty string.");
  }

  return User.findOne({ username: username.trim() }).select("-hash -salt");
}

async function getUserProfile(userId) {
  validateUserId(userId);

  const userDoc = await User.findById(userId).select("-hash -salt");
  if (!userDoc) {
    return null;
  }

  const [listingsCount, reviewsCount] = await Promise.all([
    Listing.countDocuments({ owner: userDoc._id }),
    Review.countDocuments({ author: userDoc._id }),
  ]);

  return {
    profile: toSafeUserProfile(userDoc),
    stats: {
      listingsCount,
      reviewsCount,
    },
  };
}

async function updateUserProfile(userId, payload) {
  validateUserId(userId);
  const normalized = validateProfileUpdatePayload(payload);

  const userDoc = await User.findById(userId).select("-hash -salt");
  if (!userDoc) {
    return null;
  }

  userDoc.email = normalized.email;
  if (Object.prototype.hasOwnProperty.call(normalized, "displayName")) {
    userDoc.displayName = normalized.displayName;
  }
  if (Object.prototype.hasOwnProperty.call(normalized, "bio")) {
    userDoc.bio = normalized.bio;
  }
  if (Object.prototype.hasOwnProperty.call(normalized, "location")) {
    userDoc.location = normalized.location;
  }

  await userDoc.save();
  return toSafeUserProfile(userDoc);
}

async function getUserDashboard(userId) {
  validateUserId(userId);

  const userDoc = await User.findById(userId).select("-hash -salt");
  if (!userDoc) {
    return null;
  }

  const [ownedListingsRaw, authoredReviewsRaw] = await Promise.all([
    Listing.find({ owner: userDoc._id })
      .sort({ _id: -1 })
      .populate("reviews", "rating"),
    Review.find({ author: userDoc._id }).sort({ createdAt: -1, _id: -1 }),
  ]);

  const authoredReviewIds = authoredReviewsRaw.map((rev) => rev._id);
  const parentListings =
    authoredReviewIds.length > 0
      ? await Listing.find({ reviews: { $in: authoredReviewIds } }).select(
          "title location country reviews"
        )
      : [];

  const listingByReviewId = new Map();
  for (const parent of parentListings) {
    const refs = Array.isArray(parent.reviews) ? parent.reviews : [];
    for (const revId of refs) {
      listingByReviewId.set(String(revId), {
        _id: parent._id,
        title: parent.title || "Untitled Listing",
        location: parent.location || "",
        country: parent.country || "",
      });
    }
  }

  const taxConfig = resolveTaxConfig(env.pricing);
  let totalReviewsReceived = 0;
  let receivedRatingSum = 0;
  let receivedRatedCount = 0;

  const ownedListings = ownedListingsRaw.map((listing) => {
    const reviewStats = computeReviewStats(listing.reviews);
    totalReviewsReceived += reviewStats.reviewCount;

    const reviewsArr = Array.isArray(listing.reviews) ? listing.reviews : [];
    for (const rev of reviewsArr) {
      const numeric = Number(rev?.rating);
      if (Number.isFinite(numeric) && numeric >= 1 && numeric <= 5) {
        receivedRatingSum += numeric;
        receivedRatedCount += 1;
      }
    }

    return {
      _id: listing._id,
      title: listing.title || "Untitled Listing",
      location: listing.location || "",
      country: listing.country || "",
      price: listing.price,
      image: listing.image || null,
      category: listing.category || "",
      categoryMeta: resolveCategoryMeta(listing.category),
      reviewStats,
      pricing: calculatePriceBreakdown({
        nightlyPrice: listing.price,
        nights: 1,
        taxConfig,
      }),
    };
  });

  const overallAverageRating =
    receivedRatedCount > 0
      ? Math.round((receivedRatingSum / receivedRatedCount) * 10) / 10
      : null;

  const authoredReviews = authoredReviewsRaw.map((review) => ({
    _id: review._id,
    rating: review.rating,
    comment: review.comment || "",
    createdAt: review.createdAt || resolveJoinedAt(review),
    listing: listingByReviewId.get(String(review._id)) || null,
  }));

  return {
    profile: toSafeUserProfile(userDoc),
    stats: {
      totalListings: ownedListings.length,
      totalAuthoredReviews: authoredReviews.length,
      totalReviewsReceived,
      overallAverageRating,
      formattedOverallAverageRating:
        overallAverageRating !== null
          ? overallAverageRating.toFixed(1)
          : null,
    },
    ownedListings,
    authoredReviews,
  };
}

module.exports = {
  registerUser,
  findUserById,
  findUserByUsername,
  toSafeUserProfile,
  getUserProfile,
  updateUserProfile,
  getUserDashboard,
};
