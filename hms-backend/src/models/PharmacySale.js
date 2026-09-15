const mongoose = require("mongoose");
const tenantPlugin = require("../utils/tenantPlugin");

const saleItemSchema = new mongoose.Schema(
  {
    medicineId: { type: mongoose.Schema.Types.ObjectId, ref: "Medicine", required: true },
    medicineName: { type: String, required: true }, // snapshot at sale time
    quantity: { type: Number, required: true, min: 1 },
    unitPrice: { type: Number, required: true },
    subtotal: { type: Number, required: true },
  },
  { _id: false }
);

const pharmacySaleSchema = new mongoose.Schema(
  {
    patientId: { type: mongoose.Schema.Types.ObjectId, ref: "Patient" }, // optional - walk-in sales allowed
    consultationId: { type: mongoose.Schema.Types.ObjectId, ref: "Consultation" }, // optional link to prescription
    items: { type: [saleItemSchema], required: true },
    totalAmount: { type: Number, required: true },
    dispensedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true }
);

pharmacySaleSchema.plugin(tenantPlugin);
pharmacySaleSchema.index({ hospitalId: 1, createdAt: -1 });

module.exports = mongoose.model("PharmacySale", pharmacySaleSchema);