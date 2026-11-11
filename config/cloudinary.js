const cloudinary = require("cloudinary").v2;
const { CloudinaryStorage } = require("multer-storage-cloudinary");
const { env } = require("./env.js");

const ALLOWED_IMAGE_FORMATS = ["png", "jpg", "jpeg", "webp"];
const ALLOWED_IMAGE_MIME_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/webp",
]);
const ALLOWED_IMAGE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".webp"]);
const MAX_IMAGE_FILE_SIZE = 5 * 1024 * 1024; // 5 MB

cloudinary.config({
  cloud_name: env.cloudinary.cloudName,
  api_key: env.cloudinary.apiKey,
  api_secret: env.cloudinary.apiSecret,
});

const storage = new CloudinaryStorage({
  cloudinary,
  params: {
    folder: env.cloudinary.folder,
    allowed_formats: ALLOWED_IMAGE_FORMATS,
  },
});

module.exports = {
  cloudinary,
  storage,
  ALLOWED_IMAGE_FORMATS,
  ALLOWED_IMAGE_MIME_TYPES,
  ALLOWED_IMAGE_EXTENSIONS,
  MAX_IMAGE_FILE_SIZE,
};

