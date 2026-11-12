const crypto = require("node:crypto");
const mongoose = require("mongoose");
const Booking = require("../models/booking.js");
const Listing = require("../models/listing.js");
const ExpressError = require("../utils/ExpressError.js");
const { env } = require("../config/env.js");
const {
  calculatePriceBreakdown,
  resolveTaxConfig,
  isValidNonNegativePrice,
} = require("../utils/pricing.js");
const {
  getTodayUtcMidnight,
  formatCalendarDate,
  normalizeStayDates,
} = require("../utils/bookingDates.js");
const { resolveCategoryMeta } = require("../utils/listingOptions.js");

const {
  BOOKING_STATUSES,
  ACTIVE_BOOKING_STATUSES,
  TERMINAL_BOOKING_STATUSES,
} = Booking;

const ALLOWED_CREATE_PAYLOAD_FIELDS = new Set([
  "checkIn",
  "checkOut",
  "guests",
]);
const ALLOWED_CREATE_OPTIONS = new Set([
  "guestId",
  "taxConfig",
  "now",
  "maxRetries",
]);
const ALLOWED_REVIEW_OPTIONS = new Set(["actorId", "taxConfig", "now"]);
const ALLOWED_AVAILABILITY_OPTIONS = new Set([
  "session",
  "excludeBookingId",
  "now",
  "allowPastCheckIn",
  "maxStayNights",
]);
const ALLOWED_LISTING_BLOCKED_OPTIONS = new Set(["now", "fromDate"]);
const ALLOWED_FIND_OPTIONS = new Set(["actorId", "role"]);
const ALLOWED_LIST_OPTIONS = new Set(["status", "listingId", "page", "limit"]);
const DEFAULT_BOOKINGS_PAGE_SIZE = 8;
const MAX_BOOKINGS_PAGE_SIZE = 30;
const ALLOWED_CANCEL_OPTIONS = new Set(["role", "reason", "now", "maxRetries"]);
const ALLOWED_STATUS_UPDATE_OPTIONS = new Set([
  "reason",
  "now",
  "maxRetries",
]);
const ALLOWED_HOST_TARGET_STATUSES = new Set([
  "confirmed",
  "cancelled",
  "completed",
]);
const MAX_CANCELLATION_REASON_LENGTH = 300;
const PAYMENT_UNSUPPORTED_NOTICE =
  "Payment has not been collected. This reservation is not a paid booking.";

function isPlainObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function isStrictObjectId(id) {
  if (typeof id === "string") {
    return /^[0-9a-fA-F]{24}$/.test(id);
  }
  return (
    Boolean(id) &&
    typeof id === "object" &&
    (id instanceof mongoose.Types.ObjectId || id._bsontype === "ObjectId") &&
    mongoose.Types.ObjectId.isValid(id)
  );
}

function validateObjectId(id, label = "ID") {
  if (!isStrictObjectId(id)) {
    throw new ExpressError(400, `Invalid ${label}`);
  }
}

function validateOptions(options, allowedKeys, label = "booking options") {
  if (options === undefined) {
    return {};
  }
  if (!isPlainObject(options)) {
    throw new ExpressError(400, `Invalid ${label}`);
  }
  const unexpectedKeys = Object.keys(options).filter(
    (key) => !allowedKeys.has(key)
  );
  if (unexpectedKeys.length > 0) {
    throw new ExpressError(
      400,
      `Unexpected option field(s): ${unexpectedKeys.join(", ")}`
    );
  }
  return options;
}

function parseGuestCount(rawGuests) {
  let parsed;
  if (typeof rawGuests === "number") {
    parsed = rawGuests;
  } else if (typeof rawGuests === "string") {
    const trimmed = rawGuests.trim();
    if (!/^\d+$/.test(trimmed)) {
      throw new ExpressError(
        400,
        "Guest count must be a positive whole number."
      );
    }
    parsed = Number(trimmed);
  } else {
    throw new ExpressError(400, "Guest count must be a positive whole number.");
  }

  const maxLimit = env.booking?.maxGuestsUpperLimit || 50;
  if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > maxLimit) {
    throw new ExpressError(
      400,
      `Guest count must be an integer between 1 and ${maxLimit}.`
    );
  }

  return parsed;
}

function resolveListingMaxGuests(listing) {
  const upperLimit = env.booking?.maxGuestsUpperLimit || 50;
  const fallback = env.booking?.defaultMaxGuests || 8;
  const rawMax = listing?.maxGuests;

  if (Number.isInteger(rawMax) && rawMax >= 1 && rawMax <= upperLimit) {
    return rawMax;
  }
  return fallback;
}

function validateBookingCreatePayload(payload) {
  if (!isPlainObject(payload)) {
    throw new ExpressError(400, "Booking details are required.");
  }

  const unexpectedKeys = Object.keys(payload).filter(
    (key) => !ALLOWED_CREATE_PAYLOAD_FIELDS.has(key)
  );
  if (unexpectedKeys.length > 0) {
    throw new ExpressError(
      400,
      `Unexpected field(s) in booking payload: ${unexpectedKeys.join(", ")}`
    );
  }

  const guests = parseGuestCount(payload.guests);
  return {
    checkInRaw: payload.checkIn,
    checkOutRaw: payload.checkOut,
    guests,
  };
}

