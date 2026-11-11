const Joi = require("joi");

module.exports.listingSchema = Joi.object({
  title: Joi.string().trim().required(),
  description: Joi.string().trim().required(),
  image: Joi.string().allow(""),
  price: Joi.number().min(0).required(),
  country: Joi.string().trim().required(),
  location: Joi.string().trim().required(),
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
