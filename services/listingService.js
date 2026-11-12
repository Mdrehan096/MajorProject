const mongoose = require("mongoose");
const Listing = require("../models/listing");
const ExpressError = require("../utils/ExpressError.js");
const { env } = require("../config/env.js");
const { mapToken, geocodeLocation } = require("../config/mapbox.js");
const { safeDestroyCloudinaryImage } = require("../utils/cloudinaryCleanup.js");
const {
  normalizeStayNights,
  calculatePriceBreakdown,
  resolveTaxConfig,
  isValidNonNegativePrice,
} = require("../utils/pricing.js");
const {
  getTodayUtcMidnight,
  formatCalendarDate,
} = require("../utils/bookingDates.js");
const bookingService = require("./bookingService.js");
const {
  DEFAULT_PAGE,
  DEFAULT_LIMIT,
  MAX_LIMIT,
  MAX_PAGE,
  MAX_SEARCH_LENGTH,
  LISTING_CATEGORIES,
  LISTING_CATEGORY_MAP,
  SORT_OPTIONS,
  SORT_OPTION_MAP,
  computeReviewStats,
  resolveCategoryMeta,
} = require("../utils/listingOptions.js");

const ALLOWED_LISTING_FIELDS = new Set([
  "title",
  "description",
  "image",
  "price",
  "country",
  "location",
  "category",
]);
const REQUIRED_LISTING_STRING_FIELDS = [
  "title",
  "description",
  "country",
  "location",
];
const ALLOWED_CREATE_OPTIONS = new Set(["ownerId", "file"]);
const ALLOWED_UPDATE_OPTIONS = new Set(["file"]);

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

function validateListingId(id) {
  if (!isStrictObjectId(id)) {
    throw new ExpressError(400, "Invalid ID ❌");
  }
}

function validateOptionsObject(options, allowedKeys) {
  if (options === undefined) {
    return {};
  }
  if (!isPlainObject(options)) {
    throw new ExpressError(400, "Invalid listing options");
  }
  const unexpectedOptionKeys = Object.keys(options).filter(
    (key) => !allowedKeys.has(key)
  );
  if (unexpectedOptionKeys.length > 0) {
    throw new ExpressError(
      400,
      `Unexpected option field(s): ${unexpectedOptionKeys.join(", ")}`
    );
  }
  return options;
}

function validateListingPayload(listingData) {
  if (!isPlainObject(listingData)) {
    throw new ExpressError(400, '"listing" is required');
  }

  const unexpectedKeys = Object.keys(listingData).filter(
    (key) => !ALLOWED_LISTING_FIELDS.has(key)
  );
  if (unexpectedKeys.length > 0) {
    throw new ExpressError(
      400,
      `Unexpected field(s) in listing payload: ${unexpectedKeys.join(", ")}`
    );
  }

  if (listingData.image !== undefined && typeof listingData.image !== "string") {
    throw new ExpressError(400, '"image" must be a string');
  }

  const normalized = {};
  for (const field of REQUIRED_LISTING_STRING_FIELDS) {
    const val = listingData[field];
    if (typeof val !== "string" || !val.trim()) {
      throw new ExpressError(
        400,
        `"${field}" is required and must be a non-empty string`
      );
    }
    normalized[field] = val.trim();
  }

  const rawPrice = listingData.price;
  let parsedPrice;
  if (typeof rawPrice === "number") {
    parsedPrice = rawPrice;
  } else if (typeof rawPrice === "string" && rawPrice.trim() !== "") {
    parsedPrice = Number(rawPrice);
  } else {
    throw new ExpressError(
      400,
      '"price" is required and must be a non-negative number'
    );
  }

  if (!Number.isFinite(parsedPrice) || parsedPrice < 0) {
    throw new ExpressError(
      400,
      '"price" must be a non-negative finite number'
    );
  }
  normalized.price = parsedPrice;

  const hasCategoryField =
    Object.prototype.hasOwnProperty.call(listingData, "category") &&
    listingData.category !== undefined;
  normalized.hasCategoryField = hasCategoryField;
  if (hasCategoryField) {
    if (typeof listingData.category !== "string") {
      throw new ExpressError(400, '"category" must be a string');
    }
    const trimmedCategory = listingData.category.trim().toLowerCase();
    if (trimmedCategory !== "") {
      if (!LISTING_CATEGORY_MAP.has(trimmedCategory)) {
        throw new ExpressError(400, "Invalid listing category");
      }
      normalized.category = trimmedCategory;
    }
  }

  return normalized;
}

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function readScalarQueryValue(query, key) {
  if (!Object.prototype.hasOwnProperty.call(query, key)) {
    return undefined;
  }
  return query[key];
}

