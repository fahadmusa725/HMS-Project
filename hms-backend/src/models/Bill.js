const mongoose = require("mongoose");
const tenantPlugin = require("../utils/tenantPlugin");

const billItemSchema = new mongoose.Schema(
  {
    description: { type: String, required: true, trim: true }, // e.g. "OPD Consultation Fee"
    category: {
      type: String,
      enum: ["OPD", "IPD", "Lab", "Pharmacy", "Other"],
      default: "Other",
    },
    amount: { type: Number, required: true, min: 0 },
  },
  { _id: false }
);

const billSchema = new mongoose.Schema(
  {
    patientId: { type: mongoose.Schema.Types.ObjectId, ref: "Patient", required: true },
    items: { type: [billItemSchema], required: true },
    totalAmount: { type: Number, required: true },
    amountPaid: { type: Number, default: 0 },
    paymentStatus: {
      type: String,
      enum: ["unpaid", "partial", "paid"],
      default: "unpaid",
    },
    paymentMethod: { type: String, enum: ["cash", "card", "insurance", "other"] },
    // Optional links back to the source records this bill covers
    labOrderId: { type: mongoose.Schema.Types.ObjectId, ref: "LabOrder" },
    pharmacySaleId: { type: mongoose.Schema.Types.ObjectId, ref: "PharmacySale" },
    admissionId: { type: mongoose.Schema.Types.ObjectId, ref: "Admission" },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true }
);

billSchema.plugin(tenantPlugin);
billSchema.index({ hospitalId: 1, patientId: 1, createdAt: -1 });
billSchema.index({ hospitalId: 1, paymentStatus: 1 });

module.exports = mongoose.model("Bill", billSchema);