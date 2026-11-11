const express = require("express");
const router = express.Router();

const listingRouter = require("./listing.js");
const reviewRouter = require("./review.js");
const userRouter = require("./user.js");

// Home route
router.get("/", (req, res) => {
  res.redirect("/listings");
});

router.use("/listings", listingRouter);
router.use("/listings/:id/reviews", reviewRouter);
router.use("/", userRouter);

module.exports = router;

