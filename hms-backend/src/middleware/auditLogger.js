const AuditLog = require("../models/AuditLog");
const { describeAction, auditPath, extractResourceId } = require("../utils/auditActions");

const MUTATING_METHODS = ["POST", "PATCH", "PUT", "DELETE"];

/**
 * Mount this AFTER protect() (so req.user + tenant context are set).
 * Listens for the response finishing, then fire-and-forget writes an
 * audit entry for successful mutations. Never blocks or fails the actual
 * request - a logging failure is only ever console.error'd, never surfaced
 * to the client.
 *
 * hospitalId is passed explicitly so the write does not depend on the request's
 * AsyncLocalStorage context still being alive when the response finishes.
 */
function auditLogger(req, res, next) {
  if (!MUTATING_METHODS.includes(req.method)) return next();

  res.on("finish", () => {
    if (res.statusCode < 200 || res.statusCode >= 300) return; // only log successful actions
    // The handler wrote its own richer entry (e.g. an appointment priority change with
    // before/after details) - don't duplicate it with this generic one.
    if (res.locals.auditHandled) return;

    const hospitalId = req.user && req.user.hospitalId;
    if (!hospitalId || !req.user) return; // platform-level actions (super admin) aren't logged here

    // The path is stored without its query string; see utils/auditActions.js.
    const path = auditPath(req);

    AuditLog.create({
      hospitalId,
      userId: req.user.userId,
      userName: req.user.name,
      userRole: req.user.role,
      method: req.method,
      path,
      statusCode: res.statusCode,
      action: res.locals.auditAction || describeAction(req.method, path),
      resourceId: res.locals.auditResourceId || extractResourceId(path),
      patientId: res.locals.auditPatientId || undefined,
    }).catch((err) => console.error("[AuditLog] failed to write entry:", err.message));
  });

  next();
}

module.exports = auditLogger;
