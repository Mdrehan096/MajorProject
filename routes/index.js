const express = require("express");
const router = express.Router();

const listingRouter = require("./listing.js");
const reviewRouter = require("./review.js");
const bookingRouter = require("./booking.js");
const userRouter = require("./user.js");
const legalRouter = require("./legal.js");

// Home route
router.get("/", (req, res) => {
  res.redirect("/listings");
});

router.use("/listings", listingRouter);
router.use("/listings/:id/reviews", reviewRouter);
router.use("/", bookingRouter);
router.use("/", userRouter);
router.use("/", legalRouter);

module.exports = router;

