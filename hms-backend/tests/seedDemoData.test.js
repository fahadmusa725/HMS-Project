const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { spawn } = require("node:child_process");
const path = require("node:path");

const { startTestServer, stopTestServer } = require("./helpers/harness");
const { createTenant } = require("./helpers/factories");
const { hospitalNow } = require("../src/utils/scheduleSlots");
const { DEMO_HOSPITAL_NAME, DEMO_PASSWORD } = require("../src/scripts/seedDemoData");
const Hospital = require("../src/models/Hospital");
const User = require("../src/models/User");
const Patient = require("../src/models/Patient");
const Appointment = require("../src/models/Appointment");
const PreCheck = require("../src/models/PreCheck");
const AuditLog = require("../src/models/AuditLog");
const { Counter } = require("../src/models/Counter");

const SCRIPT = path.join(__dirname, "..", "src", "scripts", "seedDemoData.js");
const SCOPE = { skipTenantScope: true };

let request;
let foreign;
let firstRunCounts;
let demoHospitalId;

/** Runs the real CLI entry point against the in-memory database. */
function runSeed() {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [SCRIPT], {
      cwd: path.join(__dirname, ".."),
      env: { ...process.env },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let output = "";
    child.stdout.on("data", (chunk) => {
      output += chunk;
    });
    child.stderr.on("data", (chunk) => {
      output += chunk;
    });
    child.on("close", (code) => resolve({ code, output }));
  });
}

async function count(model, filter = {}) {
  return model.countDocuments({ hospitalId: demoHospitalId, ...filter }).setOptions(SCOPE);
}

before(async () => {
  request = await startTestServer();
  // A second hospital already exists, so the run has something it must not touch.
  foreign = await createTenant({ name: "Existing Hospital" });
  demoHospitalId = null;
});

after(async () => {
  await stopTestServer();
});

test("seed script builds a complete demo tenant and is idempotent", async () => {
  const first = await runSeed();
  assert.equal(first.code, 0, `seed failed:\n${first.output}`);

  const hospital = await Hospital.findOne({ name: DEMO_HOSPITAL_NAME });
  assert.ok(hospital, "demo hospital was not created");
  assert.equal(hospital.status, "active");
  demoHospitalId = hospital._id;

  const today = hospitalNow().date;
  firstRunCounts = {
    patients: await count(Patient),
    todayAppointments: await count(Appointment, { date: today }),
    allAppointments: await count(Appointment),
    preChecks: await count(PreCheck),
    auditLogs: await count(AuditLog),
  };
  assert.equal(firstRunCounts.patients, 250);
  assert.ok(firstRunCounts.allAppointments > 800);
  assert.ok(firstRunCounts.auditLogs > 300);
  assert.ok(firstRunCounts.preChecks >= 3);

  // The seeded password hash must actually authenticate through the real login route.
  const login = await request
    .post("/api/auth/login")
    .send({ email: "admin@careflowdemo.pk", password: DEMO_PASSWORD });
  assert.equal(login.status, 200, `login failed: ${JSON.stringify(login.body)}`);
  assert.ok(login.body.token);

  const second = await runSeed();
  assert.equal(second.code, 0, `second run failed:\n${second.output}`);
  assert.equal(await count(Patient), firstRunCounts.patients, "patient count changed between runs");
  assert.equal(
    await count(Appointment, { date: today }),
    firstRunCounts.todayAppointments,
    "today's queue changed between runs"
  );
  assert.equal(await count(PreCheck), firstRunCounts.preChecks, "pre-check count changed between runs");
  assert.equal(await count(AuditLog), firstRunCounts.auditLogs, "audit log count changed between runs");

  // The other hospital is untouched, and its accounts were not hijacked.
  assert.ok(await Patient.countDocuments({ hospitalId: foreign.hospital._id }).setOptions(SCOPE));
  assert.ok(await User.countDocuments({ hospitalId: foreign.hospital._id }).setOptions(SCOPE));
  const foreignOwners = await User.find({ email: foreign.users.doctor.email }).setOptions(SCOPE).lean();
  assert.equal(foreignOwners.length, 1);
  assert.equal(String(foreignOwners[0].hospitalId), String(foreign.hospital._id));
});