function generateBookingReference(referenceDate = new Date()) {
  const ref =
    referenceDate instanceof Date && !Number.isNaN(referenceDate.getTime())
      ? referenceDate
      : new Date();
  const dateStamp = formatCalendarDate(ref).replace(/-/g, "");
  const suffix = crypto.randomBytes(4).toString("hex").toUpperCase();
  return `WL-${dateStamp}-${suffix}`;
}

function isTransientTransactionError(err) {
  if (!err || typeof err !== "object") {
    return false;
  }
  if (typeof err.hasErrorLabel === "function") {
    if (
      err.hasErrorLabel("TransientTransactionError") ||
      err.hasErrorLabel("UnknownTransactionCommitResult")
    ) {
      return true;
    }
  }
  if (Array.isArray(err.errorLabels)) {
    return (
      err.errorLabels.includes("TransientTransactionError") ||
      err.errorLabels.includes("UnknownTransactionCommitResult")
    );
  }
  return false;
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function runBookingTransactionWithRetry(work, maxRetriesInput) {
  const configuredMax = env.booking?.maxTxRetries || 4;
  const maxAttempts =
    Number.isInteger(maxRetriesInput) && maxRetriesInput >= 1 && maxRetriesInput <= 20
      ? maxRetriesInput
      : configuredMax;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const session = await mongoose.startSession();
    try {
      session.startTransaction({
        readConcern: { level: "snapshot" },
        writeConcern: { w: "majority" },
      });

      const result = await work(session, attempt);

      while (true) {
        try {
          await session.commitTransaction();
          return result;
        } catch (commitErr) {
          if (
            typeof commitErr?.hasErrorLabel === "function" &&
            commitErr.hasErrorLabel("UnknownTransactionCommitResult")
          ) {
            continue;
          }
          throw commitErr;
        }
      }
    } catch (err) {
      const canAbort =
        typeof session.inTransaction !== "function" || session.inTransaction();
      if (canAbort && typeof session.abortTransaction === "function") {
        await session.abortTransaction().catch(() => {});
      }

      if (isTransientTransactionError(err)) {
        if (attempt < maxAttempts) {
          const jitterMs = Math.min(
            35 * 2 ** (attempt - 1) + Math.floor(Math.random() * 65),
            600
          );
          await delay(jitterMs);
          continue;
        }
        throw new ExpressError(
          409,
          "High booking activity on this listing right now. Please try again."
        );
      }
      throw err;
    } finally {
      await session.endSession();
    }
  }
}

function calculateBookingPrice(nightlyPrice, nights, options = {}) {
  const resolvedOpts = validateOptions(
    options,
    new Set(["taxConfig"]),
    "pricing options"
  );

  if (!isValidNonNegativePrice(nightlyPrice)) {
    throw new ExpressError(
      400,
      "This listing does not have a valid bookable nightly price."
    );
  }

  const taxConfig = resolveTaxConfig(resolvedOpts.taxConfig || env.pricing);
  if (
    !Number.isSafeInteger(nights) ||
    nights < 1 ||
    nights > taxConfig.maxStayNights
  ) {
    throw new ExpressError(
      400,
      `Stay duration must be an integer between 1 and ${taxConfig.maxStayNights} nights.`
    );
  }

  const breakdown = calculatePriceBreakdown({
    nightlyPrice,
    nights,
    taxConfig,
  });

  if (!breakdown.isPriceAvailable) {
    throw new ExpressError(
      400,
      "This listing does not have a valid bookable nightly price."
    );
  }

  return {
    nightlyPrice: breakdown.basePrice,
    nights: breakdown.nights,
    subtotal: breakdown.subtotal,
    taxAmount: breakdown.taxAmount,
    taxRatePercent: breakdown.taxRatePercent,
    taxLabel: breakdown.taxLabel,
    taxMode: breakdown.taxMode,
    taxDescription: breakdown.taxDescription,
    totalPrice: breakdown.estimatedTotal,
    currency: env.booking?.currency || "INR",
    formatted: {
      nightlyPrice: breakdown.formattedBasePrice,
      subtotal: breakdown.formattedSubtotal,
      taxAmount: breakdown.formattedTaxAmount,
      totalPrice: breakdown.formattedEstimatedTotal,
    },
  };
}

