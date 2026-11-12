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
    try {
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
    } catch (renderErr) {
      return next(renderErr);
    }
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

function isPlainQuery(obj) {
  if (!obj || typeof obj !== "object" || Array.isArray(obj)) {
    return false;
  }
  const proto = Object.getPrototypeOf(obj);
  return proto === Object.prototype || proto === null;
}

function readScalarQueryParam(query, key) {
  if (!Object.prototype.hasOwnProperty.call(query, key)) {
    return undefined;
  }
  const value = query[key];
  if (value === undefined || value === null || value === "") {
    return undefined;
  }
  if (typeof value !== "string" && typeof value !== "number") {
    throw new ExpressError(400, "Invalid booking filter parameters.");
  }
  return value;
}

function buildBookingShowLocals(
  booking,
  viewerIdRaw,
  actionError = "",
  cancellationReasonDraft = ""
) {
  const viewerId = String(viewerIdRaw || "");
  const bookingGuestId = String(booking.guest?._id || booking.guest || "");
  const bookingHostId = String(booking.host?._id || booking.host || "");
  const viewerRole =
    bookingGuestId === viewerId
      ? "guest"
      : bookingHostId === viewerId
        ? "host"
        : "viewer";

  const canGuestCancel =
    viewerRole === "guest" &&
    (typeof bookingService.isGuestCancellable === "function"
      ? bookingService.isGuestCancellable(booking)
      : ["pending", "confirmed"].includes(booking.status));

  const hostActions =
    viewerRole === "host" &&
    typeof bookingService.getAllowedHostActions === "function"
      ? bookingService.getAllowedHostActions(booking)
      : { canConfirm: false, canCancel: false, canComplete: false };

  return {
    pageTitle: `Booking ${booking.bookingReference}`,
    booking,
    viewerRole,
    canGuestCancel,
    hostActions,
    actionError,
    cancellationReasonDraft,
    checkInIso: formatCalendarDate(booking.checkIn),
    checkOutIso: formatCalendarDate(booking.checkOut),
    checkInFormatted: formatUtcDisplayDate(booking.checkIn),
    checkOutFormatted: formatUtcDisplayDate(booking.checkOut),
    createdAtFormatted: formatCreatedTimestamp(booking.createdAt),
    confirmedAtFormatted: formatCreatedTimestamp(booking.confirmedAt),
    cancelledAtFormatted: formatCreatedTimestamp(booking.cancelledAt),
    completedAtFormatted: formatCreatedTimestamp(booking.completedAt),
    formatINR,
    paymentNotice: bookingService.PAYMENT_UNSUPPORTED_NOTICE,
  };
}

module.exports.listGuestBookings = async (req, res) => {
  const rawQuery = req.query || {};
  if (!isPlainQuery(rawQuery)) {
    throw new ExpressError(400, "Invalid booking filter parameters.");
  }

  // Strictly derive ownership from req.user._id; ignore any guest/user ID in req.query.
  const statusParam = readScalarQueryParam(rawQuery, "status");
  const pageParam = readScalarQueryParam(rawQuery, "page");
  const limitParam = readScalarQueryParam(rawQuery, "limit");

  const result = await bookingService.getGuestBookings(req.user?._id, {
    status: statusParam,
    page: pageParam,
    limit: limitParam !== undefined ? limitParam : 8,
  });

  const bookingCards = (result.bookings || []).map((booking) => ({
    booking,
    checkInIso: formatCalendarDate(booking.checkIn),
    checkOutIso: formatCalendarDate(booking.checkOut),
    checkInFormatted: formatUtcDisplayDate(booking.checkIn),
    checkOutFormatted: formatUtcDisplayDate(booking.checkOut),
    createdAtFormatted: formatCreatedTimestamp(booking.createdAt),
    canGuestCancel:
      typeof bookingService.isGuestCancellable === "function"
        ? bookingService.isGuestCancellable(booking)
        : ["pending", "confirmed"].includes(booking.status),
  }));

  const activeStatus = result.activeStatus || "";
  const buildBookingsUrl = (overrides = {}) => {
    const params = new URLSearchParams();
    const nextStatus = Object.prototype.hasOwnProperty.call(overrides, "status")
      ? overrides.status
      : activeStatus;
    const nextPage = Object.prototype.hasOwnProperty.call(overrides, "page")
      ? overrides.page
      : result.pageInfo?.page;

    if (nextStatus) {
      params.set("status", String(nextStatus));
    }
    if (nextPage && Number(nextPage) > 1) {
      params.set("page", String(nextPage));
    }
    const qs = params.toString();
    return qs ? `/bookings?${qs}` : "/bookings";
  };

  res.render("bookings/index.ejs", {
    pageTitle: "My Bookings",
    bookings: result.bookings,
    bookingCards,
    stats: result.stats,
    activeStatus,
    pageInfo: result.pageInfo,
    buildBookingsUrl,
    formatINR,
    paymentNotice: bookingService.PAYMENT_UNSUPPORTED_NOTICE,
  });
};

