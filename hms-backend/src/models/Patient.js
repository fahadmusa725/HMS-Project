const mongoose = require("mongoose");
const tenantPlugin = require("../utils/tenantPlugin");

const patientSchema = new mongoose.Schema(
  {
    mrn: { type: String, required: true, index: true }, // e.g. "CTH-000042"
    name: { type: String, required: true, trim: true },
    dob: { type: Date },
    gender: { type: String, enum: ["male", "female", "other"] },
    phone: { type: String, trim: true },
    email: { type: String, trim: true, lowercase: true },
    // National ID (CNIC/B-Form) - used to prevent duplicate patient records.
    // A blank form field is stored as "no CNIC", never as "", so it can't collide in the unique index.
    cnic: { type: String, trim: true, set: (v) => (v == null || String(v).trim() === "" ? undefined : v) },
    address: { type: String, trim: true },
    // Free text, e.g. "Dr. Ahmed referral", "Facebook ad", "Walk-in" - optional, most patients
    // won't have one filled in.
    referredBy: { type: String, trim: true },
    allergies: [{ type: String }],
    chronicConditions: [{ type: String }],
    registeredBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    // Links this clinical record to a login account, once the patient has portal access.
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true }
);

patientSchema.plugin(tenantPlugin);

// MRN unique per hospital (two hospitals can each have their own "CTH-000001")
patientSchema.index({ hospitalId: 1, mrn: 1 }, { unique: true });

// CNIC unique per hospital WHEN provided - the primary defense against duplicate patient records.
// Must be a partial index, not `sparse`: a sparse COMPOUND index still indexes every document
// that has hospitalId, so all CNIC-less patients would collide on cnic=null and only one could exist.
// Existing databases built with the old sparse index: run `npm run sync:indexes` once.
patientSchema.index(
  { hospitalId: 1, cnic: 1 },
  { unique: true, partialFilterExpression: { cnic: { $type: "string" } } }
);

// Simple text search across name/mrn/phone for the patient directory
patientSchema.index({ name: "text", mrn: "text", phone: "text" });

module.exports = mongoose.model("Patient", patientSchema);