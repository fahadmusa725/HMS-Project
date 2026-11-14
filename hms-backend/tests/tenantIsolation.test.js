const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const mongoose = require("mongoose");

const { startTestServer, stopTestServer, resetDatabase } = require("./helpers/harness");
const { createTenant, absentId } = require("./helpers/factories");

const Appointment = require("../src/models/Appointment");
const Consultation = require("../src/models/Consultation");
const LabTest = require("../src/models/LabTest");
const LabOrder = require("../src/models/LabOrder");
const Medicine = require("../src/models/Medicine");
const Bill = require("../src/models/Bill");
const Admission = require("../src/models/Admission");
const NurseNote = require("../src/models/NurseNote");
const PreCheck = require("../src/models/PreCheck");
const AuditLog = require("../src/models/AuditLog");
const DoctorSchedule = require("../src/models/DoctorSchedule");
const { hospitalNow } = require("../src/utils/scheduleSlots");
const { runWithTenantContext } = require("../src/utils/tenantContext");

// Every collection that belongs to a hospital. A model missing from this list is a
// deliberate platform-level model (Hospital itself) or the Counter, which carries
// hospitalId manually.
const TENANT_MODELS = [
  "Admission",
  "Appointment",
  "AuditLog",
  "Bed",
  "Bill",
  "Consultation",
  "DoctorSchedule",
  "LabOrder",
  "LabTest",
  "Medicine",
  "NurseNote",
  "Patient",
  "PharmacySale",
  "PreCheck",
  "User",
  "Ward",
];

let request;
let a;
let b;
let fixtures;

/** One document of every kind per hospital, with ids recorded for the assertions. */
async function seedTenantResources(tenant, marker) {
  const today = hospitalNow().date;

  const appointment = await Appointment.create({
    hospitalId: tenant.hospital._id,
    patientId: tenant.patient._id,
    doctorId: tenant.users.doctor._id,
    date: today,
    tokenNumber: 1,
    status: "checked_in",
    checkedInAt: new Date(),
  });

  const consultation = await Consultation.create({
    hospitalId: tenant.hospital._id,
    patientId: tenant.patient._id,
    doctorId: tenant.users.doctor._id,
    diagnosis: `diagnosis-${marker}`,
  });

  const labTest = await LabTest.create({ hospitalId: tenant.hospital._id, name: `CBC ${marker}`, price: 1200 });
  const labOrder = await LabOrder.create({
    hospitalId: tenant.hospital._id,
    patientId: tenant.patient._id,
    doctorId: tenant.users.doctor._id,
    tests: [{ testId: labTest._id, testName: labTest.name, price: labTest.price }],
  });

  const medicine = await Medicine.create({
    hospitalId: tenant.hospital._id,
    name: `Panadol ${marker}`,
    price: 50,
    stock: 100,
  });

  const bill = await Bill.create({
    hospitalId: tenant.hospital._id,
    patientId: tenant.patient._id,
    items: [{ description: `Fee ${marker}`, category: "OPD", amount: 2000 }],
    totalAmount: 2000,
  });

  const admission = await Admission.create({
    hospitalId: tenant.hospital._id,
    patientId: tenant.patient._id,
    wardId: tenant.ward._id,
    bedId: tenant.bed._id,
    doctorId: tenant.users.doctor._id,
  });

  const nurseNote = await NurseNote.create({
    hospitalId: tenant.hospital._id,
    admissionId: admission._id,
    patientId: tenant.patient._id,
    nurseId: tenant.users.nurse._id,
    note: `note-${marker}`,
  });

  const preCheck = await PreCheck.create({
    hospitalId: tenant.hospital._id,
    appointmentId: appointment._id,
    patientId: tenant.patient._id,
    doctorId: tenant.users.doctor._id,
    symptoms: `symptoms-${marker}`,
    submittedAt: new Date(),
  });

  const auditLog = await AuditLog.create({
    hospitalId: tenant.hospital._id,
    userId: tenant.users.doctor._id,
    userName: `Doctor ${marker}`,
    userRole: "doctor",
    method: "GET",
    path: `/api/patients/${tenant.patient._id}`,
    statusCode: 200,
    action: "Viewed a patient record",
    resourceId: tenant.patient._id,
    patientId: tenant.patient._id,
  });

  const schedule = await DoctorSchedule.create({
    hospitalId: tenant.hospital._id,
    doctorId: tenant.users.doctor._id,
    consultationFee: 2000,
    weeklyAvailability: [{ dayOfWeek: 1, startTime: "09:00", endTime: "13:00" }],
  });

  return { appointment, consultation, labTest, labOrder, medicine, bill, admission, nurseNote, preCheck, auditLog, schedule };
}

before(async () => {
  request = await startTestServer();
  await resetDatabase();

  a = await createTenant({ name: "Alpha Hospital" });
  b = await createTenant({ name: "Bravo Hospital" });
  fixtures = {
    a: await seedTenantResources(a, "alpha"),
    b: await seedTenantResources(b, "bravo"),
  };
});

after(async () => {
  await stopTestServer();
});

test("every tenant-owned model carries a hospitalId path", () => {
  for (const name of TENANT_MODELS) {
    const model = mongoose.models[name];
    assert.ok(model, `${name} model is registered`);
    assert.ok(model.schema.path("hospitalId"), `${name} is tenant scoped`);
  }
});

