const mongoose = require("mongoose");
const tenantPlugin = require("../utils/tenantPlugin");

const patientSchema = new mongoose.Schema(
  {
    mrn: { type: String, required: true, index: true }, // e.g. "CTH-000042"
    name: { type: String, required: true, trim: true },
    dob: { type: Date },
    gender: { type: String, enum: ["male", "female", "other"] },
    phone: { type: String, trim: true },
    address: { type: String, trim: true },
    allergies: [{ type: String }],
    chronicConditions: [{ type: String }],
    registeredBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true }
);

patientSchema.plugin(tenantPlugin);

// MRN unique per hospital (two hospitals can each have their own "CTH-000001")
patientSchema.index({ hospitalId: 1, mrn: 1 }, { unique: true });

// Simple text search across name/mrn/phone for the patient directory
patientSchema.index({ name: "text", mrn: "text", phone: "text" });

module.exports = mongoose.model("Patient", patientSchema);
