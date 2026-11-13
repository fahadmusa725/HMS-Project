const { cloudinary, isConfigured } = require("../config/cloudinary");

/**
 * Pre-check attachments are medical documents: they are uploaded as Cloudinary
 * "authenticated" assets, which have no public delivery URL at all. The only way to read
 * one is a signed URL with an expiry, minted here a couple of minutes at a time and handed
 * out by an authorized endpoint (see preCheckController.getAttachmentUrl).
 *
 * Free-tier friendly: no transformations, no derived assets, short TTLs - a URL is only
 * ever minted for the one viewer who just passed an access check.
 */
const SIGNED_URL_TTL_SECONDS = 120;

function assertConfigured() {
  if (!isConfigured()) {
    const error = new Error("Cloudinary is not configured yet - attachment storage is unavailable.");
    error.status = 503;
    throw error;
  }
}

/** Short-lived signed URL for one authenticated asset. */
function signedAttachmentUrl({ publicId, format, resourceType = "image" }) {
  assertConfigured();

  const expiresAt = Math.floor(Date.now() / 1000) + SIGNED_URL_TTL_SECONDS;
  const url = cloudinary.utils.private_download_url(publicId, format, {
    resource_type: resourceType,
    type: "authenticated",
    expires_at: expiresAt,
  });

  return { url, expiresAt };
}

/**
 * Deletes one asset. Never throws: a cancellation must not fail because Cloudinary is down,
 * and a already-deleted asset is a success as far as the caller is concerned.
 */
async function destroyAsset({ publicId, resourceType = "image" }) {
  if (!publicId || !isConfigured()) return false;
  try {
    await cloudinary.uploader.destroy(publicId, {
      resource_type: resourceType,
      type: "authenticated",
      invalidate: true,
    });
    return true;
  } catch (err) {
    console.error(`[Cloudinary] Failed to delete asset ${publicId}:`, err.message);
    return false;
  }
}

module.exports = { signedAttachmentUrl, destroyAsset, SIGNED_URL_TTL_SECONDS };
