const bookingService = require("../services/bookingService.js");
const ExpressError = require("../utils/ExpressError.js");
const { formatINR } = require("../utils/pricing.js");
const { formatCalendarDate } = require("../utils/bookingDates.js");

function formatUtcDisplayDate(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
    return "";
  }
  return date.toLocaleDateString("en-IN", {
    timeZone: "UTC",
    weekday: "short",
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function formatCreatedTimestamp(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
    return "";
  }
  return date.toLocaleString("en-IN", {
    timeZone: "UTC",
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
    timeZoneName: "short",
  });
}

module.exports.renderBookingReview = async (req, res) => {
  const reviewData = await bookingService.getBookingReviewDetails(
    req.params.id,
    req.query,
    { actorId: req.user?._id }
  );

  res.render("bookings/new.ejs", {
    ...reviewData,
    pageTitle: `Review Booking — ${reviewData.listing.title}`,
    errorMessage: "",
    formatINR,
  });
};

module.exports.createBooking = async (req, res, next) => {
  const payload = req.validatedBooking || {};
  const checkIn = payload.checkIn ?? "";
  const checkOut = payload.checkOut ?? "";
  const guests = payload.guests ?? "";
  const guestId = req.user?._id;

  if (req.bookingValidationError) {
    const reviewData = await bookingService.getBookingReviewDetails(
      req.params.id,
      { checkIn, checkOut, guests },
      { actorId: guestId }
    );
    return res.status(400).render("bookings/new.ejs", {
      ...reviewData,
      pageTitle: `Review Booking — ${reviewData.listing.title}`,
      errorMessage: req.bookingValidationError,
      formatINR,
    });
  }

  try {
    const createdBooking = await bookingService.createBooking(
      req.params.id,
      { checkIn, checkOut, guests },
      { guestId }
    );

    req.flash(
      "success",
      "Reservation request created! Payment has not been collected."
    );
    return res.redirect(`/bookings/${createdBooking._id}`);
  } catch (err) {
    if (
      err instanceof ExpressError &&
      Number.isInteger(err.statusCode) &&
      err.statusCode >= 400 &&
      err.statusCode < 500
    ) {
      if (err.statusCode === 404 || /Invalid Listing ID/i.test(err.message)) {
        return next(err);
      }

      const reviewData = await bookingService.getBookingReviewDetails(
        req.params.id,
        { checkIn, checkOut, guests },
        { actorId: guestId }
      );
      return res.status(err.statusCode).render("bookings/new.ejs", {
        ...reviewData,
        pageTitle: `Review Booking — ${reviewData.listing.title}`,
        errorMessage: err.message,
        formatINR,
      });
    }

    return next(err);
  }
};

module.exports.showBooking = async (req, res, next) => {
  const booking = await bookingService.findBookingById(req.params.id, {
    actorId: req.user?._id,
  });
  if (!booking) {
    return next(new ExpressError(404, "Booking Not Found"));
  }

  const viewerId = String(req.user?._id || "");
  const bookingGuestId = String(booking.guest?._id || booking.guest || "");
  const bookingHostId = String(booking.host?._id || booking.host || "");
  const viewerRole =
    bookingGuestId === viewerId
      ? "guest"
      : bookingHostId === viewerId
        ? "host"
        : "viewer";

  const checkInIso = formatCalendarDate(booking.checkIn);
  const checkOutIso = formatCalendarDate(booking.checkOut);
  const checkInFormatted = formatUtcDisplayDate(booking.checkIn);
  const checkOutFormatted = formatUtcDisplayDate(booking.checkOut);
  const createdAtFormatted = formatCreatedTimestamp(booking.createdAt);

  res.render("bookings/show.ejs", {
    pageTitle: `Booking ${booking.bookingReference}`,
    booking,
    viewerRole,
    checkInIso,
    checkOutIso,
    checkInFormatted,
    checkOutFormatted,
    createdAtFormatted,
    formatINR,
    paymentNotice: bookingService.PAYMENT_UNSUPPORTED_NOTICE,
  });
};

