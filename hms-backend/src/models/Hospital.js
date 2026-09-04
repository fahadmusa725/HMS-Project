const mongoose = require("mongoose");

/**
 * Hospital = a tenant. This model must NEVER use tenantPlugin -
 * it's the registry OF tenants, managed only by the Platform Super Admin.
 */
const hospitalSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    status: {
      type: String,
      enum: ["trial", "active", "suspended"],
      default: "trial",
    },
    trialStartDate: { type: Date },
    trialEndDate: { type: Date }, // Super Admin sets any custom length
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" }, // Super Admin who onboarded it
  },
  { timestamps: true }
);

// Helper: is this hospital's trial currently expired?
hospitalSchema.methods.isTrialExpired = function () {
  if (this.status !== "trial" || !this.trialEndDate) return false;
  return new Date() > this.trialEndDate;
};

module.exports = mongoose.model("Hospital", hospitalSchema);
