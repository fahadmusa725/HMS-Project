/**
 * Patient Portal backend test against your LIVE database.
 * Run WHILE `npm run dev` is running. Usage: node test-patient-portal.js
 */
require("dotenv").config();
const BASE_URL = `http://localhost:${process.env.PORT || 5000}`;
const today = new Date().toISOString().slice(0, 10);

async function api(path, { method = "GET", token, body } = {}) {
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json();
  return { ok: res.ok, status: res.status, data };
}

async function main() {
  console.log("🧪 Patient Portal test against", BASE_URL, "\n");
  const stamp = Date.now();

  const superLogin = await api("/api/auth/login", {
    method: "POST",
    body: { email: process.env.SUPER_ADMIN_EMAIL, password: process.env.SUPER_ADMIN_PASSWORD },
  });
  const hosp = await api("/api/super-admin/hospitals", {
    method: "POST",
    token: superLogin.data.token,
    body: {
      hospitalName: `Portal Hospital ${stamp}`,
      adminName: "Portal Admin",
      adminEmail: `admin.portal+${stamp}@example.com`,
      adminPassword: "password123",
      trialDays: 7,
    },
  });
  const adminToken = (await api("/api/auth/login", { method: "POST", body: { email: hosp.data.admin.email, password: "password123" } })).data.token;
  const doctor = await api("/api/hospital-admin/staff", {
    method: "POST",
    token: adminToken,
    body: { name: "Dr. Portal", email: `dr.portal+${stamp}@example.com`, password: "password123", role: "doctor" },
  });
  console.log("✅ Hospital, admin, and doctor ready.\n");

  // 1. Register a patient WITH email + CNIC, verify no duplicate CNIC allowed
  console.log("1️⃣  Registering a patient with email + CNIC...");
  const cnic = `35202-${stamp}`.slice(0, 15);
  const patient1 = await api("/api/patients", {
    method: "POST",
    token: adminToken,
    body: { name: "Ali Raza", phone: "03001112222", email: `ali.raza+${stamp}@example.com`, cnic },
  });
  if (!patient1.ok) { console.error("❌ Registration failed:", patient1.data); process.exit(1); }

  const dupeCheck = await api("/api/patients", {
    method: "POST",
    token: adminToken,
    body: { name: "Someone Else", cnic }, // same CNIC
  });
  if (dupeCheck.status !== 409) { console.error("❌ Expected 409 for duplicate CNIC, got:", dupeCheck.status); process.exit(1); }
  console.log("✅ Patient registered, and duplicate CNIC correctly rejected (409).\n");

  // 2. Staff enables portal access for patient1
  console.log("2️⃣  Enabling portal access (staff-assisted)...");
  const enable = await api(`/api/patients/${patient1.data._id}/enable-portal`, { method: "POST", token: adminToken });
  if (!enable.ok) { console.error("❌ Enable portal access failed:", enable.data); process.exit(1); }
  console.log("✅ Portal access enabled (check the OTHER terminal for the 📧 credentials email log).\n");

  // 3. Self-signup case A: matches existing patient1 by CNIC -> should CONFLICT since portal already enabled
  console.log("3️⃣  Testing self-signup with an ALREADY-enabled patient's CNIC (should conflict)...");
  const signupConflict = await api("/api/public/patient-signup", {
    method: "POST",
    body: { hospitalId: hosp.data.hospital._id, name: "Ali Raza", cnic, email: `dupe+${stamp}@example.com`, password: "password123" },
  });
  if (signupConflict.status !== 409) { console.error("❌ Expected 409 conflict, got:", signupConflict.status, signupConflict.data); process.exit(1); }
  console.log("✅ Correctly rejected - that patient already has an account.\n");

  // 4. Self-signup case B: a DIFFERENT patient, no matching record exists -> creates a new Patient + User
  console.log("4️⃣  Testing self-signup for a brand new person (no matching record)...");
  const newCnic = `61101-${stamp}`.slice(0, 15);
  const signupNew = await api("/api/public/patient-signup", {
    method: "POST",
    body: {
      hospitalId: hosp.data.hospital._id,
      name: "Sana Khan",
      cnic: newCnic,
      phone: "03009998888",
      email: `sana.khan+${stamp}@example.com`,
      password: "password123",
    },
  });
  if (!signupNew.ok) { console.error("❌ New self-signup failed:", signupNew.data); process.exit(1); }
  console.log("✅ New patient self-registered and got a token immediately.\n");

  // 5. Logged-in self-registered patient can see their OWN record via /api/patients/me
  console.log("5️⃣  Confirming the new patient can see their own record...");
  const myRecord = await api("/api/patients/me", { token: signupNew.data.token });
  if (myRecord.data.name !== "Sana Khan") { console.error("❌ Wrong patient record returned:", myRecord.data); process.exit(1); }
  console.log("✅ Patient sees their own record correctly:", myRecord.data.mrn, "\n");

  // 6. Patient books their own appointment
  console.log("6️⃣  Patient self-books an appointment...");
  const myBooking = await api("/api/appointments/book-mine", {
    method: "POST",
    token: signupNew.data.token,
    body: { doctorId: doctor.data.id, date: today, reason: "Checkup" },
  });
  if (!myBooking.ok) { console.error("❌ Self-booking failed:", myBooking.data); process.exit(1); }
  console.log("✅ Patient booked their own appointment, token #", myBooking.data.tokenNumber, "\n");

  // 7. Patient sees it in "my appointments"
  const myAppts = await api("/api/appointments/mine", { token: signupNew.data.token });
  if (myAppts.data.length !== 1) { console.error("❌ Expected 1 appointment, got:", myAppts.data); process.exit(1); }
  console.log("✅ Appointment correctly appears in the patient's own list.\n");

  // 8. CRITICAL: this patient must NOT be able to see patient1's data via the staff-only endpoints
  console.log("8️⃣  🔒 Confirming the patient role is blocked from staff-only patient endpoints...");
  const staffEndpointAttempt = await api("/api/patients", { token: signupNew.data.token });
  if (staffEndpointAttempt.status !== 403) {
    console.error("❌ SECURITY ISSUE: patient role could access the staff patient list! Status:", staffEndpointAttempt.status);
    process.exit(1);
  }
  console.log("✅ Correctly blocked (403) from staff-only endpoints.\n");

  console.log("🎉 ALL PATIENT PORTAL TESTS PASSED — CNIC dedup, staff-enabled access, self-signup (both match and no-match), and self-service data access all verified.");
}

main().catch((err) => {
  console.error("💥 Test script crashed:", err);
  process.exit(1);
});