function parseOptionalNonNegativePrice(rawValue, label) {
  if (rawValue === undefined) {
    return undefined;
  }
  if (typeof rawValue === "number") {
    if (!Number.isFinite(rawValue) || rawValue < 0) {
      throw new ExpressError(400, `Invalid ${label}`);
    }
    return rawValue;
  }
  if (typeof rawValue !== "string") {
    throw new ExpressError(400, `Invalid ${label}`);
  }
  const trimmed = rawValue.trim();
  if (trimmed === "") {
    return undefined;
  }
  if (!/^(?:\d+|\d*\.\d+)$/.test(trimmed)) {
    throw new ExpressError(400, `Invalid ${label}`);
  }
  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new ExpressError(400, `Invalid ${label}`);
  }
  return parsed;
}

function parsePositiveIntegerQueryParam(rawValue, defaultValue, maxValue, label) {
  if (rawValue === undefined) {
    return defaultValue;
  }
  if (typeof rawValue === "number") {
    if (!Number.isSafeInteger(rawValue) || rawValue < 1 || rawValue > maxValue) {
      throw new ExpressError(
        400,
        `${label} must be an integer between 1 and ${maxValue}`
      );
    }
    return rawValue;
  }
  if (typeof rawValue !== "string") {
    throw new ExpressError(400, `Invalid ${label}`);
  }
  const trimmed = rawValue.trim();
  if (trimmed === "") {
    return defaultValue;
  }
  if (!/^\d+$/.test(trimmed)) {
    throw new ExpressError(400, `Invalid ${label}`);
  }
  const parsed = Number(trimmed);
  if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > maxValue) {
    throw new ExpressError(
      400,
      `${label} must be an integer between 1 and ${maxValue}`
    );
  }
  return parsed;
}

function normalizeDiscoveryQuery(rawQuery = {}) {
  if (rawQuery !== undefined && !isPlainObject(rawQuery)) {
    throw new ExpressError(400, "Invalid listing query parameters");
  }
  const query = rawQuery || {};

  const rawQ = readScalarQueryValue(query, "q");
  let q = "";
  if (rawQ !== undefined) {
    if (typeof rawQ !== "string") {
      throw new ExpressError(400, "Invalid search query");
    }
    q = rawQ.trim();
    if (q.length > MAX_SEARCH_LENGTH) {
      throw new ExpressError(
        400,
        `Search query cannot exceed ${MAX_SEARCH_LENGTH} characters`
      );
    }
  }

  const rawCategory = readScalarQueryValue(query, "category");
  let category = "";
  if (rawCategory !== undefined) {
    if (typeof rawCategory !== "string") {
      throw new ExpressError(400, "Invalid listing category filter");
    }
    const normalizedCat = rawCategory.trim().toLowerCase();
    if (normalizedCat && normalizedCat !== "all") {
      if (!LISTING_CATEGORY_MAP.has(normalizedCat)) {
        throw new ExpressError(400, "Invalid listing category filter");
      }
      category = normalizedCat;
    }
  }

  const minPrice = parseOptionalNonNegativePrice(
    readScalarQueryValue(query, "minPrice"),
    "minimum price"
  );
  const maxPrice = parseOptionalNonNegativePrice(
    readScalarQueryValue(query, "maxPrice"),
    "maximum price"
  );
  if (minPrice !== undefined && maxPrice !== undefined && minPrice > maxPrice) {
    throw new ExpressError(
      400,
      "Minimum price cannot be greater than maximum price"
    );
  }

  const rawSort = readScalarQueryValue(query, "sort");
  let sort = "newest";
  if (rawSort !== undefined) {
    if (typeof rawSort !== "string") {
      throw new ExpressError(400, "Invalid sort option");
    }
    const normalizedSort = rawSort.trim().toLowerCase();
    if (normalizedSort !== "") {
      if (!SORT_OPTION_MAP.has(normalizedSort)) {
        throw new ExpressError(400, "Invalid sort option");
      }
      sort = normalizedSort;
    }
  }

  const page = parsePositiveIntegerQueryParam(
    readScalarQueryValue(query, "page"),
    DEFAULT_PAGE,
    MAX_PAGE,
    "Page"
  );
  const limit = parsePositiveIntegerQueryParam(
    readScalarQueryValue(query, "limit"),
    DEFAULT_LIMIT,
    MAX_LIMIT,
    "Page size"
  );

  return {
    q,
    category,
    minPrice,
    maxPrice,
    sort,
    page,
    limit,
  };
}