module.exports.showBooking = async (req, res, next) => {
  const booking = await bookingService.findBookingById(req.params.id, {
    actorId: req.user?._id,
  });
  if (!booking) {
    return next(new ExpressError(404, "Booking Not Found"));
  }

  res.render(
    "bookings/show.ejs",
    buildBookingShowLocals(booking, req.user?._id)
  );
};

module.exports.cancelGuestBooking = async (req, res, next) => {
  const bookingId = req.params.id;
  const guestId = req.user?._id;
  const reason = req.validatedBookingCancellation?.reason ?? "";

  if (req.bookingCancelValidationError) {
    try {
      const booking = await bookingService.findBookingById(bookingId, {
        actorId: guestId,
        role: "guest",
      });
      if (!booking) {
        return next(new ExpressError(404, "Booking Not Found"));
      }
      return res
        .status(400)
        .render(
          "bookings/show.ejs",
          buildBookingShowLocals(
            booking,
            guestId,
            req.bookingCancelValidationError,
            reason
          )
        );
    } catch (renderErr) {
      return next(renderErr);
    }
  }

  try {
    const updatedBooking = await bookingService.cancelBooking(
      bookingId,
      guestId,
      { role: "guest", reason }
    );

    req.flash(
      "success",
      "Reservation cancelled. Reserved dates have been released. Payment has not been collected for this reservation."
    );
    return res.redirect(`/bookings/${updatedBooking._id}`);
  } catch (err) {
    if (err instanceof ExpressError && err.statusCode === 400) {
      const booking = await bookingService.findBookingById(bookingId, {
        actorId: guestId,
        role: "guest",
      });
      if (!booking) {
        return next(new ExpressError(404, "Booking Not Found"));
      }
      return res
        .status(400)
        .render(
          "bookings/show.ejs",
          buildBookingShowLocals(booking, guestId, err.message, reason)
        );
    }

    return next(err);
  }
};

