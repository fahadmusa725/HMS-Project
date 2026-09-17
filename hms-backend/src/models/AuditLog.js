const mongoose = require("mongoose");
const tenantPlugin = require("../utils/tenantPlugin");

const auditLogSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    userRole: { type: String, required: true },
    method: { type: String, required: true }, // POST, PATCH, DELETE
    path: { type: String, required: true }, // e.g. "/api/patients/64f.../discharge"
    statusCode: { type: Number, required: true },
  },
  { timestamps: true }
);

auditLogSchema.plugin(tenantPlugin);
auditLogSchema.index({ hospitalId: 1, createdAt: -1 });

module.exports = mongoose.model("AuditLog", auditLogSchema);