const mongoose = require("mongoose");
const tenantPlugin = require("../utils/tenantPlugin");

const orderedTestSchema = new mongoose.Schema(
  {
    testId: { type: mongoose.Schema.Types.ObjectId, ref: "LabTest", required: true },
    testName: { type: String, required: true }, // snapshot at order time, survives catalog edits
    price: { type: Number, required: true },
  },
  { _id: false }
);

const labOrderSchema = new mongoose.Schema(
  {
    patientId: { type: mongoose.Schema.Types.ObjectId, ref: "Patient", required: true },
    doctorId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true }, // ordering doctor
    consultationId: { type: mongoose.Schema.Types.ObjectId, ref: "Consultation" }, // optional link
    tests: { type: [orderedTestSchema], required: true },
    status: {
      type: String,
      enum: ["ordered", "sample_collected", "in_progress", "completed", "cancelled"],
      default: "ordered",
    },
    resultNotes: { type: String, trim: true },
    resultFileUrl: { type: String }, // Cloudinary URL, wired up when file uploads are added
    orderedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    completedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    completedAt: { type: Date },
  },
  { timestamps: true }
);

labOrderSchema.plugin(tenantPlugin);
labOrderSchema.index({ hospitalId: 1, status: 1 });
labOrderSchema.index({ hospitalId: 1, patientId: 1, createdAt: -1 });

module.exports = mongoose.model("LabOrder", labOrderSchema);