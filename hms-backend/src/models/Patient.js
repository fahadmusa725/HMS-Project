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
    cnic: { type: String, trim: true }, // National ID (CNIC/B-Form) - used to prevent duplicate patient records
    address: { type: String, trim: true },
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

// CNIC unique per hospital WHEN provided (sparse - not every patient has one on file yet).
// This is the primary defense against duplicate patient records.
patientSchema.index({ hospitalId: 1, cnic: 1 }, { unique: true, sparse: true });

// Simple text search across name/mrn/phone for the patient directory
patientSchema.index({ name: "text", mrn: "text", phone: "text" });

module.exports = mongoose.model("Patient", patientSchema);