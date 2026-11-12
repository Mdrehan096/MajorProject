const mongoose = require("mongoose");
const Schema = mongoose.Schema;
const Review = require("./review.js");
const { LISTING_CATEGORY_SLUGS } = require("../utils/listingOptions.js");

const listingSchema = new Schema({
  title: {
    type: String,
    required: true,
  },
  description: String,
  image: {
    url: String,
    filename: String,
  },
  price: Number,
  location: String,
  country: String,
  category: {
    type: String,
    enum: [...LISTING_CATEGORY_SLUGS],
  },
  maxGuests: {
    type: Number,
    min: 1,
    max: 50,
    validate: {
      validator(value) {
        return value === undefined || value === null || Number.isInteger(value);
      },
      message: "Listing capacity must be a whole number of guests.",
    },
  },
  bookingVersion: {
    type: Number,
    default: 0,
    select: false,
  },
  reviews: [
    {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Review",
    },
  ],
  owner: {
    type: Schema.Types.ObjectId,
    ref: "User",
  },

  geometry: {
    type: {
      type: String,
      enum: ["Point"],
      required: true,
    },
    coordinates: {
      type: [Number],
      required: true,
    },
  },
});

listingSchema.index({ price: 1, _id: 1 });
listingSchema.index({ category: 1, _id: -1 });
listingSchema.index({ category: 1, price: 1, _id: 1 });
listingSchema.index({ owner: 1, _id: -1 });
listingSchema.index({ reviews: 1 });

listingSchema.post("findOneAndDelete", async (listing) => {
  if (listing) {
    await Review.deleteMany({ _id: { $in: listing.reviews } });
  }
});

const Listing = mongoose.model("Listing", listingSchema);
module.exports = Listing;