module.exports.listHostBookings = async (req, res) => {
  const rawQuery = req.query || {};
  if (!isPlainQuery(rawQuery)) {
    throw new ExpressError(400, "Invalid host booking filter parameters.");
  }

  // Strictly derive host identity from req.user._id; ignore any host/user/owner query parameters.
  const statusParam = readScalarQueryParam(rawQuery, "status");
  const listingIdParam = readScalarQueryParam(rawQuery, "listingId");
  const pageParam = readScalarQueryParam(rawQuery, "page");
  const limitParam = readScalarQueryParam(rawQuery, "limit");

  const result = await bookingService.getHostBookings(req.user?._id, {
    status: statusParam,
    listingId: listingIdParam,
    page: pageParam,
    limit: limitParam !== undefined ? limitParam : 8,
  });

  const bookingCards = (result.bookings || []).map((booking) => ({
    booking,
    checkInIso: formatCalendarDate(booking.checkIn),
    checkOutIso: formatCalendarDate(booking.checkOut),
    checkInFormatted: formatUtcDisplayDate(booking.checkIn),
    checkOutFormatted: formatUtcDisplayDate(booking.checkOut),
    createdAtFormatted: formatCreatedTimestamp(booking.createdAt),
    hostActions:
      typeof bookingService.getAllowedHostActions === "function"
        ? bookingService.getAllowedHostActions(booking)
        : { canConfirm: false, canCancel: false, canComplete: false },
  }));

  const activeStatus = result.activeStatus || "";
  const activeListingId = result.activeListingId || "";
  const buildHostBookingsUrl = (overrides = {}) => {
    const params = new URLSearchParams();
    const nextStatus = Object.prototype.hasOwnProperty.call(overrides, "status")
      ? overrides.status
      : activeStatus;
    const nextListingId = Object.prototype.hasOwnProperty.call(overrides, "listingId")
      ? overrides.listingId
      : activeListingId;
    const nextPage = Object.prototype.hasOwnProperty.call(overrides, "page")
      ? overrides.page
      : result.pageInfo?.page;

    if (nextStatus) {
      params.set("status", String(nextStatus));
    }
    if (nextListingId) {
      params.set("listingId", String(nextListingId));
    }
    if (nextPage && Number(nextPage) > 1) {
      params.set("page", String(nextPage));
    }
    const qs = params.toString();
    return qs ? `/host/bookings?${qs}` : "/host/bookings";
  };

  res.render("host/bookings.ejs", {
    pageTitle: "Host Bookings",
    bookings: result.bookings,
    bookingCards,
    stats: result.stats,
    ownedListings: result.ownedListings || [],
    activeStatus,
    activeListingId,
    pageInfo: result.pageInfo,
    buildHostBookingsUrl,
    formatINR,
    paymentNotice: bookingService.PAYMENT_UNSUPPORTED_NOTICE,
  });
};

module.exports.updateHostBookingStatus = async (req, res, next) => {
  const bookingId = req.params.id;
  const hostId = req.user?._id;
  const payload = req.validatedHostStatusUpdate || {};
  const targetStatus = payload.status || "";
  const reason = payload.reason || "";

  if (req.hostStatusValidationError) {
    try {
      const booking = await bookingService.findBookingById(bookingId, {
        actorId: hostId,
        role: "host",
      });
      if (!booking) {
        return next(new ExpressError(404, "Booking Not Found"));
      }
      return res
        .status(400)
        .render(
          "bookings/show.ejs",
          buildBookingShowLocals(
            booking,
            hostId,
            req.hostStatusValidationError,
            reason
          )
        );
    } catch (err) {
      return next(err);
    }
  }

  try {
    const updatedBooking = await bookingService.updateBookingStatus(
      bookingId,
      targetStatus,
      hostId,
      { reason }
    );

    if (updatedBooking.status === "confirmed") {
      req.flash(
        "success",
        "Reservation confirmed. Payment has not been collected for this reservation."
      );
    } else if (updatedBooking.status === "cancelled") {
      req.flash(
        "success",
        "Reservation cancelled by host. Reserved calendar dates have been released. Payment has not been collected."
      );
    } else if (updatedBooking.status === "completed") {
      req.flash("success", "Reservation marked as completed.");
    }

    return res.redirect(`/bookings/${updatedBooking._id}`);
  } catch (err) {
    if (err instanceof ExpressError && err.statusCode === 400) {
      const booking = await bookingService.findBookingById(bookingId, {
        actorId: hostId,
        role: "host",
      });
      if (!booking) {
        return next(new ExpressError(404, "Booking Not Found"));
      }
      return res
        .status(400)
        .render(
          "bookings/show.ejs",
          buildBookingShowLocals(booking, hostId, err.message, reason)
        );
    }

    return next(err);
  }
};