function buildListingFilter(filters) {
  const filter = {};

  if (filters.q) {
    const regex = new RegExp(escapeRegex(filters.q), "i");
    filter.$or = [
      { title: regex },
      { location: regex },
      { country: regex },
    ];
  }

  if (filters.category) {
    filter.category = filters.category;
  }

  if (filters.minPrice !== undefined || filters.maxPrice !== undefined) {
    filter.price = {};
    if (filters.minPrice !== undefined) {
      filter.price.$gte = filters.minPrice;
    }
    if (filters.maxPrice !== undefined) {
      filter.price.$lte = filters.maxPrice;
    }
  }

  return filter;
}

function extractImageData(file) {
  if (!file || typeof file !== "object" || Array.isArray(file)) {
    return null;
  }

  const url =
    typeof file.path === "string"
      ? file.path
      : typeof file.url === "string"
        ? file.url
        : "";
  const filename = typeof file.filename === "string" ? file.filename : "";

  return { url, filename };
}

async function cleanupUncommittedImage(image) {
  if (!image?.filename) {
    return { skipped: true, reason: "nothing_to_cleanup" };
  }

  return safeDestroyCloudinaryImage({
    filename: image.filename,
    url: image.url,
  });
}

function buildMapListing(listing) {
  if (!listing) {
    return null;
  }

  return {
    title: listing.title,
    geometry: listing.geometry
      ? {
          type: listing.geometry.type,
          coordinates: Array.isArray(listing.geometry.coordinates)
            ? listing.geometry.coordinates
            : [],
        }
      : null,
  };
}

function buildOriginalImageUrl(image) {
  const url = image?.url || "";
  if (!url) {
    return "";
  }
  return url.replace("/upload", "/upload/w_250");
}

async function getAllListings() {
  return Listing.find(
    {},
    "title location country price category image",
    { lean: true }
  );
}

async function searchListings(rawQuery = {}) {
  const filters = normalizeDiscoveryQuery(rawQuery);
  const filter = buildListingFilter(filters);
  const sortMeta = SORT_OPTION_MAP.get(filters.sort);

  const totalCount = await Listing.countDocuments(filter);
  const totalPages = totalCount > 0 ? Math.ceil(totalCount / filters.limit) : 1;
  const skip = (filters.page - 1) * filters.limit;

  let listings = [];
  if (totalCount > 0 && filters.page <= totalPages) {
    listings = await Listing.find(
      filter,
      "title location country price category image",
      { lean: true }
    )
      .sort(sortMeta.sortSpec)
      .skip(skip)
      .limit(filters.limit);
  }

  const pricingConfig = resolveTaxConfig(env.pricing);
  const pricingByListingId = Object.create(null);
  for (const listing of listings) {
    if (listing && listing._id !== undefined && listing._id !== null) {
      pricingByListingId[String(listing._id)] = calculatePriceBreakdown({
        nightlyPrice: listing.price,
        nights: 1,
        taxConfig: pricingConfig,
      });
    }
  }

  return {
    listings,
    filters,
    pagination: {
      page: filters.page,
      limit: filters.limit,
      totalCount,
      totalPages,
      hasPrev: filters.page > 1,
      hasNext: filters.page < totalPages,
      startItem: listings.length > 0 ? skip + 1 : 0,
      endItem: listings.length > 0 ? skip + listings.length : 0,
      isOutOfRangePage: totalCount > 0 && filters.page > totalPages,
    },
    categories: LISTING_CATEGORIES,
    sortOptions: SORT_OPTIONS,
    pricingConfig,
    pricingByListingId,
  };
}

async function getListingById(id) {
  validateListingId(id);

  return Listing.findById(id)
    .populate({
      path: "reviews",
      populate: {
        path: "author",
        select: "username",
      },
    })
    .populate("owner", "username");
}

