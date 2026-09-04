/**
 * Run once: `npm run seed:superadmin`
 * Creates the one and only Platform Super Admin account (you),
 * using the values from your .env file.
 */
require("dotenv").config();
const connectDB = require("../config/db");
const User = require("../models/User");

async function run() {
  await connectDB();

  const email = process.env.SUPER_ADMIN_EMAIL;
  const password = process.env.SUPER_ADMIN_PASSWORD;
  const name = process.env.SUPER_ADMIN_NAME || "Super Admin";

  if (!email || !password) {
    console.error("Set SUPER_ADMIN_EMAIL and SUPER_ADMIN_PASSWORD in .env first.");
    process.exit(1);
  }

  const existing = await User.findOne({ email }).setOptions({ skipTenantScope: true });
  if (existing) {
    console.log("Super admin already exists:", existing.email);
    process.exit(0);
  }

  const admin = await User.create({
    name,
    email,
    password,
    role: "platform_super_admin",
    status: "active",
    // no hospitalId - platform_super_admin isn't scoped to any hospital
  });

  console.log("✅ Platform Super Admin created:", admin.email);
  process.exit(0);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
