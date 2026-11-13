/**
 * File type detection from the first bytes of the upload.
 *
 * A browser-supplied MIME type (and the filename extension) is just a string in the
 * multipart body - anyone can rename a script or an executable to "report.pdf". The
 * pre-check therefore accepts a file only when its actual header matches one of the
 * three formats the feature supports.
 */

const PDF_SIGNATURE = Buffer.from("%PDF-", "latin1");
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

const DETECTORS = [
  {
    format: "pdf",
    mimeType: "application/pdf",
    resourceType: "raw", // Cloudinary stores PDFs as raw, not image
    matches: (buffer) => buffer.length >= 5 && buffer.subarray(0, 5).equals(PDF_SIGNATURE),
  },
  {
    format: "jpg",
    mimeType: "image/jpeg",
    resourceType: "image",
    matches: (buffer) =>
      buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff,
  },
  {
    format: "png",
    mimeType: "image/png",
    resourceType: "image",
    matches: (buffer) => buffer.length >= 8 && buffer.subarray(0, 8).equals(PNG_SIGNATURE),
  },
];

/**
 * Returns { format, mimeType, resourceType } for PDF/JPEG/PNG, or null when the bytes
 * match none of them (wrong format, empty file, or a spoofed extension).
 */
function detectFileType(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) return null;
  const detector = DETECTORS.find((candidate) => candidate.matches(buffer));
  if (!detector) return null;
  return { format: detector.format, mimeType: detector.mimeType, resourceType: detector.resourceType };
}

module.exports = { detectFileType };
