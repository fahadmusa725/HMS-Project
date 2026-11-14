const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");

const { startTestServer, stopTestServer, resetDatabase } = require("./helpers/harness");
const { createTenant, createHospital, createUser, PASSWORD } = require("./helpers/factories");
const { invalidateAccessCache } = require("../src/utils/accountAccess");
const Hospital = require("../src/models/Hospital");
const User = require("../src/models/User");
const generateToken = require("../src/utils/generateToken");

let request;

before(async () => {
  request = await startTestServer();
  await resetDatabase();
});

after(async () => {
  await stopTestServer();
});

async function setHospitalState(hospital, changes, userId) {
  Object.assign(hospital, changes);
  await hospital.save();
  invalidateAccessCache(userId);
}

test("a suspended hospital blocks its staff on the next request", async () => {
  const tenant = await createTenant({ name: "Suspended Hospital" });

  const before = await request.get("/api/patients").set("Authorization", tenant.tokens.hospital_admin);
  assert.equal(before.status, 200, "works while active");

  await setHospitalState(tenant.hospital, { status: "suspended" }, tenant.users.hospital_admin._id);

  const after = await request.get("/api/patients").set("Authorization", tenant.tokens.hospital_admin);
  assert.equal(after.status, 403);
  assert.equal(after.body.code, "HOSPITAL_SUSPENDED");
});

test("an expired trial blocks its staff and login explains why", async () => {
  const tenant = await createTenant({ name: "Expired Trial Hospital" });
  await setHospitalState(
    tenant.hospital,
    { status: "trial", trialEndDate: new Date(Date.now() - 24 * 60 * 60 * 1000) },
    tenant.users.doctor._id
  );

  const blocked = await request.get("/api/appointments/queue").set("Authorization", tenant.tokens.doctor);
  assert.equal(blocked.status, 403);
  assert.equal(blocked.body.code, "TRIAL_EXPIRED");

  const login = await request
    .post("/api/auth/login")
    .send({ email: tenant.users.doctor.email, password: PASSWORD });
  assert.equal(login.status, 403);
  assert.equal(login.body.code, "TRIAL_EXPIRED");
});

test("a disabled account is blocked even with a valid token", async () => {
  const tenant = await createTenant({ name: "Disabled Account Hospital" });
  await User.updateOne(
    { _id: tenant.users.nurse._id },
    { $set: { status: "disabled" } },
    { skipTenantScope: true }
  );
  invalidateAccessCache(tenant.users.nurse._id);

  const response = await request.get("/api/wards").set("Authorization", tenant.tokens.nurse);
  assert.equal(response.status, 403);
  assert.equal(response.body.code, "ACCOUNT_DISABLED");
});

test("a suspended hospital cannot receive new patient signups", async () => {
  const hospital = await createHospital({ name: "No Signups Hospital", status: "suspended" });
  assert.ok(hospital._id);

  const response = await request.post("/api/public/patient-signup").send({
    hospitalId: hospital._id,
    name: "Blocked Patient",
    email: "blocked@example.test",
    password: "PatientPass123",
  });

  assert.equal(response.status, 403);
  assert.equal(response.body.code, "HOSPITAL_SUSPENDED");
});

test("a hospital missing from the database cannot be used", async () => {
  const hospital = await createHospital({ name: "Deleted Hospital" });
  const admin = await createUser(hospital._id, "hospital_admin");
  const token = `Bearer ${generateToken(admin)}`;

  await Hospital.deleteOne({ _id: hospital._id });
  invalidateAccessCache(admin._id);

  const response = await request.get("/api/patients").set("Authorization", token);
  assert.equal(response.status, 403);
  assert.equal(response.body.code, "HOSPITAL_SUSPENDED");
});
