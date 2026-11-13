const mongoose = require("mongoose");
const tenantPlugin = require("../utils/tenantPlugin");

const prescriptionItemSchema = new mongoose.Schema(
  {
    medicineName: { type: String, required: true, trim: true },
    dosage: { type: String, trim: true }, // e.g. "500mg"
    frequency: { type: String, trim: true }, // e.g. "twice daily"
    duration: { type: String, trim: true }, // e.g. "5 days"
    instructions: { type: String, trim: true }, // e.g. "after meals"
  },
  { _id: false }
);

const consultationSchema = new mongoose.Schema(
  {
    patientId: { type: mongoose.Schema.Types.ObjectId, ref: "Patient", required: true },
    doctorId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    appointmentId: { type: mongoose.Schema.Types.ObjectId, ref: "Appointment" }, // optional link back to the visit
    vitals: {
      bloodPressure: { type: String }, // e.g. "120/80"
      temperature: { type: String }, // e.g. "98.6 F"
      pulse: { type: String }, // e.g. "72 bpm"
      weight: { type: String }, // e.g. "70 kg"
      height: { type: String }, // e.g. "170 cm"
    },
    symptoms: { type: String, trim: true },
    // The pre-check the patient submitted before the visit, when this consultation built on it.
    preCheckId: { type: mongoose.Schema.Types.ObjectId, ref: "PreCheck" },
    // Where each vital sign came from: the patient's own pre-check submission, or a
    // measurement taken in the room. Absent on consultations recorded before pre-checks.
    vitalsSource: {
      bloodPressure: { type: String, enum: ["patient", "staff"] },
      temperature: { type: String, enum: ["patient", "staff"] },
      pulse: { type: String, enum: ["patient", "staff"] },
      weight: { type: String, enum: ["patient", "staff"] },
      height: { type: String, enum: ["patient", "staff"] },
    },
    diagnosis: { type: String, trim: true },
    notes: { type: String, trim: true },
    prescriptions: [prescriptionItemSchema],
    followUpDate: { type: String }, // "YYYY-MM-DD", optional
  },
  { timestamps: true }
);

consultationSchema.plugin(tenantPlugin);

consultationSchema.index({ hospitalId: 1, patientId: 1, createdAt: -1 });

module.exports = mongoose.model("Consultation", consultationSchema);