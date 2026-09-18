/**
 * Seeds realistic demo data into YOUR EXISTING hospital (via the live API,
 * not direct DB writes) so the UI has real content to test against.
 *
 * Usage: node seed-demo-data.js <hospitalAdminEmail> <hospitalAdminPassword>
 * Example: node seed-demo-data.js admin@gmail.com yourpassword123
 *
 * Safe to re-run - registering the same CNIC twice will just fail that
 * one insert (409) and the script skips to the next item rather than
 * crashing, so partial re-runs won't duplicate everything.
 */
require("dotenv").config();
const BASE_URL = `http://localhost:${process.env.PORT || 5000}`;

const adminEmail = process.argv[2];
const adminPassword = process.argv[3];

if (!adminEmail || !adminPassword) {
  console.error("Usage: node seed-demo-data.js <hospitalAdminEmail> <hospitalAdminPassword>");
  process.exit(1);
}

async function api(path, { method = "GET", token, body } = {}) {
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json();
  return { ok: res.ok, status: res.status, data };
}

function daysFromNow(n) {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

async function main() {
  console.log("🌱 Seeding realistic demo data into", BASE_URL, "\n");

  const login = await api("/api/auth/login", { method: "POST", body: { email: adminEmail, password: adminPassword } });
  if (!login.ok) {
    console.error("❌ Login failed:", login.data.message);
    process.exit(1);
  }
  const token = login.data.token;
  console.log(`✅ Logged in as ${login.data.user.name} (${login.data.user.hospitalName})\n`);

  // ---------------- STAFF ----------------
  console.log("👩‍⚕️ Creating staff...");
  const staffToCreate = [
    { name: "Dr. Kamran Ahmed", email: "kamran.ahmed.cardio@example.com", role: "doctor", department: "Cardiology" },
    { name: "Dr. Sana Yousuf", email: "sana.yousuf.med@example.com", role: "doctor", department: "General Medicine" },
    { name: "Dr. Imran Qureshi", email: "imran.qureshi.peds@example.com", role: "doctor", department: "Pediatrics" },
    { name: "Rabia Aslam", email: "rabia.aslam.nurse@example.com", role: "nurse", department: "General Ward" },
    { name: "Farhan Ali", email: "farhan.ali.lab@example.com", role: "lab_technician", department: "Pathology" },
    { name: "Sadia Khan", email: "sadia.khan.pharm@example.com", role: "pharmacist", department: "Pharmacy" },
    { name: "Tahir Mehmood", email: "tahir.mehmood.accts@example.com", role: "accountant", department: "Finance" },
  ];
  const staff = {};
  for (const s of staffToCreate) {
    const res = await api("/api/hospital-admin/staff", { method: "POST", token, body: { ...s, password: "password123" } });
    if (res.ok) {
      staff[s.name] = res.data;
      console.log(`   ✓ ${s.name} (${s.role})`);
    } else {
      console.log(`   – skipped ${s.name} (${res.data.message})`);
    }
  }
  const drKamran = staff["Dr. Kamran Ahmed"];
  const drSana = staff["Dr. Sana Yousuf"];
  console.log("");

  // ---------------- PATIENTS ----------------
  console.log("🧑‍🤝‍🧑 Registering patients...");
  const patientsToCreate = [
    {
      name: "Ahmed Hassan", gender: "male", dob: "1985-03-15", phone: "0300-1234567",
      cnic: "42101-1234567-1", email: "ahmed.hassan82@example.com",
      address: "House 12, Street 5, DHA Phase 2, Karachi",
      allergies: ["Penicillin"], chronicConditions: ["Hypertension"],
    },
    {
      name: "Fatima Sheikh", gender: "female", dob: "1992-07-22", phone: "0321-9876543",
      cnic: "35202-7654321-2", email: "fatima.sheikh@example.com",
      address: "Flat 4B, Gulshan-e-Iqbal Block 6, Karachi",
      allergies: [], chronicConditions: ["Type 2 Diabetes"],
    },
    {
      name: "Muhammad Bilal", gender: "male", dob: "1978-11-30", phone: "0333-4567890",
      cnic: "61101-9988776-5", address: "House 45, Model Town, Lahore",
      allergies: ["Sulfa drugs", "Aspirin"], chronicConditions: [],
    },
    {
      name: "Ayesha Malik", gender: "female", dob: "2001-02-14", phone: "0345-1122334",
      email: "ayesha.malik01@example.com", address: "Street 9, F-10/2, Islamabad",
      allergies: [], chronicConditions: [],
    },
    {
      name: "Usman Tariq", gender: "male", dob: "1965-05-05", phone: "0300-9988776",
      cnic: "42201-1122334-9", address: "House 78, Nazimabad No 3, Karachi",
      allergies: ["Latex"], chronicConditions: ["Asthma", "Hypertension"],
    },
    {
      name: "Zainab Raza", gender: "female", dob: "1995-09-18", phone: "0312-5544332",
      address: "House 21, Johar Town, Lahore", allergies: [], chronicConditions: [],
    },
  ];
  const patients = {};
  for (const p of patientsToCreate) {
    const res = await api("/api/patients", { method: "POST", token, body: p });
    if (res.ok) {
      patients[p.name] = res.data;
      console.log(`   ✓ ${p.name} → ${res.data.mrn}`);
    } else {
      console.log(`   – skipped ${p.name} (${res.data.message})`);
    }
  }
  console.log("");

  // ---------------- APPOINTMENTS ----------------
  if (drKamran && patients["Ahmed Hassan"]) {
    console.log("📅 Booking appointments...");
    const appts = [
      { patientId: patients["Ahmed Hassan"]._id, doctorId: drKamran.id, date: daysFromNow(0), reason: "Follow-up: blood pressure check" },
      { patientId: patients["Fatima Sheikh"]?._id, doctorId: drSana?.id, date: daysFromNow(0), reason: "Diabetes follow-up" },
      { patientId: patients["Ayesha Malik"]?._id, doctorId: drSana?.id, date: daysFromNow(1), reason: "General checkup" },
      { patientId: patients["Usman Tariq"]?._id, doctorId: drSana?.id, date: daysFromNow(-2), reason: "Persistent cough" },
    ].filter((a) => a.patientId && a.doctorId);

    for (const a of appts) {
      const res = await api("/api/appointments", { method: "POST", token, body: a });
      if (res.ok) console.log(`   ✓ Token #${res.data.tokenNumber} on ${a.date}`);
    }
    console.log("");
  }

  // ---------------- CONSULTATIONS ----------------
  if (drKamran && patients["Ahmed Hassan"]) {
    console.log("🩺 Recording consultations...");
    const drKamranLogin = await api("/api/auth/login", { method: "POST", body: { email: drKamran.email, password: "password123" } });
    const drSanaLogin = await api("/api/auth/login", { method: "POST", body: { email: drSana.email, password: "password123" } });

    await api("/api/consultations", {
      method: "POST",
      token: drKamranLogin.data.token,
      body: {
        patientId: patients["Ahmed Hassan"]._id,
        vitals: { bloodPressure: "145/95", temperature: "98.4 F", pulse: "82 bpm", weight: "78 kg" },
        symptoms: "Occasional headaches, mild dizziness in the mornings",
        diagnosis: "Essential Hypertension",
        notes: "Advised to reduce salt intake and monitor BP daily at home.",
        prescriptions: [
          { medicineName: "Amlodipine 5mg", dosage: "5mg", frequency: "Once daily", duration: "30 days", instructions: "Take in the morning" },
        ],
        followUpDate: daysFromNow(30),
      },
    });
    console.log("   ✓ Ahmed Hassan - Essential Hypertension (Dr. Kamran)");

    if (patients["Fatima Sheikh"]) {
      await api("/api/consultations", {
        method: "POST",
        token: drSanaLogin.data.token,
        body: {
          patientId: patients["Fatima Sheikh"]._id,
          vitals: { bloodPressure: "130/85", pulse: "76 bpm", weight: "65 kg" },
          symptoms: "Fatigue, increased thirst",
          diagnosis: "Type 2 Diabetes Mellitus - Follow-up",
          notes: "HbA1c trending down. Continue current regimen.",
          prescriptions: [
            { medicineName: "Metformin 500mg", dosage: "500mg", frequency: "Twice daily", duration: "60 days", instructions: "After meals" },
          ],
        },
      });
      console.log("   ✓ Fatima Sheikh - Type 2 Diabetes follow-up (Dr. Sana)");
    }

    if (patients["Usman Tariq"]) {
      await api("/api/consultations", {
        method: "POST",
        token: drSanaLogin.data.token,
        body: {
          patientId: patients["Usman Tariq"]._id,
          vitals: { temperature: "100.2 F", pulse: "88 bpm", bloodPressure: "138/90" },
          symptoms: "Cough with phlegm for 3 days, mild fever",
          diagnosis: "Acute Bronchitis",
          prescriptions: [
            { medicineName: "Augmentin 625mg", dosage: "625mg", frequency: "3 times daily", duration: "7 days" },
            { medicineName: "Brufen 400mg", dosage: "400mg", frequency: "As needed for fever", duration: "5 days" },
          ],
        },
      });
      console.log("   ✓ Usman Tariq - Acute Bronchitis (Dr. Sana)");
    }
    console.log("");
  }

  // ---------------- WARDS & ADMISSION ----------------
  console.log("🛏️  Setting up wards and an admission...");
  const wardRes = await api("/api/wards", { method: "POST", token, body: { name: "General Ward", department: "Internal Medicine" } });
  if (wardRes.ok) {
    const bedsRes = await api(`/api/wards/${wardRes.data._id}/beds`, {
      method: "POST", token, body: { bedNumbers: ["101", "102", "103", "104"] },
    });
    if (bedsRes.ok && patients["Muhammad Bilal"] && drSana) {
      await api("/api/admissions", {
        method: "POST", token,
        body: {
          patientId: patients["Muhammad Bilal"]._id,
          wardId: wardRes.data._id,
          bedId: bedsRes.data[0]._id,
          doctorId: drSana.id,
          reason: "Observation for chest pain",
        },
      });
      console.log(`   ✓ ${wardRes.data.name} with 4 beds, Muhammad Bilal admitted to bed 101`);
    }
  } else {
    console.log("   – skipped (ward may already exist)");
  }
  console.log("");

  // ---------------- LAB ----------------
  console.log("🧪 Setting up lab tests and orders...");
  const tests = [
    { name: "Complete Blood Count", department: "Hematology", price: 800 },
    { name: "Blood Sugar Fasting", department: "Chemistry", price: 300 },
    { name: "Lipid Profile", department: "Chemistry", price: 1500 },
    { name: "Liver Function Test", department: "Chemistry", price: 1200 },
  ];
  const testIds = {};
  for (const t of tests) {
    const res = await api("/api/lab/tests", { method: "POST", token, body: t });
    if (res.ok) testIds[t.name] = res.data._id;
  }
  if (testIds["Blood Sugar Fasting"] && patients["Fatima Sheikh"] && drSana) {
    const order = await api("/api/lab/orders", {
      method: "POST", token,
      body: { patientId: patients["Fatima Sheikh"]._id, testIds: [testIds["Blood Sugar Fasting"]] },
    });
    if (order.ok) {
      await api(`/api/lab/orders/${order.data._id}/result`, {
        method: "PATCH", token, body: { resultNotes: "Fasting glucose: 126 mg/dL - slightly elevated, consistent with known diagnosis." },
      });
      console.log("   ✓ Fatima Sheikh - Blood Sugar Fasting (completed)");
    }
  }
  if (testIds["Lipid Profile"] && patients["Ahmed Hassan"] && drKamran) {
    const order = await api("/api/lab/orders", {
      method: "POST", token,
      body: { patientId: patients["Ahmed Hassan"]._id, testIds: [testIds["Lipid Profile"]] },
    });
    if (order.ok) {
      await api(`/api/lab/orders/${order.data._id}/status`, { method: "PATCH", token, body: { status: "in_progress" } });
      console.log("   ✓ Ahmed Hassan - Lipid Profile (in progress)");
    }
  }
  console.log("");

  // ---------------- PHARMACY ----------------
  console.log("💊 Stocking pharmacy...");
  const medicines = [
    { name: "Panadol 500mg", category: "Analgesic", unit: "tablet", stock: 200, price: 5, lowStockThreshold: 50 },
    { name: "Augmentin 625mg", category: "Antibiotic", unit: "tablet", stock: 45, price: 35, lowStockThreshold: 50 },
    { name: "Amlodipine 5mg", category: "Antihypertensive", unit: "tablet", stock: 150, price: 8, lowStockThreshold: 30 },
    { name: "Metformin 500mg", category: "Antidiabetic", unit: "tablet", stock: 20, price: 6, lowStockThreshold: 30 },
    { name: "Brufen 400mg", category: "Analgesic", unit: "tablet", stock: 300, price: 4, lowStockThreshold: 60 },
  ];
  const medIds = {};
  for (const m of medicines) {
    const res = await api("/api/pharmacy/medicines", { method: "POST", token, body: m });
    if (res.ok) {
      medIds[m.name] = res.data._id;
      console.log(`   ✓ ${m.name} (stock: ${m.stock})`);
    }
  }
  if (medIds["Augmentin 625mg"] && patients["Usman Tariq"]) {
    await api("/api/pharmacy/dispense", {
      method: "POST", token,
      body: { patientId: patients["Usman Tariq"]._id, items: [{ medicineId: medIds["Augmentin 625mg"], quantity: 21 }] },
    });
    console.log("   ✓ Dispensed Augmentin to Usman Tariq");
  }
  console.log("");

  // ---------------- BILLING ----------------
  console.log("💰 Creating bills...");
  if (patients["Ahmed Hassan"]) {
    await api("/api/billing", {
      method: "POST", token,
      body: {
        patientId: patients["Ahmed Hassan"]._id,
        items: [
          { description: "OPD Consultation Fee", category: "OPD", amount: 1500 },
          { description: "Lipid Profile Test", category: "Lab", amount: 1500 },
        ],
        amountPaid: 3000, paymentMethod: "cash",
      },
    });
    console.log("   ✓ Ahmed Hassan - Rs. 3,000 (paid in full)");
  }
  if (patients["Fatima Sheikh"]) {
    await api("/api/billing", {
      method: "POST", token,
      body: {
        patientId: patients["Fatima Sheikh"]._id,
        items: [
          { description: "OPD Consultation Fee", category: "OPD", amount: 1000 },
          { description: "Blood Sugar Fasting Test", category: "Lab", amount: 300 },
        ],
        amountPaid: 500, paymentMethod: "card",
      },
    });
    console.log("   ✓ Fatima Sheikh - Rs. 1,300 total, Rs. 500 paid (partial)");
  }
  if (patients["Usman Tariq"]) {
    await api("/api/billing", {
      method: "POST", token,
      body: {
        patientId: patients["Usman Tariq"]._id,
        items: [
          { description: "OPD Consultation Fee", category: "OPD", amount: 1000 },
          { description: "Pharmacy - Augmentin x21", category: "Pharmacy", amount: 735 },
        ],
      },
    });
    console.log("   ✓ Usman Tariq - Rs. 1,735 (unpaid)");
  }

  console.log("\n🎉 Seeding complete! Refresh your browser and every module should now have real data to look at.");
}

main().catch((err) => {
  console.error("💥 Seed script crashed:", err);
  process.exit(1);
});