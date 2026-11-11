const Listing = require("../models/listing");
const mongoose = require("mongoose");
const ExpressError = require("../utils/ExpressError.js");
const { mapToken, geocodeLocation } = require("../config/mapbox.js");
const {
  safeDestroyCloudinaryImage,
  cleanupFileIfUncommitted,
} = require("../utils/cloudinaryCleanup.js");

module.exports.index = async (req, res) => {
  const allListings = await Listing.find({});
  res.render("listings/index.ejs", { allListings });
};

module.exports.renderNewForm = (req, res) => {
  res.render("listings/new.ejs");
};

module.exports.showListing = async (req, res) => {
  const { id } = req.params;
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new ExpressError(400, "Invalid ID ❌");
  }
  const listing = await Listing.findById(id)
    .populate({
      path: "reviews",
      populate: {
        path: "author",
        select: "username",
      },
    })
    .populate("owner", "username");

  if (!listing) {
    req.flash("error", "Listing you requested for does not exist");
    return res.redirect("/listings");
  }

  const mapListing = {
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

  res.render("listings/show.ejs", {
    listing,
    mapListing,
    mapToken: mapToken || "",
  });
};

module.exports.createListing = async (req, res) => {
  if (!req.file) {
    throw new ExpressError(400, "Listing image is required");
  }

  try {
    const { title, description, price, country, location } = req.body.listing;
    const geometry = await geocodeLocation(location);

    let url = req.file.path;
    let filename = req.file.filename;

    const newListing = new Listing({
      title,
      description,
      price,
      country,
      location,
    });
    newListing.owner = req.user._id;
    newListing.image = { url, filename };
    newListing.geometry = geometry;

    await newListing.save();
    req.fileCommitted = true;

    req.flash("success", "new Listing created");
    res.redirect("/listings");
  } catch (err) {
    await cleanupFileIfUncommitted(req);
    throw err;
  }
};

module.exports.renderEditForm = async (req, res) => {
  const { id } = req.params;
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new ExpressError(400, "Invalid ID ❌");
  }
  const listing = await Listing.findById(id);
  if (!listing) {
    req.flash("error", "Listing you requested for does not exist");
    return res.redirect("/listings");
  }
  let originalImageUrl = listing.image?.url || "";
  if (originalImageUrl) {
    originalImageUrl = originalImageUrl.replace("/upload", "/upload/w_250");
  }
  res.render("listings/edit.ejs", { listing, originalImageUrl });
};

module.exports.updateListing = async (req, res) => {
  let { id } = req.params;
  if (!mongoose.Types.ObjectId.isValid(id)) {
    await cleanupFileIfUncommitted(req);
    throw new ExpressError(400, "Invalid ID ❌");
  }

  let listing = await Listing.findById(id);
  if (!listing) {
    await cleanupFileIfUncommitted(req);
    req.flash("error", "Listing you requested for does not exist");
    return res.redirect("/listings");
  }

  const previousImage = listing.image
    ? { url: listing.image.url, filename: listing.image.filename }
    : null;

  const { title, description, price, country, location } = req.body.listing;
  listing.title = title;
  listing.description = description;
  listing.price = price;
  listing.country = country;
  listing.location = location;

  const hasNewFile = typeof req.file !== "undefined";
  if (hasNewFile) {
    listing.image = {
      url: req.file.path,
      filename: req.file.filename,
    };
  }

  try {
    await listing.save();
    req.fileCommitted = true;
  } catch (err) {
    await cleanupFileIfUncommitted(req);
    throw err;
  }

  if (
    hasNewFile &&
    previousImage?.filename &&
    previousImage.filename !== listing.image.filename
  ) {
    await safeDestroyCloudinaryImage(previousImage, {
      excludeListingId: listing._id,
    });
  }

  req.flash("success", "Listing updated");
  res.redirect(`/listings/${id}`);
};

module.exports.destroyListing = async (req, res) => {
  const { id } = req.params;
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new ExpressError(400, "Invalid ID ❌");
  }
  const deletedListing = await Listing.findByIdAndDelete(id);
  if (!deletedListing) {
    throw new ExpressError(404, "Listing Not Found ❌");
  }
  await safeDestroyCloudinaryImage(deletedListing.image, {
    excludeListingId: deletedListing._id,
  });
  req.flash("success", "Listing Deleted");
  res.redirect("/listings");
};
