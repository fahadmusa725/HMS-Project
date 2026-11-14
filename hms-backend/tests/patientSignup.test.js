const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");

const { startTestServer, stopTestServer, resetDatabase, sentEmails } = require("./helpers/harness");
const { createHospital, createPatient, createPatientWithLogin } = require("./helpers/factories");
const Patient = require("../src/models/Patient");
const User = require("../src/models/User");

let request;

before(async () => {
  request = await startTestServer();
  await resetDatabase();
});

after(async () => {
  await stopTestServer();
});

function signupBody(hospitalId, overrides = {}) {
  return {
    hospitalId,
    name: "Ayesha Khan",
    email: "ayesha.signup@example.test",
    password: "PatientPass123",
    phone: "0300-1234567",
    cnic: "35201-1234567-1",
    gender: "female",
    ...overrides,
  };
}

function claimCodeFromLastEmail() {
  const email = sentEmails[sentEmails.length - 1];
  assert.ok(email, "a verification email was sent");
  const match = /(\d{6})/.exec(email.html);
  assert.ok(match, "the email contains a 6-digit code");
  return match[1];
}

test("a brand new patient gets an account plus a linked clinical record", async () => {
  const hospital = await createHospital({ name: "Signup Hospital" });

  const response = await request.post("/api/public/patient-signup").send(signupBody(hospital._id));

  assert.equal(response.status, 201);
  assert.equal(response.body.recordLinked, true);
  assert.equal(response.body.verificationRequired, false);
  assert.ok(response.body.token);

  const patient = await Patient.findOne({ userId: response.body.user.id })
    .setOptions({ skipTenantScope: true });
  assert.ok(patient, "Patient row is linked to the new account");
  assert.equal(patient.email, "ayesha.signup@example.test");
  assert.equal(patient.hospitalId.toString(), hospital._id.toString());
});

test("an existing record with an email is NOT linked until the emailed code is entered", async () => {
  const hospital = await createHospital({ name: "Claim Hospital" });
  const existing = await createPatient(hospital._id, {
    name: "Bilal Ahmed",
    email: "bilal.record@example.test",
    phone: "0321-7654321",
    cnic: "35202-7654321-9",
  });

  const signup = await request.post("/api/public/patient-signup").send(
    signupBody(hospital._id, {
      name: "Bilal Ahmed",
      email: "bilal.login@example.test",
      phone: "0321-7654321",
      cnic: "35202-7654321-9",
    })
  );

  assert.equal(signup.status, 201);
  assert.equal(signup.body.recordLinked, false);
  assert.equal(signup.body.verificationRequired, true);

  const stillUnlinked = await Patient.findById(existing._id).setOptions({ skipTenantScope: true });
  assert.ok(!stillUnlinked.userId, "knowing the CNIC alone never grants access");

  const pendingUser = await User.findById(signup.body.user.id).select("+claimCodeHash").setOptions({
    skipTenantScope: true,
  });
  assert.ok(pendingUser.claimCodeHash, "only a hash of the code is stored");

  const me = await request.get("/api/patients/me").set("Authorization", `Bearer ${signup.body.token}`);
  assert.equal(me.status, 404, "the account is not linked yet");

  const wrongCode = await request
    .post("/api/patients/me/claim")
    .set("Authorization", `Bearer ${signup.body.token}`)
    .send({ code: "000000" });
  assert.equal(wrongCode.status, 400);

  const code = claimCodeFromLastEmail();
  const claimed = await request
    .post("/api/patients/me/claim")
    .set("Authorization", `Bearer ${signup.body.token}`)
    .send({ code });
  assert.equal(claimed.status, 200);

  const linked = await Patient.findById(existing._id).setOptions({ skipTenantScope: true });
  assert.equal(linked.userId.toString(), signup.body.user.id);

  const meAfter = await request.get("/api/patients/me").set("Authorization", `Bearer ${signup.body.token}`);
  assert.equal(meAfter.status, 200);
  assert.equal(meAfter.body.name, "Bilal Ahmed");
});

test("an existing record without an email is never linked automatically", async () => {
  const hospital = await createHospital({ name: "Front Desk Hospital" });
  await createPatient(hospital._id, { name: "Sana Malik", phone: "0333-1112223", cnic: "35203-1112223-4" });
  const emailsBefore = sentEmails.length;

  const response = await request.post("/api/public/patient-signup").send(
    signupBody(hospital._id, {
      name: "Sana Malik",
      email: "sana.login@example.test",
      phone: "0333-1112223",
      cnic: "35203-1112223-4",
    })
  );

  assert.equal(response.status, 201);
  assert.equal(response.body.recordLinked, false);
  assert.equal(response.body.verificationRequired, false);
  assert.equal(sentEmails.length, emailsBefore, "no claim email is possible without an address on file");
});

test("signing up for a record that already has a portal account is refused", async () => {
  const hospital = await createHospital({ name: "Conflict Hospital" });
  const { patient } = await createPatientWithLogin(hospital._id);
  await Patient.updateOne(
    { _id: patient._id },
    { $set: { cnic: "35204-9998887-1", phone: "0345-9998887" } },
    { skipTenantScope: true }
  );

  const response = await request.post("/api/public/patient-signup").send(
    signupBody(hospital._id, { email: "duplicate.login@example.test", cnic: "35204-9998887-1", phone: "0345-9998887" })
  );

  assert.equal(response.status, 409);
});

test("the same email cannot hold two accounts", async () => {
  const hospital = await createHospital({ name: "Email Conflict Hospital" });
  const body = signupBody(hospital._id, { email: "same@example.test", cnic: "35205-1111111-1", phone: "0301-1111111" });

  const first = await request.post("/api/public/patient-signup").send(body);
  assert.equal(first.status, 201);

  const second = await request.post("/api/public/patient-signup").send(
    signupBody(hospital._id, { email: "same@example.test", cnic: "35205-2222222-2", phone: "0301-2222222" })
  );
  assert.equal(second.status, 409);
});

test("weak passwords and unknown hospitals are rejected before anything is written", async () => {
  const hospital = await createHospital({ name: "Validation Hospital" });

  const weak = await request.post("/api/public/patient-signup").send(signupBody(hospital._id, { password: "short" }));
  assert.equal(weak.status, 400);

  const missing = await request.post("/api/public/patient-signup").send(signupBody("64b000000000000000000000"));
  assert.equal(missing.status, 404);
});