async function checkAvailability(
  listingId,
  checkInRaw,
  checkOutRaw,
  options = {}
) {
  validateObjectId(listingId, "Listing ID");
  const resolvedOpts = validateOptions(
    options,
    ALLOWED_AVAILABILITY_OPTIONS,
    "availability options"
  );

  if (resolvedOpts.excludeBookingId !== undefined) {
    validateObjectId(resolvedOpts.excludeBookingId, "Booking ID");
  }

  const taxConfig = resolveTaxConfig(env.pricing);
  const maxStayNights = Number.isInteger(resolvedOpts.maxStayNights)
    ? resolvedOpts.maxStayNights
    : taxConfig.maxStayNights;

  const { checkIn, checkOut, checkInStr, checkOutStr, nights } =
    normalizeStayDates(checkInRaw, checkOutRaw, {
      maxNights: maxStayNights,
      now: resolvedOpts.now,
      allowPastCheckIn: Boolean(resolvedOpts.allowPastCheckIn),
    });

  const listingQuery = resolvedOpts.session
    ? Listing.findById(listingId, "_id owner price maxGuests", {
        session: resolvedOpts.session,
      })
    : Listing.findById(listingId, "_id owner price maxGuests");
  const listing = await listingQuery;
  if (!listing) {
    throw new ExpressError(404, "Listing Not Found ❌");
  }

  const conflictQuery = {
    listing: listing._id,
    status: { $in: [...ACTIVE_BOOKING_STATUSES] },
    checkIn: { $lt: checkOut },
    checkOut: { $gt: checkIn },
  };
  if (resolvedOpts.excludeBookingId) {
    conflictQuery._id = { $ne: resolvedOpts.excludeBookingId };
  }

  const bookingFinder = resolvedOpts.session
    ? Booking.findOne(conflictQuery, "_id checkIn checkOut status", {
        session: resolvedOpts.session,
      })
    : Booking.findOne(conflictQuery, "_id checkIn checkOut status");
  const conflictingBooking = await bookingFinder;

  return {
    available: !conflictingBooking,
    listingId: String(listing._id),
    checkIn,
    checkOut,
    checkInStr,
    checkOutStr,
    nights,
    activeStatuses: [...ACTIVE_BOOKING_STATUSES],
    conflictingBookingId: conflictingBooking ? conflictingBooking._id : null,
  };
}

async function getListingBlockedDates(listingId, options = {}) {
  validateObjectId(listingId, "Listing ID");
  const resolvedOpts = validateOptions(
    options,
    ALLOWED_LISTING_BLOCKED_OPTIONS,
    "blocked dates options"
  );

  const listingExists = await Listing.exists({ _id: listingId });
  if (!listingExists) {
    throw new ExpressError(404, "Listing Not Found ❌");
  }

  const todayUtc = getTodayUtcMidnight(resolvedOpts.fromDate || resolvedOpts.now);
  const bookings = await Booking.find({
    listing: listingId,
    status: { $in: [...ACTIVE_BOOKING_STATUSES] },
    checkOut: { $gt: todayUtc },
  })
    .select("checkIn checkOut -_id")
    .sort({ checkIn: 1 })
    .lean();

  return bookings.map((b) => ({
    checkIn: formatCalendarDate(new Date(b.checkIn)),
    checkOut: formatCalendarDate(new Date(b.checkOut)),
  }));
}

function buildBookingListingSnapshot(listing) {
  return {
    title: typeof listing.title === "string" && listing.title.trim()
      ? listing.title.trim()
      : "Untitled Listing",
    location: typeof listing.location === "string" ? listing.location.trim() : "",
    country: typeof listing.country === "string" ? listing.country.trim() : "",
    imageUrl: typeof listing.image?.url === "string" ? listing.image.url.trim() : "",
  };
}

async function createBooking(listingId, payload, options = {}) {
  validateObjectId(listingId, "Listing ID");
  const resolvedOpts = validateOptions(
    options,
    ALLOWED_CREATE_OPTIONS,
    "booking options"
  );

  const { guestId, taxConfig: customTaxConfig, now, maxRetries } = resolvedOpts;
  if (!guestId) {
    throw new ExpressError(400, "Guest account is required to create a booking.");
  }
  validateObjectId(guestId, "Guest ID");

  const { checkInRaw, checkOutRaw, guests } =
    validateBookingCreatePayload(payload);

  const resolvedTaxConfig = resolveTaxConfig(customTaxConfig || env.pricing);
  const { checkIn, checkOut, nights } = normalizeStayDates(
    checkInRaw,
    checkOutRaw,
    {
      maxNights: resolvedTaxConfig.maxStayNights,
      now,
      allowPastCheckIn: false,
    }
  );

  const effectiveMaxRetries =
    maxRetries !== undefined
      ? maxRetries
      : Math.max(env.booking?.maxTxRetries || 4, 8);

  return runBookingTransactionWithRetry(async (session, attempt) => {
    // On retry after concurrent write contention, check committed bookings in the
    // refreshed snapshot before taking the per-listing write lock again.
    if (attempt > 1) {
      const earlyConflict = await Booking.findOne({
        listing: listingId,
        status: { $in: [...ACTIVE_BOOKING_STATUSES] },
        checkIn: { $lt: checkOut },
        checkOut: { $gt: checkIn },
      }).session(session);

      if (earlyConflict) {
        throw new ExpressError(
          409,
          "Selected dates are no longer available for this listing."
        );
      }
    }

    // Acquire an exclusive per-listing write lock before reading availability
    // to eliminate WiredTiger snapshot phantom write-skew under concurrent requests.
    const listing = await Listing.findOneAndUpdate(
      { _id: listingId },
      { $inc: { bookingVersion: 1 } },
      { session, returnDocument: "after" }
    );

    if (!listing) {
      throw new ExpressError(404, "Listing Not Found ❌");
    }

    if (!listing.owner || !isStrictObjectId(listing.owner)) {
      throw new ExpressError(
        400,
        "This listing does not have a valid host account configured."
      );
    }

    if (String(listing.owner) === String(guestId)) {
      throw new ExpressError(400, "You cannot book your own listing.");
    }

    const listingMaxGuests = resolveListingMaxGuests(listing);
    if (guests > listingMaxGuests) {
      throw new ExpressError(
        400,
        `Guest count cannot exceed the listing capacity of ${listingMaxGuests}.`
      );
    }

    const pricingSnapshot = calculateBookingPrice(listing.price, nights, {
      taxConfig: resolvedTaxConfig,
    });

    const conflictingBooking = await Booking.findOne({
      listing: listing._id,
      status: { $in: [...ACTIVE_BOOKING_STATUSES] },
      checkIn: { $lt: checkOut },
      checkOut: { $gt: checkIn },
    }).session(session);

    if (conflictingBooking) {
      throw new ExpressError(
        409,
        "Selected dates are no longer available for this listing."
      );
    }

    const newBooking = new Booking({
      bookingReference: generateBookingReference(now),
      listing: listing._id,
      guest: guestId,
      host: listing.owner,
      checkIn,
      checkOut,
      guests,
      pricing: {
        nightlyPrice: pricingSnapshot.nightlyPrice,
        nights: pricingSnapshot.nights,
        subtotal: pricingSnapshot.subtotal,
        taxAmount: pricingSnapshot.taxAmount,
        taxRatePercent: pricingSnapshot.taxRatePercent,
        taxLabel: pricingSnapshot.taxLabel,
        taxMode: pricingSnapshot.taxMode,
        taxDescription: pricingSnapshot.taxDescription,
        totalPrice: pricingSnapshot.totalPrice,
        currency: pricingSnapshot.currency,
      },
      listingSnapshot: buildBookingListingSnapshot(listing),
      status: "pending",
      paymentNotice: PAYMENT_UNSUPPORTED_NOTICE,
    });

    await newBooking.save({ session });
    return newBooking;
  }, effectiveMaxRetries);
}

