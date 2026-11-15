/**
 * Hospital logo support for the PDFKit documents (OPD token slip, prescription).
 *
 * A printed slip is the last thing that should fail because a CDN is slow, so every step here
 * is best-effort: no logo, a timeout, a non-2xx answer or bytes pdfkit refuses to embed all end
 * with "print the slip without a logo", never with an error.
 */
const LOGO_FETCH_TIMEOUT_MS = 3000;

async function fetchLogoBuffer(url) {
  if (!url || typeof fetch !== "function") return null;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), LOGO_FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) return null;
    const buffer = Buffer.from(await response.arrayBuffer());
    return buffer.length > 0 ? buffer : null;
  } catch (err) {
    console.error("[HospitalLogo] could not fetch the logo for a PDF:", err.message);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Draws the logo centred above the title and leaves the cursor just below it, so the caller's
 * existing text flow continues unchanged. Returns the height consumed (0 = nothing drawn).
 */
async function drawHospitalLogo(doc, hospital, { maxWidth = 64, maxHeight = 64 } = {}) {
  try {
    const buffer = await fetchLogoBuffer(hospital && hospital.logoUrl);
    if (!buffer) return 0;

    const image = doc.openImage(buffer);
    // Never upscale: a small logo stays crisp and a large one is scaled down to fit.
    const scale = Math.min(maxWidth / image.width, maxHeight / image.height, 1);
    const width = Math.round(image.width * scale);
    const height = Math.round(image.height * scale);
    const left = doc.page.margins.left;
    const contentWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
    const y = doc.y;

    doc.image(image, left + (contentWidth - width) / 2, y, { width, height });
    doc.y = y + height + 6;

    return height;
  } catch (err) {
    console.error("[HospitalLogo] could not embed the logo in a PDF:", err.message);
    return 0;
  }
}

module.exports = { fetchLogoBuffer, drawHospitalLogo };