function readOptionalDateOrGuestInput(rawQuery, key, label) {
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

function isDatabaseConnected() {
  return mongoose.connection && mongoose.connection.readyState === 1;
}

async function getListingDetails(id, rawQuery = {}, options = {}) {
  validateListingId(id);

  if (rawQuery !== undefined && rawQuery !== null && !isPlainObject(rawQuery)) {
    throw new ExpressError(400, "Invalid listing query parameters");
  }
  const safeQuery = rawQuery || {};

  const taxConfig = resolveTaxConfig(options?.taxConfig || env.pricing);
  let nights = normalizeStayNights(safeQuery, taxConfig.maxStayNights);

  const checkInRaw = readOptionalDateOrGuestInput(
    safeQuery,
    "checkIn",
    "check-in date"
  );
  const checkOutRaw = readOptionalDateOrGuestInput(
    safeQuery,
    "checkOut",
    "check-out date"
  );
  const guestsRaw = readOptionalDateOrGuestInput(
    safeQuery,
    "guests",
    "guest count"
  );

  const listing = await getListingById(id);
  if (!listing) {
    return null;
  }

  const maxGuests = bookingService.resolveListingMaxGuests(listing);
  const todayStr = formatCalendarDate(getTodayUtcMidnight(options?.now));
  const shouldLoadAvailability =
    isDatabaseConnected() || options?.includeAvailability === true;

  let availabilityCheck = {
    checked: false,
    valid: null,
    available: null,
    checkIn: checkInRaw,
    checkOut: checkOutRaw,
    nights,
    guests: 1,
    maxGuests,
    error: "",
    message: "",
  };

  const blockedPromise = shouldLoadAvailability
    ? bookingService.queryBlockedDatesForListing(listing._id, {
        now: options?.now,
      })
    : Promise.resolve([]);

  const hasAnyDateInput = Boolean(checkInRaw || checkOutRaw);
  let requestedGuestsForDates = 1;
  let dateCheckPromise = Promise.resolve(null);

  if (hasAnyDateInput) {
    dateCheckPromise = (async () => {
      requestedGuestsForDates = guestsRaw
        ? bookingService.parseGuestCount(guestsRaw)
        : 1;
      if (requestedGuestsForDates > maxGuests) {
        throw new ExpressError(
          400,
          `Guest count cannot exceed the listing capacity of ${maxGuests}.`
        );
      }
      if (!checkInRaw || !checkOutRaw) {
        throw new ExpressError(
          400,
          "Both check-in and check-out dates are required."
        );
      }

      return bookingService.queryDateAvailabilityForListing(
        listing._id,
        checkInRaw,
        checkOutRaw,
        {
          now: options?.now,
          maxStayNights: taxConfig.maxStayNights,
        }
      );
    })();
  }

  const [blockedDates, dateCheckSettled] = await Promise.all([
    blockedPromise,
    dateCheckPromise.then(
      (value) => ({ ok: true, value }),
      (err) => ({ ok: false, err })
    ),
  ]);

  if (hasAnyDateInput) {
    if (dateCheckSettled.ok) {
      const availability = dateCheckSettled.value;
      nights = availability.nights;
      availabilityCheck = {
        checked: true,
        valid: true,
        available: availability.available,
        checkIn: availability.checkInStr,
        checkOut: availability.checkOutStr,
        nights: availability.nights,
        guests: requestedGuestsForDates,
        maxGuests,
        error: "",
        message: availability.available
          ? `Dates are available for ${availability.nights} ${availability.nights === 1 ? "night" : "nights"} (${requestedGuestsForDates} ${requestedGuestsForDates === 1 ? "guest" : "guests"}). Availability is re-verified atomically when creating a reservation.`
          : "Selected dates overlap an existing active reservation. Please select another date range.",
      };
    } else {
      let safeGuests = 1;
      try {
        if (guestsRaw) {
          safeGuests = Math.min(
            bookingService.parseGuestCount(guestsRaw),
            maxGuests
          );
        }
      } catch {
        safeGuests = 1;
      }

      availabilityCheck = {
        checked: true,
        valid: false,
        available: false,
        checkIn: checkInRaw,
        checkOut: checkOutRaw,
        nights,
        guests: safeGuests,
        maxGuests,
        error:
          dateCheckSettled.err?.message || "Invalid availability search dates.",
        message: "",
      };
    }
  } else if (guestsRaw) {
    try {
      const requestedGuests = bookingService.parseGuestCount(guestsRaw);
      availabilityCheck.guests = Math.min(requestedGuests, maxGuests);
    } catch {
      availabilityCheck.guests = 1;
    }
  }

  const categoryMeta = resolveCategoryMeta(listing.category);
  const reviewStats = computeReviewStats(listing.reviews);
  const pricing = calculatePriceBreakdown({
    nightlyPrice: listing.price,
    nights,
    taxConfig,
  });

  return {
    listing,
    mapListing: buildMapListing(listing),
    mapToken: mapToken || "",
    categoryMeta,
    reviewStats,
    pricing,
    taxConfig,
    maxGuests,
    todayStr,
    blockedDates,
    availabilityCheck,
    activeBookingStatuses: [...bookingService.ACTIVE_BOOKING_STATUSES],
  };
}

async function getListingAvailability(id, rawQuery = {}, options = {}) {
  validateListingId(id);

  if (rawQuery !== undefined && rawQuery !== null && !isPlainObject(rawQuery)) {
    throw new ExpressError(400, "Invalid availability query parameters");
  }
  const safeQuery = rawQuery || {};

  const checkInRaw = readOptionalDateOrGuestInput(
    safeQuery,
    "checkIn",
    "check-in date"
  );
  const checkOutRaw = readOptionalDateOrGuestInput(
    safeQuery,
    "checkOut",
    "check-out date"
  );
  const guestsRaw = readOptionalDateOrGuestInput(
    safeQuery,
    "guests",
    "guest count"
  );

  const listing = await Listing.findById(id, "_id price maxGuests", {
    lean: true,
  });
  if (!listing) {
    throw new ExpressError(404, "Listing Not Found ❌");
  }

  const taxConfig = resolveTaxConfig(options?.taxConfig || env.pricing);
  const maxGuests = bookingService.resolveListingMaxGuests(listing);
  const todayStr = formatCalendarDate(getTodayUtcMidnight(options?.now));

  const guests = guestsRaw ? bookingService.parseGuestCount(guestsRaw) : 1;
  if (guests > maxGuests) {
    throw new ExpressError(
      400,
      `Guest count cannot exceed the listing capacity of ${maxGuests}.`
    );
  }

  if (!checkInRaw && !checkOutRaw) {
    const blockedDates = await bookingService.queryBlockedDatesForListing(
      listing._id,
      { now: options?.now }
    );
    return {
      listingId: String(listing._id),
      checked: false,
      available: null,
      maxGuests,
      maxStayNights: taxConfig.maxStayNights,
      todayStr,
      guests,
      isPriceAvailable: isValidNonNegativePrice(listing.price),
      blockedDates,
      activeStatuses: [...bookingService.ACTIVE_BOOKING_STATUSES],
    };
  }

  if (!checkInRaw || !checkOutRaw) {
    throw new ExpressError(
      400,
      "Both check-in and check-out dates are required."
    );
  }

  const [blockedDates, availability] = await Promise.all([
    bookingService.queryBlockedDatesForListing(listing._id, {
      now: options?.now,
    }),
    bookingService.queryDateAvailabilityForListing(
      listing._id,
      checkInRaw,
      checkOutRaw,
      {
        now: options?.now,
        maxStayNights: taxConfig.maxStayNights,
      }
    ),
  ]);

  const pricing = calculatePriceBreakdown({
    nightlyPrice: listing.price,
    nights: availability.nights,
    taxConfig,
  });

  return {
    listingId: availability.listingId,
    checked: true,
    available: availability.available,
    checkIn: availability.checkInStr,
    checkOut: availability.checkOutStr,
    nights: availability.nights,
    guests,
    maxGuests,
    maxStayNights: taxConfig.maxStayNights,
    todayStr,
    isPriceAvailable: pricing.isPriceAvailable,
    pricing,
    blockedDates,
    activeStatuses: availability.activeStatuses,
    message: availability.available
      ? `Available for ${availability.nights} ${availability.nights === 1 ? "night" : "nights"} (${guests} ${guests === 1 ? "guest" : "guests"}). Availability is re-verified inside a database transaction on booking.`
      : "Selected dates overlap an existing active reservation. Please choose different dates.",
  };
}

async function getListingForEdit(id) {
  validateListingId(id);

  const listing = await Listing.findById(id);
  if (!listing) {
    return null;
  }

  return {
    listing,
    originalImageUrl: buildOriginalImageUrl(listing.image),
    categories: LISTING_CATEGORIES,
  };
}

async function createListing(listingData, options = {}) {
  const uploadedImage = extractImageData(options?.file);

  try {
    const resolvedOptions = validateOptionsObject(
      options,
      ALLOWED_CREATE_OPTIONS
    );
    const { ownerId, file } = resolvedOptions;

    if (!file || !uploadedImage || !uploadedImage.url || !uploadedImage.filename) {
      throw new ExpressError(400, "Listing image is required");
    }

    const { title, description, price, country, location, category } =
      validateListingPayload(listingData);

    if (!ownerId) {
      throw new ExpressError(400, "Listing owner is required");
    }
    if (!isStrictObjectId(ownerId)) {
      throw new ExpressError(400, "Invalid Listing Owner ID");
    }

    const geometry = await geocodeLocation(location);

    const listingDoc = {
      title,
      description,
      price,
      country,
      location,
      owner: ownerId,
      image: uploadedImage,
      geometry,
    };
    if (category !== undefined) {
      listingDoc.category = category;
    }

    const newListing = new Listing(listingDoc);

    await newListing.save();
    return newListing;
  } catch (err) {
    await cleanupUncommittedImage(uploadedImage);
    throw err;
  }
}

async function updateListing(id, listingData, options = {}) {
  const uploadedImage = extractImageData(options?.file);
  let isSaved = false;

  try {
    validateListingId(id);
    const resolvedOptions = validateOptionsObject(
      options,
      ALLOWED_UPDATE_OPTIONS
    );
    const { file } = resolvedOptions;

    if (
      file !== undefined &&
      file !== null &&
      (!uploadedImage || !uploadedImage.url || !uploadedImage.filename)
    ) {
      throw new ExpressError(400, "Invalid listing image");
    }

    const {
      title,
      description,
      price,
      country,
      location,
      category,
      hasCategoryField,
    } = validateListingPayload(listingData);

    const listing = await Listing.findById(id);
    if (!listing) {
      await cleanupUncommittedImage(uploadedImage);
      return null;
    }

    const previousImage = listing.image
      ? { url: listing.image.url, filename: listing.image.filename }
      : null;

    listing.title = title;
    listing.description = description;
    listing.price = price;
    listing.country = country;
    listing.location = location;
    if (hasCategoryField) {
      listing.category = category;
    }

    const hasNewFile = Boolean(uploadedImage?.url && uploadedImage?.filename);
    if (hasNewFile) {
      listing.image = uploadedImage;
    }

    await listing.save();
    isSaved = true;

    if (
      hasNewFile &&
      previousImage?.filename &&
      previousImage.filename !== listing.image.filename
    ) {
      await safeDestroyCloudinaryImage(previousImage, {
        excludeListingId: listing._id,
      });
    }

    return listing;
  } catch (err) {
    if (!isSaved) {
      await cleanupUncommittedImage(uploadedImage);
    }
    throw err;
  }
}

async function deleteListing(id, options = {}) {
  validateListingId(id);

  if (isDatabaseConnected() || options?.checkBookings === true) {
    const hasActiveBookings = await bookingService.hasUpcomingActiveBookings(
      id,
      { now: options?.now }
    );
    if (hasActiveBookings) {
      throw new ExpressError(
        409,
        "Cannot delete this listing while active pending or confirmed reservations exist."
      );
    }
  }

  const deletedListing = await Listing.findByIdAndDelete(id);
  if (!deletedListing) {
    throw new ExpressError(404, "Listing Not Found ❌");
  }

  await safeDestroyCloudinaryImage(deletedListing.image, {
    excludeListingId: deletedListing._id,
  });

  return deletedListing;
}

module.exports = {
  DEFAULT_PAGE,
  DEFAULT_LIMIT,
  MAX_LIMIT,
  MAX_SEARCH_LENGTH,
  LISTING_CATEGORIES,
  SORT_OPTIONS,
  normalizeDiscoveryQuery,
  buildListingFilter,
  validateListingId,
  buildMapListing,
  buildOriginalImageUrl,
  computeReviewStats,
  resolveCategoryMeta,
  getAllListings,
  searchListings,
  getListingById,
  getListingDetails,
  getListingAvailability,
  getListingForEdit,
  createListing,
  updateListing,
  deleteListing,
};

