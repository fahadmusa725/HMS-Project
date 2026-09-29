/**
 * One-off: brings the Patient collection's indexes in line with the schema.
 * Needed once on databases created before the CNIC index changed from
 * `sparse` to a partial index - Mongoose won't replace an existing index
 * with the same keys on its own, so the old one (which only allows ONE
 * patient without a CNIC per hospital) stays until dropped here.
 *
 * Usage: npm run sync:indexes
 */
require("dotenv").config();
const mongoose = require("mongoose");
const connectDB = require("../config/db");
const Patient = require("../models/Patient");

async function main() {
  await connectDB();
  const dropped = await Patient.syncIndexes();
  console.log("✅ Patient indexes synced.", dropped.length ? `Dropped: ${dropped.join(", ")}` : "Nothing to drop.");
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error("❌ Index sync failed:", err.message);
  process.exit(1);
});
