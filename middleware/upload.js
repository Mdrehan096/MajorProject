const path = require("node:path");
const multer = require("multer");
const ExpressError = require("../utils/ExpressError.js");
const {
  storage,
  ALLOWED_IMAGE_MIME_TYPES,
  ALLOWED_IMAGE_EXTENSIONS,
  MAX_IMAGE_FILE_SIZE,
} = require("../config/cloudinary.js");

const imageFileFilter = (req, file, cb) => {
  const ext = path.extname(file.originalname || "").toLowerCase();
  const mime = (file.mimetype || "").toLowerCase();

  if (!ALLOWED_IMAGE_MIME_TYPES.has(mime) || !ALLOWED_IMAGE_EXTENSIONS.has(ext)) {
    return cb(
      new ExpressError(
        400,
        "Unsupported file format. Only PNG, JPG, JPEG, and WEBP images are allowed."
      ),
      false
    );
  }

  cb(null, true);
};

const listingUpload = multer({
  storage,
  limits: {
    fileSize: MAX_IMAGE_FILE_SIZE,
    files: 1,
  },
  fileFilter: imageFileFilter,
});

function uploadListingImage(req, res, next) {
  listingUpload.single("listing[image]")(req, res, (err) => {
    if (!err) {
      return next();
    }

    if (err instanceof multer.MulterError) {
      if (err.code === "LIMIT_FILE_SIZE") {
        return next(
          new ExpressError(
            400,
            "File too large. Maximum allowed image size is 5MB."
          )
        );
      }
      if (
        err.code === "LIMIT_UNEXPECTED_FILE" ||
        err.code === "LIMIT_FILE_COUNT"
      ) {
        return next(
          new ExpressError(
            400,
            "Invalid upload field or too many files. Only one image file is allowed."
          )
        );
      }
      return next(new ExpressError(400, `Upload error: ${err.message}`));
    }

    if (err instanceof ExpressError) {
      return next(err);
    }

    const statusCode =
      err.http_code && err.http_code >= 400 && err.http_code < 500
        ? err.http_code
        : 400;
    return next(
      new ExpressError(
        statusCode,
        "Invalid or corrupted image file. Only PNG, JPG, JPEG, and WEBP images are allowed."
      )
    );
  });
}

module.exports = {
  uploadListingImage,
};

