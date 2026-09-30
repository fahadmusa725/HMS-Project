const mongoose = require("mongoose");
const tenantPlugin = require("../utils/tenantPlugin");

// Which batch(es) covered this line item and how much came from each - FEFO can split one
// line item across several batches, so this is an array rather than a single reference.
const batchUsedSchema = new mongoose.Schema(
  {
    batchNumber: { type: String, trim: true },
    quantity: { type: Number, required: true, min: 1 },
  },
  { _id: false }
);

const saleItemSchema = new mongoose.Schema(
  {
    medicineId: { type: mongoose.Schema.Types.ObjectId, ref: "Medicine", required: true },
    medicineName: { type: String, required: true }, // snapshot at sale time
    quantity: { type: Number, required: true, min: 1 },
    unitPrice: { type: Number, required: true },
    subtotal: { type: Number, required: true },
    batchesUsed: { type: [batchUsedSchema], default: [] },
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
    billed: { type: Boolean, default: false }, // true once settled at the counter or rolled into an IPD discharge bill
  },
  { timestamps: true }
);

pharmacySaleSchema.plugin(tenantPlugin);
pharmacySaleSchema.index({ hospitalId: 1, createdAt: -1 });

module.exports = mongoose.model("PharmacySale", pharmacySaleSchema);