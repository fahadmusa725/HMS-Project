const mongoose = require("mongoose");
const tenantPlugin = require("../utils/tenantPlugin");

const appointmentSchema = new mongoose.Schema(
  {
    patientId: { type: mongoose.Schema.Types.ObjectId, ref: "Patient", required: true },
    doctorId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    type: { type: String, enum: ["OPD", "IPD"], default: "OPD" },
    date: { type: String, required: true }, // "YYYY-MM-DD" - simplifies day-based queue queries
    time: { type: String }, // e.g. "10:30 AM" - optional, queue is token-driven for OPD
    tokenNumber: { type: Number, required: true }, // resets per hospital per day
    reason: { type: String, trim: true },
    status: {
      type: String,
      enum: ["scheduled", "checked_in", "in_consultation", "completed", "cancelled", "no_show"],
      default: "scheduled",
    },
    bookedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true }
);

appointmentSchema.plugin(tenantPlugin);

// Fast lookups for "today's queue for Dr. X" and "today's queue overall"
appointmentSchema.index({ hospitalId: 1, date: 1, doctorId: 1 });
appointmentSchema.index({ hospitalId: 1, date: 1, tokenNumber: 1 });

module.exports = mongoose.model("Appointment", appointmentSchema);
