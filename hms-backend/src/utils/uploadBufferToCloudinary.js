const { cloudinary, isConfigured } = require("../config/cloudinary");

/**
 * Uploads a buffer (from multer's memory storage) to Cloudinary and
 * returns the secure URL. Throws a clear error if credentials aren't
 * configured yet, rather than failing with a confusing SDK error.
 */
function uploadBufferToCloudinary(buffer, { folder = "hms-uploads", resourceType = "auto" } = {}) {
  if (!isConfigured()) {
    return Promise.reject(
      new Error("Cloudinary is not configured yet - add CLOUDINARY_CLOUD_NAME/API_KEY/API_SECRET to .env.")
    );
  }

  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      { folder, resource_type: resourceType },
      (err, result) => {
        if (err) return reject(err);
        resolve(result);
      }
    );
    uploadStream.end(buffer);
  });
}

module.exports = { uploadBufferToCloudinary };