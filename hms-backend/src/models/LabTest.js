const mongoose = require("mongoose");
const tenantPlugin = require("../utils/tenantPlugin");

const labTestSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true }, // e.g. "Complete Blood Count"
    department: { type: String, trim: true }, // e.g. "Hematology"
    price: { type: Number, required: true, min: 0 },
    turnaroundTime: { type: String }, // e.g. "24 hours", informational only
  },
  { timestamps: true }
);

labTestSchema.plugin(tenantPlugin);

module.exports = mongoose.model("LabTest", labTestSchema);