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

// A cancelled/no-show appointment frees up both its slot and its patient+doctor+day
// combination for a fresh booking, so the partial filter leaves those two statuses out -
// same style as the cnic partial unique index above.
const ACTIVE_STATUSES = ["scheduled", "checked_in", "in_consultation", "completed"];
// Token-only bookings (no doctor schedule) have no `time`, and a plain unique index would treat
// every missing `time` as the same null value - the existence check keeps those out of this one.
appointmentSchema.index(
  { hospitalId: 1, doctorId: 1, date: 1, time: 1 },
  {
    unique: true,
    partialFilterExpression: { $and: [{ status: { $in: ACTIVE_STATUSES } }, { time: { $exists: true } }] },
  }
);
appointmentSchema.index(
  { hospitalId: 1, doctorId: 1, date: 1, patientId: 1 },
  { unique: true, partialFilterExpression: { status: { $in: ACTIVE_STATUSES } } }
);

module.exports = mongoose.model("Appointment", appointmentSchema);
