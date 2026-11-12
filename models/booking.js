const mongoose = require("mongoose");
const { VALID_TAX_MODES } = require("../config/env.js");

const Schema = mongoose.Schema;

const BOOKING_STATUSES = Object.freeze([
  "pending",
  "confirmed",
  "cancelled",
  "completed",
]);
const ACTIVE_BOOKING_STATUSES = Object.freeze(["pending", "confirmed"]);
const TERMINAL_BOOKING_STATUSES = Object.freeze(["cancelled", "completed"]);
const CANCELLATION_ACTORS = Object.freeze(["guest", "host", "system"]);

const bookingPricingSnapshotSchema = new Schema(
  {
    nightlyPrice: {
      type: Number,
      required: true,
      min: 0,
    },
    nights: {
      type: Number,
      required: true,
      min: 1,
      max: 365,
      validate: {
        validator: Number.isInteger,
        message: "Nights must be a whole number.",
      },
    },
    subtotal: {
      type: Number,
      required: true,
      min: 0,
    },
    taxAmount: {
      type: Number,
      required: true,
      min: 0,
      default: 0,
    },
    taxRatePercent: {
      type: Number,
      required: true,
      min: 0,
      max: 100,
      default: 0,
    },
    taxLabel: {
      type: String,
      required: true,
      trim: true,
      default: "Estimated GST",
    },
    taxMode: {
      type: String,
      required: true,
      enum: [...VALID_TAX_MODES],
    },
    taxDescription: {
      type: String,
      trim: true,
      default: "",
    },
    totalPrice: {
      type: Number,
      required: true,
      min: 0,
    },
    currency: {
      type: String,
      required: true,
      enum: ["INR"],
      default: "INR",
    },
  },
  { _id: false }
);

const bookingListingSnapshotSchema = new Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: 200,
    },
    location: {
      type: String,
      trim: true,
      default: "",
      maxlength: 200,
    },
    country: {
      type: String,
      trim: true,
      default: "",
      maxlength: 120,
    },
    imageUrl: {
      type: String,
      trim: true,
      default: "",
    },
  },
  { _id: false }
);

const bookingSchema = new Schema(
  {
    bookingReference: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
      maxlength: 32,
    },
    listing: {
      type: Schema.Types.ObjectId,
      ref: "Listing",
      required: true,
    },
    guest: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    host: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      validate: {
        validator(value) {
          return !(this.guest && value && String(this.guest) === String(value));
        },
        message: "Host and guest cannot be the same user.",
      },
    },
    checkIn: {
      type: Date,
      required: true,
    },
    checkOut: {
      type: Date,
      required: true,
      validate: {
        validator(value) {
          return (
            this.checkIn instanceof Date &&
            !Number.isNaN(this.checkIn.getTime()) &&
            value instanceof Date &&
            !Number.isNaN(value.getTime()) &&
            value.getTime() > this.checkIn.getTime()
          );
        },
        message: "Check-out date must be after check-in date.",
      },
    },
    guests: {
      type: Number,
      required: true,
      min: 1,
      max: 50,
      validate: {
        validator: Number.isInteger,
        message: "Guest count must be a whole number.",
      },
    },
    pricing: {
      type: bookingPricingSnapshotSchema,
      required: true,
    },
    listingSnapshot: {
      type: bookingListingSnapshotSchema,
      required: true,
    },
    status: {
      type: String,
      required: true,
      enum: [...BOOKING_STATUSES],
      default: "pending",
    },
    confirmedAt: {
      type: Date,
      default: null,
    },
    cancelledAt: {
      type: Date,
      default: null,
    },
    cancelledBy: {
      type: String,
      enum: [...CANCELLATION_ACTORS, null],
      default: null,
    },
    cancellationReason: {
      type: String,
      trim: true,
      maxlength: 300,
      default: "",
    },
    completedAt: {
      type: Date,
      default: null,
    },
    paymentNotice: {
      type: String,
      trim: true,
      default:
        "Reservation request only — online payment processing is not enabled.",
    },
  },
  { timestamps: true }
);

bookingSchema.index({ listing: 1, status: 1, checkIn: 1, checkOut: 1 });
bookingSchema.index({ guest: 1, createdAt: -1, _id: -1 });
bookingSchema.index({ host: 1, status: 1, createdAt: -1, _id: -1 });
bookingSchema.index({ bookingReference: 1 }, { unique: true });

const Booking = mongoose.model("Booking", bookingSchema);

module.exports = Booking;
module.exports.BOOKING_STATUSES = BOOKING_STATUSES;
module.exports.ACTIVE_BOOKING_STATUSES = ACTIVE_BOOKING_STATUSES;
module.exports.TERMINAL_BOOKING_STATUSES = TERMINAL_BOOKING_STATUSES;
module.exports.CANCELLATION_ACTORS = CANCELLATION_ACTORS;

