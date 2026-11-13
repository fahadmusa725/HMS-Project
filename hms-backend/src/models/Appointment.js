const mongoose = require("mongoose");
const tenantPlugin = require("../utils/tenantPlugin");

const appointmentSchema = new mongoose.Schema(
  {
    patientId: { type: mongoose.Schema.Types.ObjectId, ref: "Patient", required: true },
    doctorId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    type: { type: String, enum: ["OPD", "IPD"], default: "OPD" },
    date: { type: String, required: true }, // "YYYY-MM-DD" - simplifies day-based queue queries
    // "HH:MM" (24h) for slot bookings. Absent for walk-ins, which are token-driven and
    // valid any time the doctor is in - the slot indexes below are partial on it.
    time: { type: String },
    // Resets per hospital per DOCTOR per day, so each doctor room has its own sequence.
    tokenNumber: { type: Number, required: true },
    // Queue priority. Staff must confirm a non-normal priority and give a reason;
    // the schema enforces the reason so no API path can skip it.
    priority: { type: String, enum: ["normal", "senior", "emergency"], default: "normal" },
    priorityReason: {
      type: String,
      trim: true,
      required: function () {
        return this.priority && this.priority !== "normal";
      },
    },
    // Stamped the moment an appointment becomes checked_in. This is the tie-breaker
    // that makes the waiting order deterministic (see utils/queueOrder.js).
    checkedInAt: { type: Date },
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

appointmentSchema.index({ hospitalId: 1, date: 1, doctorId: 1 });
appointmentSchema.index({ hospitalId: 1, date: 1, tokenNumber: 1 });
appointmentSchema.index({ hospitalId: 1, date: 1, doctorId: 1, status: 1 });

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

// A doctor can only be with one patient at a time. This partial unique index is the
// database-level guarantee behind that rule - both "Call next" and a manual status
// change race through it, and the loser gets a readable 409. If a pre-existing
// database already has two in_consultation rows for the same doctor/day, drop the
// duplicate first, then run `npm run sync:indexes`.
appointmentSchema.index(
  { hospitalId: 1, doctorId: 1, date: 1 },
  { unique: true, partialFilterExpression: { status: "in_consultation" } }
);

module.exports = mongoose.model("Appointment", appointmentSchema);
