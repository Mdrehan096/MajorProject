const mongoose = require("mongoose");
const Listing = require("../models/listing");
const ExpressError = require("../utils/ExpressError.js");
const { mapToken, geocodeLocation } = require("../config/mapbox.js");
const { safeDestroyCloudinaryImage } = require("../utils/cloudinaryCleanup.js");

const ALLOWED_LISTING_FIELDS = new Set([
  "title",
  "description",
  "image",
  "price",
  "country",
  "location",
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

  return normalized;
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
  return Listing.find({});
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

async function getListingDetails(id) {
  const listing = await getListingById(id);
  if (!listing) {
    return null;
  }

  return {
    listing,
    mapListing: buildMapListing(listing),
    mapToken: mapToken || "",
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

    const { title, description, price, country, location } =
      validateListingPayload(listingData);

    if (!ownerId) {
      throw new ExpressError(400, "Listing owner is required");
    }
    if (!isStrictObjectId(ownerId)) {
      throw new ExpressError(400, "Invalid Listing Owner ID");
    }

    const geometry = await geocodeLocation(location);

    const newListing = new Listing({
      title,
      description,
      price,
      country,
      location,
      owner: ownerId,
      image: uploadedImage,
      geometry,
    });

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

    const { title, description, price, country, location } =
      validateListingPayload(listingData);

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

async function deleteListing(id) {
  validateListingId(id);

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
  validateListingId,
  buildMapListing,
  buildOriginalImageUrl,
  getAllListings,
  getListingById,
  getListingDetails,
  getListingForEdit,
  createListing,
  updateListing,
  deleteListing,
};

