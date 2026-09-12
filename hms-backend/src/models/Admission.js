const mongoose = require("mongoose");
const tenantPlugin = require("../utils/tenantPlugin");

const admissionSchema = new mongoose.Schema(
  {
    patientId: { type: mongoose.Schema.Types.ObjectId, ref: "Patient", required: true },
    wardId: { type: mongoose.Schema.Types.ObjectId, ref: "Ward", required: true },
    bedId: { type: mongoose.Schema.Types.ObjectId, ref: "Bed", required: true },
    doctorId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    reason: { type: String, trim: true },
    admitDate: { type: Date, default: Date.now },
    dischargeDate: { type: Date },
    dischargeNotes: { type: String, trim: true },
    status: {
      type: String,
      enum: ["admitted", "discharged"],
      default: "admitted",
    },
    admittedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true }
);

admissionSchema.plugin(tenantPlugin);

// Fast lookup: "all currently admitted patients" (the live IPD list)
admissionSchema.index({ hospitalId: 1, status: 1 });

module.exports = mongoose.model("Admission", admissionSchema);