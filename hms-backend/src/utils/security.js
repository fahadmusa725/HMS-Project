const crypto = require("crypto");

/**
 * Small security helpers shared by auth, signup and every email template.
 * Nothing here depends on request state, so it is safe to use from jobs too.
 */

/** Escapes text dropped into an HTML email body - any of it may be user-supplied. */
function escapeHtml(value) {
  return String(value == null ? "" : value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Escapes a user-supplied search term before it goes into a MongoDB $regex, so
 * characters like `.` `*` `(` `[` match literally instead of acting as operators.
 */
function escapeRegex(value) {
  return String(value == null ? "" : value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// No 0/O/1/l/I lookalikes - these passwords get read off a screen or printed email.
const TEMP_PASSWORD_ALPHABET = "abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";

/** Cryptographically random temporary password (12 chars by default). */
function generateTempPassword(length = 12) {
  let password = "";
  for (let i = 0; i < length; i++) {
    password += TEMP_PASSWORD_ALPHABET[crypto.randomInt(TEMP_PASSWORD_ALPHABET.length)];
  }
  return password;
}

/** Cryptographically random 6-digit code, for patient record ownership verification. */
function generateNumericCode() {
  return String(crypto.randomInt(0, 1000000)).padStart(6, "0");
}

/** One-way hash for tokens/codes that are emailed and never stored in plain text. */
function hashToken(token) {
  return crypto.createHash("sha256").update(String(token)).digest("hex");
}

/** Constant-time string comparison, so a timing side channel can't leak a stored hash. */
function safeCompare(a, b) {
  const left = Buffer.from(String(a || ""));
  const right = Buffer.from(String(b || ""));
  if (left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
}

module.exports = {
  escapeHtml,
  escapeRegex,
  generateTempPassword,
  generateNumericCode,
  hashToken,
  safeCompare,
};
