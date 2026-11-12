const express = require("express");
const router = express.Router();
const wrapAsync = require("../utils/wrapAsync.js");
const {
  isLoggedIn,
  validateBooking,
  validateBookingCancellation,
  validateHostBookingStatusUpdate,
} = require("../middleware");
const bookingController = require("../controllers/bookings.js");

router
  .route("/listings/:id/book")
  .get(isLoggedIn, wrapAsync(bookingController.renderBookingReview))
  .post(isLoggedIn, validateBooking, wrapAsync(bookingController.createBooking));

router.get("/bookings", isLoggedIn, wrapAsync(bookingController.listGuestBookings));
router.get("/bookings/:id", isLoggedIn, wrapAsync(bookingController.showBooking));
router.post(
  "/bookings/:id/cancel",
  isLoggedIn,
  validateBookingCancellation,
  wrapAsync(bookingController.cancelGuestBooking)
);

router.get("/host/bookings", isLoggedIn, wrapAsync(bookingController.listHostBookings));
router.post(
  "/host/bookings/:id/status",
  isLoggedIn,
  validateHostBookingStatusUpdate,
  wrapAsync(bookingController.updateHostBookingStatus)
);

module.exports = router;

