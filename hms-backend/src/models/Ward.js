const mongoose = require("mongoose");
const tenantPlugin = require("../utils/tenantPlugin");

const wardSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true }, // e.g. "General Ward", "ICU", "Maternity"
    department: { type: String, trim: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true }
);

wardSchema.plugin(tenantPlugin);

module.exports = mongoose.model("Ward", wardSchema);