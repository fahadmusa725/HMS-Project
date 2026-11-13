const PreCheck = require("../models/PreCheck");
const { destroyAsset } = require("./cloudinaryAssets");

/**
 * Cancelling an appointment throws the pre-check away, including the reports the patient
 * uploaded - otherwise those files keep occupying the hospital's Cloudinary storage for
 * nothing. Safe to call for an appointment that never had a pre-check.
 */
async function purgePreCheckAssets(appointmentId) {
  const preCheck = await PreCheck.findOne({ appointmentId });
  if (!preCheck || preCheck.attachments.length === 0) return 0;

  const attachments = preCheck.attachments.slice();
  for (const attachment of attachments) {
    await destroyAsset({ publicId: attachment.publicId, resourceType: attachment.resourceType });
  }

  preCheck.attachments = [];
  preCheck.attachmentsPurgedAt = new Date();
  await preCheck.save();

  return attachments.length;
}

module.exports = { purgePreCheckAssets };
