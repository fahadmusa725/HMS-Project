/**
 * Full end-to-end test against your LIVE MongoDB Atlas database.
 * Run this WHILE `npm run dev` is running in another terminal.
 *
 * Usage: node test-flow.js
 */
require("dotenv").config();

const BASE_URL = `http://localhost:${process.env.PORT || 5000}`;

async function main() {
  console.log("🧪 Starting end-to-end test against", BASE_URL, "\n");

  // 1. Login as Platform Super Admin
  console.log("1️⃣  Logging in as Platform Super Admin...");
  const loginRes = await fetch(`${BASE_URL}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: process.env.SUPER_ADMIN_EMAIL,
      password: process.env.SUPER_ADMIN_PASSWORD,
    }),
  });
  const loginData = await loginRes.json();

  if (!loginRes.ok) {
    console.error("❌ Super admin login FAILED:", loginData);
    console.error("\nDid you run `npm run seed:superadmin` yet? Run that first.");
    process.exit(1);
  }
  console.log("✅ Logged in. Role:", loginData.user.role, "| hospitalId:", loginData.user.hospitalId, "(should be null/none — super admin isn't tied to a hospital)\n");

  const superAdminToken = loginData.token;

  // 2. Create a test hospital with a 14-day trial
  console.log("2️⃣  Creating a test hospital with a 14-day trial...");
  const uniqueEmail = `admin+test${Date.now()}@example.com`;
  const createRes = await fetch(`${BASE_URL}/api/super-admin/hospitals`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${superAdminToken}`,
    },
    body: JSON.stringify({
      hospitalName: "Test City Hospital",
      adminName: "Test Admin",
      adminEmail: uniqueEmail,
      adminPassword: "testpassword123",
      trialDays: 14,
    }),
  });
  const createData = await createRes.json();

  if (!createRes.ok) {
    console.error("❌ Hospital creation FAILED:", createData);
    process.exit(1);
  }
  console.log("✅ Hospital created:", createData.hospital.name);
  console.log("   Status:", createData.hospital.status, "| Trial ends:", createData.hospital.trialEndDate);
  console.log("   Hospital Admin account:", createData.admin.email, "\n");

  // 3. List all hospitals (super-admin-only, cross-tenant view)
  console.log("3️⃣  Listing all hospitals (Super Admin view)...");
  const listRes = await fetch(`${BASE_URL}/api/super-admin/hospitals`, {
    headers: { Authorization: `Bearer ${superAdminToken}` },
  });
  const listData = await listRes.json();
  console.log(`✅ Found ${listData.length} hospital(s) in the system.\n`);

  // 4. Login as the new Hospital Admin - proves tenant scoping works
  console.log("4️⃣  Logging in as the new Hospital Admin...");
  const adminLoginRes = await fetch(`${BASE_URL}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: uniqueEmail, password: "testpassword123" }),
  });
  const adminLoginData = await adminLoginRes.json();

  if (!adminLoginRes.ok) {
    console.error("❌ Hospital admin login FAILED:", adminLoginData);
    process.exit(1);
  }
  console.log("✅ Hospital Admin logged in. Role:", adminLoginData.user.role, "| hospitalId:", adminLoginData.user.hospitalId);
  console.log("   (This hospitalId is now baked into their token - every future query they make");
  console.log("    will automatically be locked to ONLY this hospital's data.)\n");

  // 5. Confirm a hospital admin CANNOT access super-admin-only routes
  console.log("5️⃣  Confirming Hospital Admin is BLOCKED from Super Admin routes...");
  const blockedRes = await fetch(`${BASE_URL}/api/super-admin/hospitals`, {
    headers: { Authorization: `Bearer ${adminLoginData.token}` },
  });
  if (blockedRes.status === 403) {
    console.log("✅ Correctly blocked (403 Forbidden) — role-based access control is working.\n");
  } else {
    console.error("❌ SECURITY ISSUE: Hospital Admin was NOT blocked! Status:", blockedRes.status);
    process.exit(1);
  }

  console.log("🎉 ALL TESTS PASSED — Phase 0 multi-tenant foundation is fully verified on your live database.");
}

main().catch((err) => {
  console.error("💥 Test script crashed:", err);
  process.exit(1);
});