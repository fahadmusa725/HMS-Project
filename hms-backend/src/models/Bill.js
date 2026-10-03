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

const PAYMENT_METHODS = ["cash", "card", "insurance", "jazzcash", "easypaisa", "bank_transfer", "other"];

// A single payment/installment against a bill. For jazzcash/easypaisa/bank_transfer this is a
// manual record of the transaction reference the patient completed in their own app/bank - not a
// live gateway integration.
const paymentSchema = new mongoose.Schema(
  {
    method: { type: String, enum: PAYMENT_METHODS, required: true },
    amount: { type: Number, required: true, min: 0 },
    referenceNumber: { type: String, trim: true }, // transaction/reference no. for jazzcash/easypaisa/bank_transfer
    paidBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    date: { type: Date, default: Date.now },
  },
  { _id: false }
);

// Splits a bill's cost between payers, e.g. the patient themself plus a corporate panel/TPA.
const sponsorSchema = new mongoose.Schema(
  {
    payerType: { type: String, enum: ["patient", "panel", "tpa"], required: true },
    payerName: { type: String, trim: true },
    coveragePercent: { type: Number, min: 0, max: 100 },
    coverageAmount: { type: Number, min: 0 },
    amountOwed: { type: Number, default: 0, min: 0 },
    amountPaid: { type: Number, default: 0, min: 0 },
  },
  { _id: false }
);

const billSchema = new mongoose.Schema(
  {
    patientId: { type: mongoose.Schema.Types.ObjectId, ref: "Patient", required: true },
    items: { type: [billItemSchema], required: true },
    totalAmount: { type: Number, required: true },
    // Derived total of `payments`, kept in sync by controller logic for backward compatibility
    // with existing reports/UI that read a single amountPaid number.
    amountPaid: { type: Number, default: 0 },
    payments: { type: [paymentSchema], default: [] },
    sponsors: { type: [sponsorSchema], default: [] },
    paymentStatus: {
      type: String,
      enum: ["unpaid", "partial", "paid"],
      default: "unpaid",
    },
    paymentMethod: { type: String, enum: PAYMENT_METHODS },
    labOrderId: { type: mongoose.Schema.Types.ObjectId, ref: "LabOrder" },
    appointmentId: { type: mongoose.Schema.Types.ObjectId, ref: "Appointment" }, // auto-created OPD fee bill
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
module.exports.PAYMENT_METHODS = PAYMENT_METHODS;