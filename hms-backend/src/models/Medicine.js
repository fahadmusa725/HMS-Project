const mongoose = require("mongoose");
const tenantPlugin = require("../utils/tenantPlugin");

const medicineSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    category: { type: String, trim: true }, // e.g. "Antibiotic", "Painkiller"
    unit: { type: String, default: "tablet" }, // tablet, syrup, injection, etc.
    stock: { type: Number, required: true, min: 0, default: 0 },
    price: { type: Number, required: true, min: 0 }, // price per unit
    expiryDate: { type: Date },
    supplier: { type: String, trim: true },
    lowStockThreshold: { type: Number, default: 10 },
  },
  { timestamps: true }
);

medicineSchema.plugin(tenantPlugin);
medicineSchema.index({ name: "text", category: "text" });

module.exports = mongoose.model("Medicine", medicineSchema);