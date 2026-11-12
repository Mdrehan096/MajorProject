const express = require("express");
const router = express.Router();
const wrapAsync = require("../utils/wrapAsync.js");
const { isLoggedIn, validateBooking } = require("../middleware");
const bookingController = require("../controllers/bookings.js");

router
  .route("/listings/:id/book")
  .get(isLoggedIn, wrapAsync(bookingController.renderBookingReview))
  .post(isLoggedIn, validateBooking, wrapAsync(bookingController.createBooking));

router.get("/bookings/:id", isLoggedIn, wrapAsync(bookingController.showBooking));

module.exports = router;

