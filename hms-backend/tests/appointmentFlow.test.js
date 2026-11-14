const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");

const { startTestServer, stopTestServer, resetDatabase } = require("./helpers/harness");
const { createTenant, createUser, createPatient, waitFor } = require("./helpers/factories");
const { hospitalNow } = require("../src/utils/scheduleSlots");
const generateToken = require("../src/utils/generateToken");
const Appointment = require("../src/models/Appointment");
const AuditLog = require("../src/models/AuditLog");
const Hospital = require("../src/models/Hospital");

let request;
let tenant;
let today;

before(async () => {
  request = await startTestServer();
  await resetDatabase();
  tenant = await createTenant({ name: "Appointment Hospital" });
  today = hospitalNow().date;
});

after(async () => {
  await stopTestServer();
});

async function newDoctor() {
  const doctor = await createUser(tenant.hospital._id, "doctor");
  return { doctor, token: `Bearer ${generateToken(doctor)}` };
}

async function book(patientId, doctorId, token = tenant.tokens.receptionist) {
  const response = await request
    .post("/api/appointments")
    .set("Authorization", token)
    .send({ patientId, doctorId, date: today });
  assert.equal(response.status, 201, `booking failed: ${JSON.stringify(response.body)}`);
  return response.body;
}

async function walkIn(patientId, doctorId, { priority, priorityReason } = {}) {
  const response = await request
    .post("/api/appointments/walk-in")
    .set("Authorization", tenant.tokens.receptionist)
    .send({ patientId, doctorId, priority, priorityReason });
  assert.equal(response.status, 201, `walk-in failed: ${JSON.stringify(response.body)}`);
  return response.body;
}

async function setStatus(appointmentId, status, token) {
  return request
    .patch(`/api/appointments/${appointmentId}/status`)
    .set("Authorization", token)
    .send({ status });
}

test("tokens are numbered per doctor per day, not globally", async () => {
  const doctorX = await newDoctor();
  const doctorY = await newDoctor();
  const p1 = await createPatient(tenant.hospital._id);
  const p2 = await createPatient(tenant.hospital._id);
  const p3 = await createPatient(tenant.hospital._id);

  const first = await walkIn(p1._id, doctorX.doctor._id);
  const second = await walkIn(p2._id, doctorX.doctor._id);
  const otherRoom = await walkIn(p3._id, doctorY.doctor._id);

  assert.equal(first.tokenNumber, 1);
  assert.equal(second.tokenNumber, 2);
  assert.equal(otherRoom.tokenNumber, 1, "a second doctor starts their own sequence at 1");
});

test("the waiting queue orders by priority, then arrival, then token", async () => {
  const doctor = await newDoctor();
  const normal = await createPatient(tenant.hospital._id);
  const emergency = await createPatient(tenant.hospital._id);
  const senior = await createPatient(tenant.hospital._id);

  const normalEntry = await walkIn(normal._id, doctor.doctor._id);
  const emergencyEntry = await walkIn(emergency._id, doctor.doctor._id, {
    priority: "emergency",
    priorityReason: "Chest pain",
  });
  const seniorEntry = await walkIn(senior._id, doctor.doctor._id, {
    priority: "senior",
    priorityReason: "65 years old",
  });

  const queue = await request.get("/api/appointments/queue").set("Authorization", tenant.tokens.hospital_admin);
  assert.equal(queue.status, 200);

  const room = queue.body.filter((row) => String(row.doctorId._id) === String(doctor.doctor._id));
  assert.deepEqual(
    room.map((row) => String(row.patientId._id)),
    [emergency._id, senior._id, normal._id].map(String)
  );

  const called = await request
    .post("/api/appointments/call-next")
    .set("Authorization", tenant.tokens.receptionist)
    .send({ doctorId: doctor.doctor._id });
  assert.equal(called.status, 200);
  assert.equal(String(called.body._id), String(emergencyEntry._id), "emergency patient is called first");

  const again = await request
    .post("/api/appointments/call-next")
    .set("Authorization", tenant.tokens.receptionist)
    .send({ doctorId: doctor.doctor._id });
  assert.equal(again.status, 409, "a doctor cannot hold two patients at once");

  const completed = await setStatus(emergencyEntry._id, "completed", doctor.token);
  assert.equal(completed.status, 200);

  const next = await request
    .post("/api/appointments/call-next")
    .set("Authorization", tenant.tokens.receptionist)
    .send({ doctorId: doctor.doctor._id });
  assert.equal(next.status, 200);
  assert.equal(String(next.body._id), String(seniorEntry._id));

  const third = await setStatus(seniorEntry._id, "completed", doctor.token);
  assert.equal(third.status, 200);
  const fourth = await request
    .post("/api/appointments/call-next")
    .set("Authorization", tenant.tokens.receptionist)
    .send({ doctorId: doctor.doctor._id });
  assert.equal(fourth.status, 200);
  assert.equal(String(fourth.body._id), String(normalEntry._id));
});

