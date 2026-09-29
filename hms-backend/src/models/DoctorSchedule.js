const mongoose = require("mongoose");
const tenantPlugin = require("../utils/tenantPlugin");

const availabilityBlockSchema = new mongoose.Schema(
  {
    dayOfWeek: { type: Number, required: true, min: 0, max: 6 }, // 0=Sunday ... 6=Saturday
    startTime: { type: String, required: true }, // "HH:MM", 24hr
    endTime: { type: String, required: true }, // "HH:MM", 24hr
  },
  { _id: false }
);

const doctorScheduleSchema = new mongoose.Schema(
  {
    doctorId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    consultationFee: { type: Number, default: 0 },
    slotDurationMinutes: { type: Number, default: 20 },
    weeklyAvailability: [availabilityBlockSchema],
  },
  { timestamps: true }
);

doctorScheduleSchema.plugin(tenantPlugin);
doctorScheduleSchema.index({ hospitalId: 1, doctorId: 1 }, { unique: true });

module.exports = mongoose.model("DoctorSchedule", doctorScheduleSchema);