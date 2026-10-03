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
    // Deposits collected during the stay - netted against the final bill at discharge.
    advancePayments: [
      {
        amount: { type: Number, required: true, min: 1 },
        method: { type: String, enum: ["cash", "card", "insurance", "other"], default: "cash" },
        receivedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
        receivedAt: { type: Date, default: Date.now },
        _id: false,
      },
    ],
  },
  { timestamps: true }
);

admissionSchema.plugin(tenantPlugin);

admissionSchema.index({ hospitalId: 1, status: 1 });

module.exports = mongoose.model("Admission", admissionSchema);