async function hasUpcomingActiveBookings(listingId, options = {}) {
  validateObjectId(listingId, "Listing ID");
  const resolvedOpts = validateOptions(
    options,
    new Set(["now"]),
    "active bookings lookup options"
  );
  const todayUtc = getTodayUtcMidnight(resolvedOpts.now);
  const active = await Booking.exists({
    listing: listingId,
    status: { $in: [...ACTIVE_BOOKING_STATUSES] },
    checkOut: { $gt: todayUtc },
  });
  return Boolean(active);
}

async function findBookingById(bookingId, options = {}) {
  validateObjectId(bookingId, "Booking ID");
  const resolvedOpts = validateOptions(
    options,
    ALLOWED_FIND_OPTIONS,
    "booking lookup options"
  );

  const { actorId, role } = resolvedOpts;
  if (actorId !== undefined) {
    validateObjectId(actorId, "User ID");
  }
  if (role !== undefined && !["guest", "host"].includes(role)) {
    throw new ExpressError(400, "Invalid booking access role.");
  }

  const booking = await Booking.findById(bookingId)
    .populate("listing", "title location country image category price maxGuests owner")
    .populate("guest", "username displayName location")
    .populate("host", "username displayName location");

  if (!booking) {
    return null;
  }

  if (actorId !== undefined) {
    const bookingGuestId = String(booking.guest?._id || booking.guest || "");
    const bookingHostId = String(booking.host?._id || booking.host || "");
    const listingOwnerId = booking.listing?.owner
      ? String(booking.listing.owner._id || booking.listing.owner)
      : "";
    const actorStr = String(actorId);
    const isGuest = bookingGuestId === actorStr;
    const isHost =
      bookingHostId === actorStr &&
      (!booking.listing || listingOwnerId === actorStr);

    if (role === "guest" && !isGuest) {
      throw new ExpressError(403, "You are not authorized to access this booking.");
    }
    if (role === "host" && !isHost) {
      throw new ExpressError(403, "You are not authorized to access this booking.");
    }
    if (!role && !isGuest && !isHost) {
      throw new ExpressError(403, "You are not authorized to access this booking.");
    }
  }

  return booking;
}

function buildBookingStats(bookings) {
  const stats = {
    total: bookings.length,
    pendingCount: 0,
    confirmedCount: 0,
    cancelledCount: 0,
    completedCount: 0,
  };

  for (const booking of bookings) {
    if (booking.status === "pending") stats.pendingCount += 1;
    else if (booking.status === "confirmed") stats.confirmedCount += 1;
    else if (booking.status === "cancelled") stats.cancelledCount += 1;
    else if (booking.status === "completed") stats.completedCount += 1;
  }
  return stats;
}

function normalizeStatusFilter(rawStatus) {
  if (rawStatus === undefined || rawStatus === null || rawStatus === "") {
    return undefined;
  }
  if (typeof rawStatus !== "string") {
    throw new ExpressError(400, "Invalid booking status filter.");
  }
  const normalized = rawStatus.trim().toLowerCase();
  if (!BOOKING_STATUSES.includes(normalized)) {
    throw new ExpressError(400, "Invalid booking status filter.");
  }
  return normalized;
}

