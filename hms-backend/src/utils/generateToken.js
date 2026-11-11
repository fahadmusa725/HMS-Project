const jwt = require("jsonwebtoken");

/**
 * The JWT payload is the source of truth for hospitalId + role.
 * Nothing from the request body/query is ever trusted for these -
 * they always come from this signed token.
 */
function generateToken(user) {
  return jwt.sign(
    {
      userId: user._id.toString(),
      role: user.role,
      hospitalId: user.hospitalId ? user.hospitalId.toString() : null,
    },
    process.env.JWT_SECRET,
    // No refresh-token system: this one token IS the session. 1 day keeps a full
    // shift (including overnight) usable while keeping a stolen token short-lived.
    // Account status is re-checked from the database on every request anyway.
    { expiresIn: process.env.JWT_EXPIRES_IN || "1d" }
  );
}

module.exports = generateToken;