test("appointment status follows the forward-only state machine", async () => {
  const doctor = await newDoctor();
  const patient = await createPatient(tenant.hospital._id);
  const appointment = await book(patient._id, doctor.doctor._id);

  const skipAhead = await setStatus(appointment._id, "completed", doctor.token);
  assert.equal(skipAhead.status, 409, "scheduled cannot jump to completed");

  const doctorCheckIn = await setStatus(appointment._id, "checked_in", doctor.token);
  assert.equal(doctorCheckIn.status, 403, "a doctor cannot run the front desk");

  const checkIn = await setStatus(appointment._id, "checked_in", tenant.tokens.receptionist);
  assert.equal(checkIn.status, 200);
  assert.ok(checkIn.body.checkedInAt, "check-in is stamped");

  const doubleCheckIn = await setStatus(appointment._id, "checked_in", tenant.tokens.receptionist);
  assert.equal(doubleCheckIn.status, 409);

  const startConsult = await setStatus(appointment._id, "in_consultation", tenant.tokens.nurse);
  assert.equal(startConsult.status, 200);

  const cancelDuringConsult = await setStatus(appointment._id, "cancelled", tenant.tokens.receptionist);
  assert.equal(cancelDuringConsult.status, 409, "an in-progress consultation cannot be cancelled");

  const nurseCompletes = await setStatus(appointment._id, "completed", tenant.tokens.nurse);
  assert.equal(nurseCompletes.status, 403, "only a doctor closes a consultation");

  const complete = await setStatus(appointment._id, "completed", doctor.token);
  assert.equal(complete.status, 200);

  const reopen = await setStatus(appointment._id, "checked_in", tenant.tokens.receptionist);
  assert.equal(reopen.status, 409, "completed is terminal");
});

test("a patient can cancel only their own upcoming appointment", async () => {
  const doctor = await newDoctor();
  const otherDoctor = await newDoctor();
  const own = await book(tenant.patient._id, doctor.doctor._id);
  const foreign = await book(tenant.patient._id, otherDoctor.doctor._id);
  const someoneElse = await createPatient(tenant.hospital._id);
  const notTheirs = await book(someoneElse._id, doctor.doctor._id);

  const cancelled = await setStatus(own._id, "cancelled", tenant.tokens.patient);
  assert.equal(cancelled.status, 200);

  const refused = await setStatus(notTheirs._id, "cancelled", tenant.tokens.patient);
  assert.equal(refused.status, 403);

  const noShow = await setStatus(foreign._id, "no_show", tenant.tokens.patient);
  assert.equal(noShow.status, 403, "patients never mark no-shows");

  const byAdmin = await setStatus(foreign._id, "no_show", tenant.tokens.hospital_admin);
  assert.equal(byAdmin.status, 200);
});

test("patient self check-in stays off until the hospital enables it", async () => {
  const doctor = await newDoctor();
  const appointment = await book(tenant.patient._id, doctor.doctor._id);

  const disabled = await setStatus(appointment._id, "checked_in", tenant.tokens.patient);
  assert.equal(disabled.status, 403);
  assert.match(disabled.body.message, /disabled/i);

  await Hospital.updateOne(
    { _id: tenant.hospital._id },
    { $set: { "settings.allowPatientSelfCheckIn": true } }
  );

  const enabled = await setStatus(appointment._id, "checked_in", tenant.tokens.patient);
  assert.equal(enabled.status, 200);
});

test("priority needs a reason, is audited, and is refused to patients", async () => {
  const doctor = await newDoctor();
  const patient = await createPatient(tenant.hospital._id, { dob: new Date("1955-04-12") });
  const appointment = await walkIn(patient._id, doctor.doctor._id);

  const noReason = await request
    .patch(`/api/appointments/${appointment._id}/priority`)
    .set("Authorization", tenant.tokens.receptionist)
    .send({ priority: "senior" });
  assert.equal(noReason.status, 400);

  const bogus = await request
    .patch(`/api/appointments/${appointment._id}/priority`)
    .set("Authorization", tenant.tokens.receptionist)
    .send({ priority: "vip", priorityReason: "should not exist" });
  assert.equal(bogus.status, 400);

  const changed = await request
    .patch(`/api/appointments/${appointment._id}/priority`)
    .set("Authorization", tenant.tokens.receptionist)
    .send({ priority: "senior", priorityReason: "70 years old, cannot stand long" });
  assert.equal(changed.status, 200);
  assert.equal(changed.body.priority, "senior");

  const entry = await waitFor(() =>
    AuditLog.findOne({
      hospitalId: tenant.hospital._id,
      action: "Changed appointment queue priority",
      resourceId: appointment._id,
    })
      .setOptions({ skipTenantScope: true })
      .lean()
  );
  assert.ok(entry, "the priority change is in the audit trail");
  assert.equal(String(entry.patientId), String(patient._id));
  assert.equal(entry.userRole, "receptionist");
  assert.ok(entry.userName, "the actor's name is snapshotted");

  const byPatient = await request
    .patch(`/api/appointments/${appointment._id}/priority`)
    .set("Authorization", tenant.tokens.patient)
    .send({ priority: "emergency", priorityReason: "self assigned" });
  assert.equal(byPatient.status, 403);

  const closed = await Appointment.create({
    hospitalId: tenant.hospital._id,
    patientId: (await createPatient(tenant.hospital._id))._id,
    doctorId: doctor.doctor._id,
    date: today,
    tokenNumber: 99,
    status: "completed",
  });
  const afterClose = await request
    .patch(`/api/appointments/${closed._id}/priority`)
    .set("Authorization", tenant.tokens.receptionist)
    .send({ priority: "emergency", priorityReason: "too late" });
  assert.equal(afterClose.status, 409);
});