function parsePositiveIntOption(rawValue, defaultValue, maxValue, label) {
  if (rawValue === undefined || rawValue === null || rawValue === "") {
    return defaultValue;
  }
  if (typeof rawValue === "number") {
    if (!Number.isSafeInteger(rawValue) || rawValue < 1 || rawValue > maxValue) {
      throw new ExpressError(
        400,
        `${label} must be an integer between 1 and ${maxValue}.`
      );
    }
    return rawValue;
  }
  if (typeof rawValue !== "string") {
    throw new ExpressError(400, `Invalid ${label}.`);
  }
  const trimmed = rawValue.trim();
  if (trimmed === "") {
    return defaultValue;
  }
  if (!/^\d+$/.test(trimmed)) {
    throw new ExpressError(400, `Invalid ${label}.`);
  }
  const parsed = Number(trimmed);
  if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > maxValue) {
    throw new ExpressError(
      400,
      `${label} must be an integer between 1 and ${maxValue}.`
    );
  }
  return parsed;
}

function isGuestCancellable(booking, now = new Date()) {
  if (!booking || !ACTIVE_BOOKING_STATUSES.includes(booking.status)) {
    return false;
  }
  if (booking.status === "confirmed") {
    const todayUtc = getTodayUtcMidnight(now);
    const checkOutDate =
      booking.checkOut instanceof Date
        ? booking.checkOut
        : new Date(booking.checkOut);
    if (
      !Number.isNaN(checkOutDate.getTime()) &&
      todayUtc.getTime() >= checkOutDate.getTime()
    ) {
      return false;
    }
  }
  return true;
}

async function getGuestBookings(guestId, options = {}) {
  validateObjectId(guestId, "Guest ID");
  const resolvedOpts = validateOptions(
    options,
    ALLOWED_LIST_OPTIONS,
    "guest booking list options"
  );

  const baseFilter = { guest: guestId };
  if (resolvedOpts.listingId !== undefined) {
    validateObjectId(resolvedOpts.listingId, "Listing ID");
    baseFilter.listing = resolvedOpts.listingId;
  }

  const filter = { ...baseFilter };
  const statusFilter = normalizeStatusFilter(resolvedOpts.status);
  if (statusFilter) {
    filter.status = statusFilter;
  }

  const hasPagination =
    resolvedOpts.page !== undefined || resolvedOpts.limit !== undefined;

  if (!hasPagination) {
    const [bookings, allStatusDocs] = await Promise.all([
      Booking.find(filter)
        .sort({ createdAt: -1, _id: -1 })
        .populate("listing", "title location country image price maxGuests")
        .populate("host", "username displayName location"),
      statusFilter
        ? Booking.find(baseFilter).select("status -_id").lean()
        : Promise.resolve(null),
    ]);

    const stats = buildBookingStats(allStatusDocs || bookings);
    return {
      bookings,
      stats,
      activeStatus: statusFilter || "",
      pageInfo: {
        page: 1,
        limit: bookings.length || DEFAULT_BOOKINGS_PAGE_SIZE,
        totalCount: bookings.length,
        totalPages: 1,
        hasNextPage: false,
        hasPrevPage: false,
        isOutOfRangePage: false,
      },
    };
  }

  const page = parsePositiveIntOption(
    resolvedOpts.page,
    1,
    10000,
    "Page number"
  );
  const limit = parsePositiveIntOption(
    resolvedOpts.limit,
    DEFAULT_BOOKINGS_PAGE_SIZE,
    MAX_BOOKINGS_PAGE_SIZE,
    "Bookings per page"
  );

  const [totalCount, allStatusDocs] = await Promise.all([
    Booking.countDocuments(filter),
    Booking.find(baseFilter).select("status -_id").lean(),
  ]);

  const totalPages = totalCount === 0 ? 1 : Math.ceil(totalCount / limit);
  const isOutOfRangePage = totalCount > 0 && page > totalPages;
  const skip = (page - 1) * limit;

  const bookings = isOutOfRangePage
    ? []
    : await Booking.find(filter)
        .sort({ createdAt: -1, _id: -1 })
        .skip(skip)
        .limit(limit)
        .populate("listing", "title location country image price maxGuests")
        .populate("host", "username displayName location");

  return {
    bookings,
    stats: buildBookingStats(allStatusDocs),
    activeStatus: statusFilter || "",
    pageInfo: {
      page,
      limit,
      totalCount,
      totalPages,
      hasNextPage: !isOutOfRangePage && page < totalPages,
      hasPrevPage: page > 1 && totalCount > 0,
      isOutOfRangePage,
    },
  };
}

function getAllowedHostActions(booking) {
  if (!booking || !booking.listing) {
    return {
      canConfirm: false,
      canCancel: false,
      canComplete: false,
    };
  }
  if (booking.status === "pending") {
    return {
      canConfirm: true,
      canCancel: true,
      canComplete: false,
    };
  }
  if (booking.status === "confirmed") {
    return {
      canConfirm: false,
      canCancel: true,
      canComplete: true,
    };
  }
  return {
    canConfirm: false,
    canCancel: false,
    canComplete: false,
  };
}

