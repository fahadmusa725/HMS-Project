const jwt = require("jsonwebtoken");
const { runWithTenantContext } = require("../utils/tenantContext");
const { getRequestIdentity } = require("../utils/accountAccess");

// A user with a temporary password may only read their profile or set a new
// password - everything else is blocked until they do.
const PASSWORD_CHANGE_ALLOWED = new Set(["/api/auth/me", "/api/auth/change-password"]);

/**
 * protect() - verifies the JWT, re-checks the account against the database
 * (user status, hospital suspension, expired trial - cached, see
 * accountAccess.js), then wraps the rest of the request pipeline in a tenant
 * context carrying { hospitalId, role, userId }. Every downstream model query
 * automatically gets scoped via tenantPlugin reading this context - no manual
 * hospitalId passing. Role and hospitalId come from the database record, not
 * the token, so a role change takes effect without re-issuing tokens.
 */
async function protect(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ message: "Not authenticated. Missing token." });
  }

  const token = authHeader.split(" ")[1];

  let decoded;
  try {
    decoded = jwt.verify(token, process.env.JWT_SECRET);
  } catch (err) {
    return res.status(401).json({ message: "Invalid or expired token." });
  }

  try {
    const identity = await getRequestIdentity(decoded.userId);

    if (!identity) {
      return res.status(401).json({ message: "Invalid or expired token." });
    }

    if (identity.block) {
      return res.status(403).json(identity.block);
    }

    if (identity.mustChangePassword && !PASSWORD_CHANGE_ALLOWED.has(req.baseUrl + req.path)) {
      return res.status(403).json({
        code: "PASSWORD_CHANGE_REQUIRED",
        message: "Please set your own password before continuing.",
      });
    }

    req.user = {
      userId: identity.userId,
      name: identity.name,
      role: identity.role,
      hospitalId: identity.hospitalId,
    };

    // Everything from here to the end of the request runs inside
    // this tenant context. Platform Super Admin has hospitalId=null,
    // which means tenant-scoped models will correctly refuse to
    // return data to them unless they explicitly opt out per-query
    // (see tenantPlugin.js `skipTenantScope` option) for admin-only
    // cross-tenant endpoints like listing all hospitals.
    runWithTenantContext(
      { hospitalId: identity.hospitalId, role: identity.role, userId: identity.userId },
      () => next()
    );
  } catch (err) {
    console.error("[Auth] Failed to verify account status:", err);
    return res.status(500).json({ message: "Server error while verifying your session." });
  }
}

module.exports = protect;
