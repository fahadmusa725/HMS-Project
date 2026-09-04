const jwt = require("jsonwebtoken");
const { runWithTenantContext } = require("../utils/tenantContext");

/**
 * protect() - verifies the JWT, then wraps the rest of the request
 * pipeline in a tenant context carrying { hospitalId, role, userId }.
 * Every downstream model query automatically gets scoped via
 * tenantPlugin reading this context - no manual hospitalId passing.
 */
function protect(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ message: "Not authenticated. Missing token." });
  }

  const token = authHeader.split(" ")[1];

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    req.user = {
      userId: decoded.userId,
      role: decoded.role,
      hospitalId: decoded.hospitalId,
    };

    // Everything from here to the end of the request runs inside
    // this tenant context. Platform Super Admin has hospitalId=null,
    // which means tenant-scoped models will correctly refuse to
    // return data to them unless they explicitly opt out per-query
    // (see tenantPlugin.js `skipTenantScope` option) for admin-only
    // cross-tenant endpoints like listing all hospitals.
    runWithTenantContext(
      { hospitalId: decoded.hospitalId, role: decoded.role, userId: decoded.userId },
      () => next()
    );
  } catch (err) {
    return res.status(401).json({ message: "Invalid or expired token." });
  }
}

module.exports = protect;