test("per-doctor tokens, walk-ins and priorities match the queue rules", async () => {
  const today = hospitalNow().date;
  const rows = await Appointment.find({ hospitalId: demoHospitalId, date: today })
    .select("doctorId tokenNumber priority priorityReason time status checkedInAt")
    .setOptions(SCOPE)
    .lean();
  assert.ok(rows.length > 0, "no appointments seeded for today");

  const byDoctor = new Map();
  rows.forEach((row) => {
    const key = String(row.doctorId);
    if (!byDoctor.has(key)) byDoctor.set(key, []);
    byDoctor.get(key).push(row.tokenNumber);
  });
  byDoctor.forEach((tokens, doctorId) => {
    const sorted = [...tokens].sort((a, b) => a - b);
    assert.deepEqual(sorted, sorted.map((_, index) => index + 1), `tokens for ${doctorId} are not sequential from 1`);
  });

  // One counter per doctor, named after the doctor room and the booking date.
  const counters = await Counter.find({ hospitalId: demoHospitalId, name: /^opd_token_/ }).lean();
  assert.equal(counters.length, byDoctor.size);
  counters.forEach((counter) => assert.match(counter.name, new RegExp(`^opd_token_[a-f0-9]{24}_${today}$`)));

  const walkIns = rows.filter((row) => !row.time);
  assert.ok(walkIns.length >= 3, "walk-in tokens are missing");
  walkIns.forEach((row) => {
    assert.equal(row.status, "checked_in");
    assert.ok(row.checkedInAt, "walk-in without an arrival time");
  });

  const priorities = rows.map((row) => row.priority);
  assert.ok(priorities.includes("emergency"), "no emergency priority seeded");
  assert.ok(priorities.includes("senior"), "no senior priority seeded");
  rows
    .filter((row) => row.priority !== "normal")
    .forEach((row) => assert.ok(row.priorityReason, `${row.priority} priority without a reason`));

  rows
    .filter((row) => row.status === "checked_in" || row.status === "in_consultation")
    .forEach((row) => assert.ok(row.checkedInAt, "queue row without checkedInAt"));
  rows
    .filter((row) => row.status === "no_show")
    .forEach((row) => assert.equal(row.checkedInAt, undefined, "a no-show must not have an arrival time"));
});

test("pre-checks belong to exactly one appointment and cover both submission paths", async () => {
  const demoPatients = await Patient.find({ hospitalId: demoHospitalId }).setOptions(SCOPE).lean();
  const patientIds = new Set(demoPatients.map((patient) => String(patient._id)));
  const preChecks = await PreCheck.find({ hospitalId: demoHospitalId }).setOptions(SCOPE).lean();
  const appointmentIds = new Set(preChecks.map((preCheck) => String(preCheck.appointmentId)));
  assert.equal(appointmentIds.size, preChecks.length, "two pre-checks share one appointment");

  // Assigning a pre-check to a foreign hospital's patient would be a cross-tenant leak.
  preChecks.forEach((preCheck) => assert.ok(patientIds.has(String(preCheck.patientId))));

  const submitted = preChecks.filter((preCheck) => preCheck.submittedAt);
  assert.ok(submitted.length >= 1, "no patient-submitted pre-check seeded");
  submitted.forEach((preCheck) => {
    assert.ok(preCheck.symptoms);
    assert.equal(preCheck.consentAccepted, true);
  });

  const deskVitals = preChecks.filter((preCheck) => preCheck.staffVitalsAt);
  assert.ok(deskVitals.length >= 1, "no desk-recorded pre-check vitals seeded");
  deskVitals.forEach((preCheck) => assert.ok(preCheck.staffVitalsBy));
});

test("seeded audit log is readable, filterable and never stores query strings", async () => {
  const logs = await AuditLog.find({ hospitalId: demoHospitalId }).setOptions(SCOPE).lean();
  assert.ok(logs.length > 0);

  logs.forEach((log) => {
    assert.ok(log.action, `audit entry without a readable action: ${log.path}`);
    assert.ok(log.userName, `audit entry without a user snapshot: ${log.path}`);
    assert.ok(!log.path.includes("?"), `query string stored in the audit path: ${log.path}`);
    if (log.method === "GET") {
      assert.ok(log.patientId, `PHI read without a patient: ${log.path}`);
    }
  });

  const actions = new Set(logs.map((log) => log.action));
  ["Viewed a patient record", "Viewed a pre-check", "Issued a walk-in token", "Changed appointment queue priority"].forEach(
    (label) => assert.ok(actions.has(label), `missing seeded action: ${label}`)
  );

  // resourceId is the profile/resource the action touched, taken from the URL.
  const withId = logs.filter((log) => /[a-f0-9]{24}/i.test(log.path));
  withId.forEach((log) => assert.ok(log.resourceId, `entry without a resourceId: ${log.path}`));
});
