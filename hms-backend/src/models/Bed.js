const mongoose = require("mongoose");
const tenantPlugin = require("../utils/tenantPlugin");

const bedSchema = new mongoose.Schema(
  {
    wardId: { type: mongoose.Schema.Types.ObjectId, ref: "Ward", required: true },
    bedNumber: { type: String, required: true, trim: true },
    status: {
      type: String,
      enum: ["vacant", "occupied", "reserved"],
      default: "vacant",
    },
  },
  { timestamps: true }
);

bedSchema.plugin(tenantPlugin);

// A bed number only needs to be unique within its ward, per hospital.
bedSchema.index({ hospitalId: 1, wardId: 1, bedNumber: 1 }, { unique: true });

module.exports = mongoose.model("Bed", bedSchema);