async function getHostBookings(hostId, options = {}) {
  validateObjectId(hostId, "Host ID");
  const resolvedOpts = validateOptions(
    options,
    ALLOWED_LIST_OPTIONS,
    "host booking list options"
  );

  const statusFilter = normalizeStatusFilter(resolvedOpts.status);
  let requestedListingId = "";
  if (resolvedOpts.listingId !== undefined && resolvedOpts.listingId !== "") {
    validateObjectId(resolvedOpts.listingId, "Listing ID");
    requestedListingId = String(resolvedOpts.listingId);
  }

  // Derive host bookings strictly from listings currently owned by this host.
  const ownedListings = await Listing.find({ owner: hostId })
    .select("_id title location country")
    .sort({ _id: -1 })
    .lean();

  const ownedIdStrings = new Set(ownedListings.map((l) => String(l._id)));
  const emptyResult = (page = 1, limit = DEFAULT_BOOKINGS_PAGE_SIZE) => ({
    bookings: [],
    stats: buildBookingStats([]),
    activeStatus: statusFilter || "",
    activeListingId: requestedListingId,
    ownedListings,
    pageInfo: {
      page,
      limit,
      totalCount: 0,
      totalPages: 1,
      hasNextPage: false,
      hasPrevPage: false,
      isOutOfRangePage: false,
    },
  });

  const hasPagination =
    resolvedOpts.page !== undefined || resolvedOpts.limit !== undefined;
  const page = hasPagination
    ? parsePositiveIntOption(resolvedOpts.page, 1, 10000, "Page number")
    : 1;
  const limit = hasPagination
    ? parsePositiveIntOption(
        resolvedOpts.limit,
        DEFAULT_BOOKINGS_PAGE_SIZE,
        MAX_BOOKINGS_PAGE_SIZE,
        "Bookings per page"
      )
    : DEFAULT_BOOKINGS_PAGE_SIZE;

  if (ownedListings.length === 0) {
    return emptyResult(page, limit);
  }

  const baseFilter = {
    host: hostId,
    listing: { $in: ownedListings.map((l) => l._id) },
  };

  if (requestedListingId) {
    if (!ownedIdStrings.has(requestedListingId)) {
      const allStatusDocs = await Booking.find(baseFilter).select("status -_id").lean();
      return {
        bookings: [],
        stats: buildBookingStats(allStatusDocs),
        activeStatus: statusFilter || "",
        activeListingId: requestedListingId,
        ownedListings,
        pageInfo: {
          page,
          limit,
          totalCount: 0,
          totalPages: 1,
          hasNextPage: false,
          hasPrevPage: false,
          isOutOfRangePage: false,
        },
      };
    }
    baseFilter.listing = requestedListingId;
  }

  const filter = { ...baseFilter };
  if (statusFilter) {
    filter.status = statusFilter;
  }

  if (!hasPagination) {
    const [bookings, allStatusDocs] = await Promise.all([
      Booking.find(filter)
        .sort({ createdAt: -1, _id: -1 })
        .populate("listing", "title location country image price maxGuests owner")
        .populate("guest", "username displayName location"),
      statusFilter
        ? Booking.find({ host: hostId, listing: { $in: ownedListings.map((l) => l._id) } })
            .select("status -_id")
            .lean()
        : Promise.resolve(null),
    ]);

    return {
      bookings,
      stats: buildBookingStats(allStatusDocs || bookings),
      activeStatus: statusFilter || "",
      activeListingId: requestedListingId,
      ownedListings,
      pageInfo: {
        page: 1,
        limit: bookings.length || DEFAULT_BOOKINGS_PAGE_SIZE,
        totalCount: bookings.length,
        totalPages: 1,
        hasNextPage: false,
        hasPrevPage: false,
        isOutOfRangePage: false,
      },
    };
  }

  const overallFilter = {
    host: hostId,
    listing: { $in: ownedListings.map((l) => l._id) },
  };
  const [totalCount, allStatusDocs] = await Promise.all([
    Booking.countDocuments(filter),
    Booking.find(overallFilter).select("status -_id").lean(),
  ]);

  const totalPages = totalCount === 0 ? 1 : Math.ceil(totalCount / limit);
  const isOutOfRangePage = totalCount > 0 && page > totalPages;
  const skip = (page - 1) * limit;

  const bookings = isOutOfRangePage
    ? []
    : await Booking.find(filter)
        .sort({ createdAt: -1, _id: -1 })
        .skip(skip)
        .limit(limit)
        .populate("listing", "title location country image price maxGuests owner")
        .populate("guest", "username displayName location");

  return {
    bookings,
    stats: buildBookingStats(allStatusDocs),
    activeStatus: statusFilter || "",
    activeListingId: requestedListingId,
    ownedListings,
    pageInfo: {
      page,
      limit,
      totalCount,
      totalPages,
      hasNextPage: !isOutOfRangePage && page < totalPages,
      hasPrevPage: page > 1 && totalCount > 0,
      isOutOfRangePage,
    },
  };
}

function normalizeCancellationReason(rawReason) {
  if (rawReason === undefined || rawReason === null) {
    return "";
  }
  if (typeof rawReason !== "string") {
    throw new ExpressError(400, "Cancellation reason must be text.");
  }
  const trimmed = rawReason.trim();
  if (trimmed.length > MAX_CANCELLATION_REASON_LENGTH) {
    throw new ExpressError(
      400,
      `Cancellation reason cannot exceed ${MAX_CANCELLATION_REASON_LENGTH} characters.`
    );
  }
  return trimmed;
}

