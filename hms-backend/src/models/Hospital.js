const crypto = require("crypto");
const mongoose = require("mongoose");

/**
 * Per-hospital behaviour toggles. Kept as a subdocument (not loose top-level fields) so
 * the tenant registry itself stays small and adding a setting never risks colliding with
 * platform-level fields like name/status/trial dates.
 */
const hospitalSettingsSchema = new mongoose.Schema(
  {
    // Patients at or above this age get a "senior" priority suggestion at the desk.
    // It is only ever a suggestion - staff still confirm it (and give a reason).
    seniorAgeThreshold: { type: Number, default: 60, min: 0, max: 130 },
    // Lets patients check themselves in from the portal. Off by default: many hospitals
    // want the front desk to verify the patient is actually present.
    allowPatientSelfCheckIn: { type: Boolean, default: false },
    // Used to turn "N patients ahead" into an estimated wait on the portal.
    averageConsultationMinutes: { type: Number, default: 15, min: 1, max: 240 },
    // Random key embedded in the public /display/:hospitalId?key=... TV URL. Regeneratable,
    // which immediately invalidates every TV still using the old link.
    displayKey: { type: String, default: () => crypto.randomBytes(16).toString("hex") },
  },
  { _id: false }
);

/**
 * Hospital = a tenant. This model must NEVER use tenantPlugin -
 * it's the registry OF tenants, managed only by the Platform Super Admin.
 */
const hospitalSchema = new mongoose.Schema(
  {
    // The single source for the hospital's name everywhere: headers, the tenant card, the
    // waiting-room TV, printed slips, emails and the Super Admin console. The Hospital Admin
    // may edit it from Hospital Settings; nothing is keyed off it (no lookup, no index), so a
    // rename never breaks a reference. MRN prefixes are baked into existing MRNs by design.
    name: { type: String, required: true, trim: true, minlength: 2, maxlength: 80 },
    // The hospital's own brand mark. Public on purpose: it is shown on the login-free TV
    // board and embedded in emails, so it is uploaded as a normal (non-authenticated)
    // Cloudinary asset in a per-hospital folder. `logoPublicId` exists only so a replaced
    // or removed logo can be deleted instead of leaking storage.
    logoUrl: { type: String, trim: true, default: "" },
    logoPublicId: { type: String, trim: true, default: "" },
    status: {
      type: String,
      enum: ["trial", "active", "suspended"],
      default: "trial",
    },
    trialStartDate: { type: Date },
    trialEndDate: { type: Date }, // Super Admin sets any custom length
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" }, // Super Admin who onboarded it
    settings: { type: hospitalSettingsSchema, default: () => ({}) },
  },
  { timestamps: true }
);

hospitalSchema.methods.isTrialExpired = function () {
  if (this.status !== "trial" || !this.trialEndDate) return false;
  return new Date() > this.trialEndDate;
};

module.exports = mongoose.model("Hospital", hospitalSchema);
