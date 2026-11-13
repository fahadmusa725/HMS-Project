const multer = require("multer");

// Memory storage - the file buffer goes straight to Cloudinary, never
// touches disk (important on Vercel, where the filesystem is ephemeral).
const storage = multer.memoryStorage();

const ALLOWED_MIME_TYPES = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
];

function fileFilter(req, file, cb) {
  if (ALLOWED_MIME_TYPES.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error("Only PDF, JPEG, PNG, or WEBP files are allowed."));
  }
}

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
});

// Pre-check reports: 3 files, 5 MB each (keeps a clinic inside the Cloudinary free tier).
// Deliberately no fileFilter - a browser-supplied MIME type proves nothing, so the
// controller validates every buffer by its magic bytes (utils/fileSignature.js) and rejects
// anything that isn't a real PDF/JPEG/PNG.
const PRE_CHECK_MAX_FILE_BYTES = 5 * 1024 * 1024;
const PRE_CHECK_MAX_FILES = 3;

const preCheckUpload = multer({
  storage,
  limits: { fileSize: PRE_CHECK_MAX_FILE_BYTES, files: PRE_CHECK_MAX_FILES },
});

module.exports = { upload, preCheckUpload, PRE_CHECK_MAX_FILE_BYTES, PRE_CHECK_MAX_FILES };