async function cancelBooking(bookingId, actorId, options = {}) {
  validateObjectId(bookingId, "Booking ID");
  validateObjectId(actorId, "User ID");
  const resolvedOpts = validateOptions(
    options,
    ALLOWED_CANCEL_OPTIONS,
    "cancellation options"
  );

  if (
    resolvedOpts.role !== undefined &&
    !["guest", "host"].includes(resolvedOpts.role)
  ) {
    throw new ExpressError(400, "Invalid cancellation actor role.");
  }

  const reason = normalizeCancellationReason(resolvedOpts.reason);
  const actionTimestamp =
    resolvedOpts.now instanceof Date && !Number.isNaN(resolvedOpts.now.getTime())
      ? resolvedOpts.now
      : new Date();
  const todayUtc = getTodayUtcMidnight(actionTimestamp);

  return runBookingTransactionWithRetry(async (session) => {
    const booking = await Booking.findById(bookingId).session(session);
    if (!booking) {
      throw new ExpressError(404, "Booking Not Found");
    }

    const isGuest = String(booking.guest) === String(actorId);
    const isHost = String(booking.host) === String(actorId);

    if (resolvedOpts.role === "guest" && !isGuest) {
      throw new ExpressError(403, "You are not authorized to cancel this booking.");
    }
    if (resolvedOpts.role === "host" && !isHost) {
      throw new ExpressError(403, "You are not authorized to cancel this booking.");
    }
    if (!isGuest && !isHost) {
      throw new ExpressError(403, "You are not authorized to cancel this booking.");
    }

    if (booking.status === "cancelled") {
      throw new ExpressError(400, "This booking is already cancelled.");
    }
    if (booking.status === "completed") {
      throw new ExpressError(400, "Completed bookings cannot be cancelled.");
    }
    if (!ACTIVE_BOOKING_STATUSES.includes(booking.status)) {
      throw new ExpressError(400, "Booking cannot be cancelled in its current state.");
    }
    if (
      booking.status === "confirmed" &&
      booking.checkOut instanceof Date &&
      todayUtc.getTime() >= booking.checkOut.getTime()
    ) {
      throw new ExpressError(
        400,
        "Confirmed stays that have already reached check-out cannot be cancelled."
      );
    }

    booking.status = "cancelled";
    booking.cancelledAt = actionTimestamp;
    booking.cancelledBy =
      resolvedOpts.role === "host" || (isHost && !isGuest) ? "host" : "guest";
    booking.cancellationReason = reason;

    await booking.save({ session });
    return booking;
  }, resolvedOpts.maxRetries);
}

async function updateBookingStatus(
  bookingId,
  targetStatus,
  actorId,
  options = {}
) {
  validateObjectId(bookingId, "Booking ID");
  validateObjectId(actorId, "Host ID");
  const resolvedOpts = validateOptions(
    options,
    ALLOWED_STATUS_UPDATE_OPTIONS,
    "status update options"
  );

  if (typeof targetStatus !== "string" || !targetStatus.trim()) {
    throw new ExpressError(400, "Target booking status is required.");
  }
  const normalizedTarget = targetStatus.trim().toLowerCase();
  if (!ALLOWED_HOST_TARGET_STATUSES.has(normalizedTarget)) {
    throw new ExpressError(
      400,
      `Invalid target booking status "${normalizedTarget}".`
    );
  }

  const reason = normalizeCancellationReason(resolvedOpts.reason);
  const actionTimestamp =
    resolvedOpts.now instanceof Date && !Number.isNaN(resolvedOpts.now.getTime())
      ? resolvedOpts.now
      : new Date();

  return runBookingTransactionWithRetry(async (session) => {
    const booking = await Booking.findById(bookingId).session(session);
    if (!booking) {
      throw new ExpressError(404, "Booking Not Found");
    }

    if (String(booking.host) !== String(actorId)) {
      throw new ExpressError(
        403,
        "Only the listing host can update this reservation status."
      );
    }

    const listing = await Listing.findById(booking.listing, "_id owner").session(
      session
    );
    if (!listing || !listing.owner || String(listing.owner) !== String(actorId)) {
      throw new ExpressError(
        403,
        "Only the current listing owner can manage this reservation."
      );
    }

    if (TERMINAL_BOOKING_STATUSES.includes(booking.status)) {
      throw new ExpressError(
        400,
        `Bookings with status "${booking.status}" cannot be modified.`
      );
    }

    if (booking.status === normalizedTarget) {
      throw new ExpressError(
        400,
        `Booking is already "${normalizedTarget}".`
      );
    }

    if (normalizedTarget === "confirmed") {
      if (booking.status !== "pending") {
        throw new ExpressError(
          400,
          "Only pending bookings can be confirmed."
        );
      }
      booking.status = "confirmed";
      booking.confirmedAt = actionTimestamp;
    } else if (normalizedTarget === "cancelled") {
      if (!ACTIVE_BOOKING_STATUSES.includes(booking.status)) {
        throw new ExpressError(
          400,
          "Only pending or confirmed bookings can be cancelled."
        );
      }
      booking.status = "cancelled";
      booking.cancelledAt = actionTimestamp;
      booking.cancelledBy = "host";
      booking.cancellationReason = reason;
    } else if (normalizedTarget === "completed") {
      if (booking.status !== "confirmed") {
        throw new ExpressError(
          400,
          "Only confirmed bookings can be marked as completed."
        );
      }
      booking.status = "completed";
      booking.completedAt = actionTimestamp;
    }

    await booking.save({ session });
    return booking;
  }, resolvedOpts.maxRetries);
}

