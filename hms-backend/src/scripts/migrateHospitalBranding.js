/**
 * One-off: retires the old TV-only `settings.displayName`.
 *
 * The hospital's name is now the single source for every surface (headers, tenant card, TV
 * board, slips, emails, Super Admin console), so the separate display name no longer exists in
 * the schema. This script removes any leftover value, and promotes it into `name` only when a
 * hospital genuinely has no name - a display name never overwrites the official name.
 *
 * Idempotent, so it is safe to run after every deploy that might still have legacy rows.
 *
 * Usage: npm run migrate:branding [-- --dry-run]
 */
require("dotenv").config();
const mongoose = require("mongoose");
const connectDB = require("../config/db");
const Hospital = require("../models/Hospital");

const DRY_RUN = process.argv.includes("--dry-run");

async function main() {
  await connectDB();

  // Raw collection access on purpose: `settings.displayName` is no longer in the schema, so a
  // model query would never see (or be able to unset) the leftover field.
  const legacy = await Hospital.collection
    .find({ "settings.displayName": { $type: "string" } })
    .project({ name: 1, settings: 1 })
    .toArray();

  let promoted = 0;
  let dropped = 0;

  for (const doc of legacy) {
    const displayName = String(doc.settings?.displayName || "").trim();
    const name = String(doc.name || "").trim();
    const update = { $unset: { "settings.displayName": "" } };

    if (!name && displayName) {
      update.$set = { name: displayName };
      promoted += 1;
      console.log(`- ${doc._id}: name <- "${displayName}"`);
    } else {
      dropped += 1;
      console.log(`- ${doc._id}: kept "${name}"`);
    }

    if (!DRY_RUN) await Hospital.collection.updateOne({ _id: doc._id }, update);
  }

  console.log(
    `\n${DRY_RUN ? "[dry run] " : ""}${legacy.length} legacy display name(s): ` +
      `${promoted} promoted into the hospital name, ${dropped} dropped.`
  );

  await mongoose.disconnect();
}

main().catch(async (err) => {
  console.error("❌ Hospital branding migration failed:", err.message);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
