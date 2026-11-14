const mongoose = require("mongoose");
const tenantPlugin = require("../utils/tenantPlugin");

const auditLogSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    // Snapshots, so an entry still reads correctly after the user is renamed or deleted.
    userName: { type: String, trim: true },
    userRole: { type: String, required: true },
    method: { type: String, required: true }, // POST, PATCH, DELETE, or GET for PHI reads
    // Request path WITHOUT the query string - query strings can carry search terms and tokens.
    path: { type: String, required: true }, // e.g. "/api/patients/64f.../discharge"
    statusCode: { type: Number, required: true },
    // Human-readable action, e.g. "Viewed a patient record" (see utils/auditActions.js).
    action: { type: String, trim: true },
    // The record the action was performed on (first ObjectId in the path).
    resourceId: { type: String, trim: true },
    // Set for PHI reads, so "who opened which patient's chart" is answerable directly.
    patientId: { type: mongoose.Schema.Types.ObjectId, ref: "Patient" },
    // Optional richer context for actions the generic action can't describe,
    // e.g. "Priority normal -> senior (Senior citizen, age 72)".
    details: { type: String, trim: true },
  },
  { timestamps: true }
);

auditLogSchema.plugin(tenantPlugin);
auditLogSchema.index({ hospitalId: 1, createdAt: -1 });
auditLogSchema.index({ hospitalId: 1, action: 1, createdAt: -1 });
auditLogSchema.index({ hospitalId: 1, patientId: 1, createdAt: -1 });

module.exports = mongoose.model("AuditLog", auditLogSchema);