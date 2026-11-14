const AuditLog = require("../models/AuditLog");
const { auditPath, extractResourceId } = require("../utils/auditActions");

/**
 * PHI read auditing.
 *
 * Reads of clinical data (a patient chart, the EMR, lab orders, a pre-check) are not
 * mutations, so the generic auditLogger never sees them. "Who opened whose chart" is
 * exactly the question a hospital needs answered, so those GET routes mount this.
 *
 * The handler sets `res.locals.auditPatientId` when the patient is not part of the URL
 * (e.g. a consultation loaded by id). `patientParam` names the URL segment that already
 * holds the patient id, for routes that spell it differently. Only successful responses
 * are recorded.
 */
function auditPhiRead(action, { patientParam = "patientId" } = {}) {
  return (req, res, next) => {
    // Express clears req.params once the router has run, so capture the id now - the
    // write happens on "finish", after that point.
    const paramPatientId = req.params && req.params[patientParam];

    res.on("finish", () => {
      if (res.statusCode < 200 || res.statusCode >= 300) return;
      if (!req.user || !req.user.hospitalId) return;

      const path = auditPath(req);

      AuditLog.create({
        hospitalId: req.user.hospitalId,
        userId: req.user.userId,
        userName: req.user.name,
        userRole: req.user.role,
        method: req.method,
        path,
        statusCode: res.statusCode,
        action,
        resourceId: res.locals.auditResourceId || extractResourceId(path),
        patientId: res.locals.auditPatientId || paramPatientId || undefined,
      }).catch((err) => console.error("[AuditLog] failed to write PHI read entry:", err.message));
    });

    next();
  };
}

module.exports = { auditPhiRead };
