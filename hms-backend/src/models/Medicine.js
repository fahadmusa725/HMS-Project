const mongoose = require("mongoose");
const tenantPlugin = require("../utils/tenantPlugin");

// One received consignment of a medicine. FEFO dispensing always draws from the batch with the
// nearest expiryDate first, splitting across batches when one alone can't cover a line item.
const batchSchema = new mongoose.Schema(
  {
    batchNumber: { type: String, trim: true },
    quantity: { type: Number, required: true, min: 0 },
    expiryDate: { type: Date, required: true },
    purchasePrice: { type: Number, min: 0 },
    supplier: { type: String, trim: true },
    receivedDate: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

const medicineSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    category: { type: String, trim: true }, // e.g. "Antibiotic", "Painkiller"
    unit: { type: String, default: "tablet" }, // tablet, syrup, injection, etc.
    batches: { type: [batchSchema], default: [] },
    // Denormalized sum of batches[].quantity, kept in sync by every controller path that touches
    // batches (create/restock/dispense) so existing low-stock-threshold logic and any other code
    // reading medicine.stock directly keeps working without having to recompute it on every read.
    stock: { type: Number, required: true, min: 0, default: 0 },
    price: { type: Number, required: true, min: 0 }, // price per unit
    supplier: { type: String, trim: true },
    lowStockThreshold: { type: Number, default: 10 },
    // Last time a near-expiry email went out for this medicine, so the lazy check (run whenever
    // the medicine list is fetched) doesn't re-send on every page load.
    nearExpiryAlertedAt: { type: Date },
  },
  { timestamps: true }
);

medicineSchema.plugin(tenantPlugin);
medicineSchema.index({ name: "text", category: "text" });

module.exports = mongoose.model("Medicine", medicineSchema);
