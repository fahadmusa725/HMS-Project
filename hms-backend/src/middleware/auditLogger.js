const AuditLog = require("../models/AuditLog");
const { getCurrentHospitalId } = require("../utils/tenantContext");

const MUTATING_METHODS = ["POST", "PATCH", "PUT", "DELETE"];

/**
 * Mount this AFTER protect() (so req.user + tenant context are set).
 * Listens for the response finishing, then fire-and-forget writes an
 * audit entry for successful mutations. Never blocks or fails the actual
 * request - a logging failure is only ever console.error'd, never surfaced
 * to the client.
 */
function auditLogger(req, res, next) {
  if (!MUTATING_METHODS.includes(req.method)) return next();

  res.on("finish", () => {
    if (res.statusCode < 200 || res.statusCode >= 300) return; // only log successful actions

    const hospitalId = getCurrentHospitalId();
    if (!hospitalId || !req.user) return; // platform-level actions (super admin) aren't logged here

    AuditLog.create({
      userId: req.user.userId,
      userRole: req.user.role,
      method: req.method,
      path: req.originalUrl,
      statusCode: res.statusCode,
    }).catch((err) => console.error("[AuditLog] failed to write entry:", err.message));
  });

  next();
}

module.exports = auditLogger;