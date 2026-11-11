const { cloudinary } = require("../config/cloudinary.js");
const Listing = require("../models/listing.js");

function isCloudinaryManagedImage(image) {
  if (!image || typeof image.filename !== "string" || !image.filename.trim()) {
    return false;
  }

  // Seed data uses placeholder filename "listingimage" paired with Unsplash URLs.
  if (image.filename === "listingimage") {
    return false;
  }

  if (
    typeof image.url === "string" &&
    image.url.trim() !== "" &&
    !/^https?:\/\/res\.cloudinary\.com\//i.test(image.url)
  ) {
    return false;
  }

  return true;
}

async function safeDestroyCloudinaryImage(image, { excludeListingId } = {}) {
  if (!isCloudinaryManagedImage(image)) {
    return { skipped: true, reason: "not_cloudinary_asset" };
  }

  const filename = image.filename;
  const query = { "image.filename": filename };
  if (excludeListingId) {
    query._id = { $ne: excludeListingId };
  }

  try {
    const stillReferenced = await Listing.exists(query);
    if (stillReferenced) {
      return { skipped: true, reason: "referenced_by_another_listing" };
    }

    const result = await cloudinary.uploader.destroy(filename, {
      invalidate: true,
    });
    return { skipped: false, result };
  } catch (err) {
    console.error("Cloudinary cleanup failed:", err?.message || "Unknown error");
    return { skipped: false, error: err?.message || "Unknown error" };
  }
}

async function cleanupFileIfUncommitted(req) {
  if (!req?.file?.filename || req.fileCommitted || req.fileCleanedUp) {
    return { skipped: true, reason: "nothing_to_cleanup" };
  }

  req.fileCleanedUp = true;
  return safeDestroyCloudinaryImage({
    filename: req.file.filename,
    url: req.file.path,
  });
}

module.exports = {
  isCloudinaryManagedImage,
  safeDestroyCloudinaryImage,
  cleanupFileIfUncommitted,
};

