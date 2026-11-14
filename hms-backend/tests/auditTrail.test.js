const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");

const { startTestServer, stopTestServer, resetDatabase } = require("./helpers/harness");
const { createTenant, createPatient, waitFor } = require("./helpers/factories");
const { hospitalNow } = require("../src/utils/scheduleSlots");
const Appointment = require("../src/models/Appointment");
const Consultation = require("../src/models/Consultation");
const PreCheck = require("../src/models/PreCheck");
const AuditLog = require("../src/models/AuditLog");
const User = require("../src/models/User");

let request;
let tenant;
let patient;
let appointment;

function localDate(date = new Date()) {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

before(async () => {
  request = await startTestServer();
  await resetDatabase();
  tenant = await createTenant({ name: "Audit Hospital" });
  patient = await createPatient(tenant.hospital._id);
  appointment = await Appointment.create({
    hospitalId: tenant.hospital._id,
    patientId: patient._id,
    doctorId: tenant.users.doctor._id,
    date: hospitalNow().date,
    tokenNumber: 1,
    status: "checked_in",
    checkedInAt: new Date(),
  });
});

after(async () => {
  await stopTestServer();
});

test("a chart read is recorded against the patient with actor details", async () => {
  const read = await request
    .get(`/api/patients/${patient._id}?tab=labs&search=Ayesha`)
    .set("Authorization", tenant.tokens.doctor);
  assert.equal(read.status, 200);

  const entry = await waitFor(() =>
    AuditLog.findOne({
      hospitalId: tenant.hospital._id,
      action: "Viewed a patient record",
      resourceId: patient._id,
    })
      .setOptions({ skipTenantScope: true })
      .lean()
  );

  assert.ok(entry, "the read produced an audit row");
  assert.equal(String(entry.patientId), String(patient._id));
  assert.equal(entry.userRole, "doctor");
  assert.ok(entry.userName, "actor name is snapshotted");
  assert.equal(entry.path, `/api/patients/${patient._id}`);
  assert.ok(!entry.path.includes("?"), "query strings are never stored");
  assert.ok(!entry.path.includes("search"), "search terms are never stored");
});

test("EMR, consultation, lab and pre-check reads carry the patient id", async () => {
  const consultation = await Consultation.create({
    hospitalId: tenant.hospital._id,
    patientId: patient._id,
    doctorId: tenant.users.doctor._id,
    diagnosis: "Seasonal flu",
  });
  await PreCheck.create({
    hospitalId: tenant.hospital._id,
    appointmentId: appointment._id,
    patientId: patient._id,
    doctorId: tenant.users.doctor._id,
    symptoms: "Fever and body ache",
    submittedAt: new Date(),
  });

  const emr = await request
    .get(`/api/consultations/patient/${patient._id}`)
    .set("Authorization", tenant.tokens.doctor);
  assert.equal(emr.status, 200);

  const single = await request
    .get(`/api/consultations/${consultation._id}`)
    .set("Authorization", tenant.tokens.doctor);
  assert.equal(single.status, 200);

  const labs = await request
    .get(`/api/lab/orders/patient/${patient._id}`)
    .set("Authorization", tenant.tokens.doctor);
  assert.equal(labs.status, 200);

  const preCheck = await request
    .get(`/api/pre-checks/${appointment._id}`)
    .set("Authorization", tenant.tokens.nurse);
  assert.equal(preCheck.status, 200);

  const expectations = [
    ["Viewed a patient's medical history", patient._id],
    ["Viewed a consultation", patient._id],
    ["Viewed a patient's lab orders", patient._id],
    ["Viewed a pre-check", patient._id],
  ];

  for (const [action, patientId] of expectations) {
    const entry = await waitFor(() =>
      AuditLog.findOne({ hospitalId: tenant.hospital._id, action, patientId })
        .setOptions({ skipTenantScope: true })
        .lean()
    );
    assert.ok(entry, `missing audit entry for "${action}"`);
  }
});

test("a priority change is written once, not twice", async () => {
  const response = await request
    .patch(`/api/appointments/${appointment._id}/priority`)
    .set("Authorization", tenant.tokens.receptionist)
    .send({ priority: "senior", priorityReason: "Elderly patient" });
  assert.equal(response.status, 200);

  const entry = await waitFor(() =>
    AuditLog.findOne({
      hospitalId: tenant.hospital._id,
      action: "Changed appointment queue priority",
      resourceId: appointment._id,
    })
      .setOptions({ skipTenantScope: true })
      .lean()
  );
  assert.ok(entry);

  const duplicates = await AuditLog.countDocuments({
    hospitalId: tenant.hospital._id,
    path: `/api/appointments/${appointment._id}/priority`,
  }).setOptions({ skipTenantScope: true });
  assert.equal(duplicates, 1, "the generic middleware entry is suppressed");
});

test("the audit viewer filters by user, action and date range", async () => {
  const today = localDate();

  const byAction = await request
    .get("/api/audit-logs")
    .query({ action: "Viewed a patient record" })
    .set("Authorization", tenant.tokens.hospital_admin);
  assert.equal(byAction.status, 200);
  assert.ok(byAction.body.logs.length > 0);
  assert.ok(byAction.body.logs.every((log) => log.action === "Viewed a patient record"));

  const byUser = await request
    .get("/api/audit-logs")
    .query({ userId: String(tenant.users.doctor._id) })
    .set("Authorization", tenant.tokens.hospital_admin);
  assert.equal(byUser.status, 200);
  assert.ok(byUser.body.logs.length > 0);
  assert.ok(byUser.body.logs.every((log) => log.user.role === "doctor"));

  const todayRange = await request
    .get("/api/audit-logs")
    .query({ from: today, to: today })
    .set("Authorization", tenant.tokens.hospital_admin);
  assert.equal(todayRange.status, 200);
  assert.ok(todayRange.body.total > 0);

  const tomorrow = localDate(new Date(Date.now() + 24 * 60 * 60 * 1000));
  const future = await request
    .get("/api/audit-logs")
    .query({ from: tomorrow })
    .set("Authorization", tenant.tokens.hospital_admin);
  assert.equal(future.status, 200);
  assert.equal(future.body.total, 0);

  const invalidUser = await request
    .get("/api/audit-logs")
    .query({ userId: "not-an-id" })
    .set("Authorization", tenant.tokens.hospital_admin);
  assert.equal(invalidUser.status, 400);

  const capped = await request
    .get("/api/audit-logs")
    .query({ limit: 5000 })
    .set("Authorization", tenant.tokens.hospital_admin);
  assert.equal(capped.status, 200);
  assert.equal(capped.body.limit, 100);
});

test("the filter list exposes readable action labels", async () => {
  const response = await request.get("/api/audit-logs/actions").set("Authorization", tenant.tokens.hospital_admin);
  assert.equal(response.status, 200);
  assert.ok(Array.isArray(response.body));
  assert.ok(response.body.includes("Viewed a patient record"));
  assert.ok(response.body.includes("Registered a patient"));
});

test("entries keep the actor snapshot after a rename", async () => {
  await User.updateOne(
    { _id: tenant.users.doctor._id },
    { $set: { name: "Dr. Renamed" } },
    { skipTenantScope: true }
  );

  const response = await request
    .get("/api/audit-logs")
    .query({ action: "Viewed a patient record" })
    .set("Authorization", tenant.tokens.hospital_admin);
  assert.equal(response.status, 200);

  const log = response.body.logs[0];
  assert.ok(log);
  assert.notEqual(log.user.name, "Dr. Renamed", "the stored snapshot wins over the live name");
});
