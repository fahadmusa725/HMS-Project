const mongoose = require("mongoose");
const tenantPlugin = require("../utils/tenantPlugin");

const nurseNoteSchema = new mongoose.Schema(
  {
    admissionId: { type: mongoose.Schema.Types.ObjectId, ref: "Admission", required: true },
    patientId: { type: mongoose.Schema.Types.ObjectId, ref: "Patient", required: true },
    nurseId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    note: { type: String, required: true, trim: true },
    vitals: {
      bloodPressure: { type: String },
      temperature: { type: String },
      pulse: { type: String },
    },
  },
  { timestamps: true }
);

nurseNoteSchema.plugin(tenantPlugin);
nurseNoteSchema.index({ hospitalId: 1, admissionId: 1, createdAt: -1 });

module.exports = mongoose.model("NurseNote", nurseNoteSchema);