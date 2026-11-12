const Joi = require("joi");
const { LISTING_CATEGORY_SLUGS } = require("./utils/listingOptions.js");

module.exports.listingSchema = Joi.object({
  title: Joi.string().trim().required(),
  description: Joi.string().trim().required(),
  image: Joi.string().allow(""),
  price: Joi.number().min(0).required(),
  country: Joi.string().trim().required(),
  location: Joi.string().trim().required(),
  category: Joi.string()
    .trim()
    .lowercase()
    .valid(...LISTING_CATEGORY_SLUGS, "")
    .optional(),
});

module.exports.reviewSchema = Joi.object({
  review: Joi.object({
    rating: Joi.number().integer().required().min(1).max(5),
    comment: Joi.string().trim().required(),
  }).required(),
});

module.exports.signupSchema = Joi.object({
  username: Joi.string().trim().min(1).required(),
  email: Joi.string().trim().email({ tlds: { allow: false } }).required(),
  password: Joi.string().min(1).required(),
});

module.exports.profileUpdateSchema = Joi.object({
  email: Joi.string().trim().email({ tlds: { allow: false } }).max(254).required(),
  displayName: Joi.string().trim().max(80).allow("").optional(),
  bio: Joi.string().trim().max(500).allow("").optional(),
  location: Joi.string().trim().max(100).allow("").optional(),
});

module.exports.bookingSchema = Joi.object({
  checkIn: Joi.string().trim().required(),
  checkOut: Joi.string().trim().required(),
  guests: Joi.number().integer().min(1).max(50).required(),
});
