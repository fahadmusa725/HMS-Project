/**
 * One-off: brings every collection's indexes in line with the schemas.
 * Needed whenever an index's keys change - Mongoose won't replace an existing
 * index with the same keys on its own, so the old one stays until it is dropped here.
 * Current reasons: Patient MRN/CNIC indexes, and the list/dashboard indexes added
 * for Bill, LabOrder, Medicine and Admission.
 *
 * Usage: npm run sync:indexes
 */
require("dotenv").config();
const mongoose = require("mongoose");
const connectDB = require("../config/db");
const Patient = require("../models/Patient");
const Bill = require("../models/Bill");
const LabOrder = require("../models/LabOrder");
const Medicine = require("../models/Medicine");
const Admission = require("../models/Admission");

const MODELS = [Patient, Bill, LabOrder, Medicine, Admission];

async function main() {
  await connectDB();
  for (const model of MODELS) {
    const dropped = await model.syncIndexes();
    console.log(
      `✅ ${model.modelName} indexes synced.`,
      dropped.length ? `Dropped: ${dropped.join(", ")}` : "Nothing to drop."
    );
  }
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error("❌ Index sync failed:", err.message);
  process.exit(1);
});