function readOptionalReviewScalar(rawQuery, key, label) {
  if (!rawQuery || !Object.prototype.hasOwnProperty.call(rawQuery, key)) {
    return "";
  }
  const value = rawQuery[key];
  if (value === undefined || value === null) {
    return "";
  }
  if (typeof value !== "string" && typeof value !== "number") {
    throw new ExpressError(400, `Invalid ${label}`);
  }
  return String(value).trim();
}

async function getBookingReviewDetails(listingId, rawQuery = {}, options = {}) {
  validateObjectId(listingId, "Listing ID");
  if (rawQuery !== undefined && rawQuery !== null && !isPlainObject(rawQuery)) {
    throw new ExpressError(400, "Invalid booking review query parameters.");
  }
  const resolvedOpts = validateOptions(
    options,
    ALLOWED_REVIEW_OPTIONS,
    "booking review options"
  );
  if (resolvedOpts.actorId !== undefined) {
    validateObjectId(resolvedOpts.actorId, "User ID");
  }

  const safeQuery = rawQuery || {};
  const checkInInput = readOptionalReviewScalar(
    safeQuery,
    "checkIn",
    "check-in date"
  );
  const checkOutInput = readOptionalReviewScalar(
    safeQuery,
    "checkOut",
    "check-out date"
  );
  const guestsInput = readOptionalReviewScalar(
    safeQuery,
    "guests",
    "guest count"
  );

  const listing = await Listing.findById(listingId).populate(
    "owner",
    "username displayName location"
  );
  if (!listing) {
    throw new ExpressError(404, "Listing Not Found ❌");
  }

  const taxConfig = resolveTaxConfig(resolvedOpts.taxConfig || env.pricing);
  const maxGuests = resolveListingMaxGuests(listing);
  const todayStr = formatCalendarDate(getTodayUtcMidnight(resolvedOpts.now));
  const blockedDates = await getListingBlockedDates(listing._id, {
    now: resolvedOpts.now,
  });
  const isOwnListing = Boolean(
    resolvedOpts.actorId &&
      listing.owner &&
      String(listing.owner._id || listing.owner) === String(resolvedOpts.actorId)
  );
  const isPriceAvailable = isValidNonNegativePrice(listing.price);
  const categoryMeta = resolveCategoryMeta(listing.category);

  let availability = null;
  let reviewError = "";
  let pricing = calculatePriceBreakdown({
    nightlyPrice: listing.price,
    nights: 1,
    taxConfig,
  });

  const hasDateInput = Boolean(checkInInput || checkOutInput);
  if (hasDateInput) {
    try {
      const requestedGuests = guestsInput ? parseGuestCount(guestsInput) : 1;
      if (requestedGuests > maxGuests) {
        throw new ExpressError(
          400,
          `Guest count cannot exceed the listing capacity of ${maxGuests}.`
        );
      }
      if (!checkInInput || !checkOutInput) {
        throw new ExpressError(
          400,
          "Both check-in and check-out dates are required."
        );
      }

      availability = await checkAvailability(
        listing._id,
        checkInInput,
        checkOutInput,
        {
          now: resolvedOpts.now,
          maxStayNights: taxConfig.maxStayNights,
        }
      );

      pricing = calculatePriceBreakdown({
        nightlyPrice: listing.price,
        nights: availability.nights,
        taxConfig,
      });

      if (!availability.available) {
        reviewError =
          "Selected dates overlap an existing active reservation. Please select another date range.";
      }
    } catch (err) {
      reviewError = err?.message || "Please enter valid booking dates and guest count.";
    }
  }

  return {
    listing,
    categoryMeta,
    maxGuests,
    maxStayNights: taxConfig.maxStayNights,
    todayStr,
    blockedDates,
    formValues: {
      checkIn: checkInInput,
      checkOut: checkOutInput,
      guests: guestsInput || "1",
    },
    availability,
    pricing,
    taxConfig,
    reviewError,
    isOwnListing,
    isPriceAvailable,
    paymentNotice: PAYMENT_UNSUPPORTED_NOTICE,
  };
}

module.exports = {
  BOOKING_STATUSES,
  ACTIVE_BOOKING_STATUSES,
  TERMINAL_BOOKING_STATUSES,
  PAYMENT_UNSUPPORTED_NOTICE,
  validateObjectId,
  parseGuestCount,
  resolveListingMaxGuests,
  generateBookingReference,
  calculateBookingPrice,
  checkAvailability,
  getListingBlockedDates,
  hasUpcomingActiveBookings,
  getBookingReviewDetails,
  createBooking,
  findBookingById,
  getGuestBookings,
  getHostBookings,
  getAllowedHostActions,
  isGuestCancellable,
  cancelBooking,
  updateBookingStatus,
};
