const listingService = require("../services/listingService.js");
const { buildListingsUrl } = require("../utils/listingOptions.js");

module.exports.index = async (req, res) => {
  const discoveryData = await listingService.searchListings(req.query);
  res.locals.listingQuery = discoveryData.filters;

  res.render("listings/index.ejs", {
    allListings: discoveryData.listings,
    ...discoveryData,
    buildListingsUrl: (overrides = {}) =>
      buildListingsUrl(discoveryData.filters, overrides),
  });
};

module.exports.renderNewForm = (req, res) => {
  res.render("listings/new.ejs", {
    categories: listingService.LISTING_CATEGORIES,
  });
};

module.exports.showListing = async (req, res) => {
  const details = await listingService.getListingDetails(
    req.params.id,
    req.query
  );
  if (!details) {
    req.flash("error", "Listing you requested for does not exist");
    return res.redirect("/listings");
  }

  res.render("listings/show.ejs", details);
};

module.exports.checkListingAvailability = async (req, res, next) => {
  try {
    const availability = await listingService.getListingAvailability(
      req.params.id,
      req.query
    );
    return res.status(200).json(availability);
  } catch (err) {
    if (
      err &&
      Number.isInteger(err.statusCode) &&
      err.statusCode >= 400 &&
      err.statusCode < 500
    ) {
      return res.status(err.statusCode).json({
        available: false,
        error: err.message,
      });
    }
    return next(err);
  }
};

module.exports.createListing = async (req, res) => {
  try {
    await listingService.createListing(req.body?.listing, {
      ownerId: req.user?._id,
      file: req.file,
    });
    if (req.file) {
      req.fileCommitted = true;
    }
  } catch (err) {
    if (req.file) {
      req.fileCleanedUp = true;
    }
    throw err;
  }

  req.flash("success", "new Listing created");
  res.redirect("/listings");
};

module.exports.renderEditForm = async (req, res) => {
  const editData = await listingService.getListingForEdit(req.params.id);
  if (!editData) {
    req.flash("error", "Listing you requested for does not exist");
    return res.redirect("/listings");
  }

  res.render("listings/edit.ejs", editData);
};

module.exports.updateListing = async (req, res) => {
  const { id } = req.params;
  let updatedListing;

  try {
    updatedListing = await listingService.updateListing(id, req.body?.listing, {
      file: req.file,
    });
  } catch (err) {
    if (req.file) {
      req.fileCleanedUp = true;
    }
    throw err;
  }

  if (!updatedListing) {
    if (req.file) {
      req.fileCleanedUp = true;
    }
    req.flash("error", "Listing you requested for does not exist");
    return res.redirect("/listings");
  }

  if (req.file) {
    req.fileCommitted = true;
  }

  req.flash("success", "Listing updated");
  res.redirect(`/listings/${id}`);
};

module.exports.destroyListing = async (req, res) => {
  await listingService.deleteListing(req.params.id);
  req.flash("success", "Listing Deleted");
  res.redirect("/listings");
};