test("tenant plugin scopes reads, refuses unscoped queries and guards aggregates", async () => {
  const probeSchema = new mongoose.Schema({ label: String });
  probeSchema.plugin(require("../src/utils/tenantPlugin"));
  const Probe = mongoose.models.TenantProbe || mongoose.model("TenantProbe", probeSchema);

  await Probe.collection.deleteMany({});
  await Probe.create({ hospitalId: a.hospital._id, label: "alpha" });
  await Probe.create({ hospitalId: b.hospital._id, label: "bravo" });

  const scoped = await runWithTenantContext({ hospitalId: a.hospital._id }, async () => ({
    all: await Probe.find({}).lean(),
    one: await Probe.findOne({ label: "bravo" }).lean(),
    count: await Probe.countDocuments({}),
  }));

  assert.equal(scoped.all.length, 1);
  assert.equal(scoped.all[0].label, "alpha");
  assert.equal(scoped.one, null, "findOne cannot see the other hospital's row");
  assert.equal(scoped.count, 1);

  await assert.rejects(
    () => Probe.find({}).lean(),
    /Tenant context missing/,
    "an unscoped read fails loudly instead of leaking"
  );

  await assert.rejects(
    () =>
      runWithTenantContext({ hospitalId: a.hospital._id }, async () =>
        Probe.aggregate([{ $match: {} }]).exec()
      ),
    /must start with \{ \$match: \{ hospitalId \} \}/
  );

  const both = await Probe.find({}).setOptions({ skipTenantScope: true }).lean();
  assert.equal(both.length, 2, "the explicit escape hatch still works");

  const unscopedUpdate = await Probe.updateMany({}, { $set: { label: "touched" } }).setOptions({
    skipTenantScope: true,
  });
  assert.equal(unscopedUpdate.modifiedCount, 2);
});

test("list endpoints never return the other hospital's rows", async () => {
  const bIds = [
    b.hospital._id,
    b.patient._id,
    b.patient.mrn,
    b.users.doctor._id,
    b.users.patient._id,
    fixtures.b.appointment._id,
    fixtures.b.consultation._id,
    fixtures.b.labOrder._id,
    fixtures.b.medicine._id,
    fixtures.b.bill._id,
    fixtures.b.admission._id,
    fixtures.b.nurseNote._id,
    fixtures.b.preCheck._id,
    fixtures.b.auditLog._id,
    fixtures.b.schedule._id,
  ].map(String);

  const paths = [
    "/api/patients",
    "/api/appointments/queue",
    `/api/appointments/patient/${a.patient._id}`,
    `/api/consultations/patient/${a.patient._id}`,
    "/api/lab/tests",
    "/api/lab/orders",
    "/api/wards",
    "/api/wards/beds/all",
    "/api/admissions",
    "/api/pharmacy/medicines",
    "/api/billing",
    "/api/audit-logs",
    `/api/doctor-schedules/${a.users.doctor._id}`,
    `/api/pre-checks/${fixtures.a.appointment._id}`,
    "/api/hospital-admin/staff",
    "/api/reports/overview",
  ];

  for (const path of paths) {
    const response = await request.get(path).set("Authorization", a.tokens.hospital_admin);
    assert.equal(response.status, 200, `${path} answers 200`);
    const body = JSON.stringify(response.body);
    for (const id of bIds) {
      assert.ok(!body.includes(id), `${path} leaks ${id}`);
    }
  }
});

test("reading a document owned by another hospital returns 404, not the document", async () => {
  const cases = [
    [`/api/patients/${b.patient._id}`, "GET"],
    [`/api/consultations/${fixtures.b.consultation._id}`, "GET"],
    [`/api/admissions/${fixtures.b.admission._id}`, "GET"],
    [`/api/pre-checks/${fixtures.b.appointment._id}`, "GET"],
    [`/api/appointments/${fixtures.b.appointment._id}/slip-pdf`, "GET"],
  ];

  for (const [path, method] of cases) {
    const response = await request[method.toLowerCase()](path).set("Authorization", a.tokens.hospital_admin);
    assert.equal(response.status, 404, `${path} is invisible to the other hospital`);
  }
});

test("patient-scoped sub-resources are empty for a foreign patient id", async () => {
  for (const path of [
    `/api/lab/orders/patient/${b.patient._id}`,
    `/api/billing/patient/${b.patient._id}`,
    `/api/consultations/patient/${b.patient._id}`,
    `/api/appointments/patient/${b.patient._id}`,
  ]) {
    const response = await request.get(path).set("Authorization", a.tokens.hospital_admin);
    assert.equal(response.status, 200, `${path} answers 200`);
    assert.ok(Array.isArray(response.body));
    assert.equal(response.body.length, 0, `${path} returns nothing`);
  }
});

test("a hospital admin cannot write to another hospital's patient", async () => {
  const response = await request
    .patch(`/api/patients/${b.patient._id}`)
    .set("Authorization", a.tokens.hospital_admin)
    .send({ phone: "03000000000" });

  assert.equal(response.status, 404);
  const unchanged = await require("../src/models/Patient").findById(b.patient._id).setOptions({ skipTenantScope: true });
  assert.notEqual(unchanged.phone, "03000000000");
});

test("absent ids never probe into another tenant or crash the route", async () => {
  const response = await request
    .get(`/api/patients/${absentId()}`)
    .set("Authorization", a.tokens.hospital_admin);
  assert.equal(response.status, 404);
});
