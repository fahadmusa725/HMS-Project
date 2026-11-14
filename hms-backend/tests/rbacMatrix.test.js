/**
 * Auth + RBAC matrix.
 *
 * Every mounted hospital route is listed with the roles its router allows. The test then
 * proves the negative case for every other role (403) and the positive case for the
 * allowed ones (anything except 401/403 - the specific handler outcome is covered by the
 * behavioural tests). Path ids are valid but absent, so no role can mutate shared fixtures.
 */
const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");

const { startTestServer, stopTestServer, resetDatabase } = require("./helpers/harness");
const { createTenant, createSuperAdmin, absentId } = require("./helpers/factories");

const ALL_ROLES = [
  "hospital_admin",
  "doctor",
  "receptionist",
  "nurse",
  "lab_technician",
  "pharmacist",
  "accountant",
  "patient",
];

const ADMIN = ["hospital_admin"];
const CLINICAL = ["hospital_admin", "doctor", "nurse"];
const FRONT_DESK = ["hospital_admin", "receptionist"];
const QUEUE_VIEWERS = ["hospital_admin", "receptionist", "doctor", "nurse"];
const PRE_CHECK_READERS = ["hospital_admin", "receptionist", "doctor", "nurse", "patient"];
const SCHEDULE_VIEWERS = ["hospital_admin", "receptionist", "doctor", "nurse", "patient"];
const ANY = [...ALL_ROLES, "platform_super_admin"];

const id = absentId();
const otherId = absentId();

// [method, path, allowed hospital roles]. Platform-wide routes are marked with "platform".
const ROUTES = [
  // auth
  ["get", "/api/auth/me", ANY],
  ["post", "/api/auth/change-password", ANY],

  // patients
  ["post", "/api/patients", ["hospital_admin", "receptionist", "doctor", "nurse"]],
  ["get", "/api/patients", ["hospital_admin", "receptionist", "doctor", "nurse"]],
  ["get", `/api/patients/${id}`, ["hospital_admin", "receptionist", "doctor", "nurse"]],
  ["patch", `/api/patients/${id}`, ["hospital_admin", "receptionist", "doctor", "nurse"]],
  ["post", `/api/patients/${id}/enable-portal`, FRONT_DESK],
  ["post", `/api/patients/${id}/link-account`, FRONT_DESK],
  ["get", "/api/patients/me", ["patient"]],
  ["patch", "/api/patients/me", ["patient"]],
  ["post", "/api/patients/me/claim", ["patient"]],

  // appointments
  ["get", "/api/appointments/mine", ["patient"]],
  ["get", "/api/appointments/mine/live", ["patient"]],
  ["post", "/api/appointments/book-mine", ["patient"]],
  ["get", "/api/appointments/doctors", SCHEDULE_VIEWERS],
  ["post", "/api/appointments", FRONT_DESK],
  ["post", "/api/appointments/walk-in", FRONT_DESK],
  ["get", "/api/appointments/queue", QUEUE_VIEWERS],
  ["get", "/api/appointments/display-link", QUEUE_VIEWERS],
  ["post", "/api/appointments/call-next", ["hospital_admin", "receptionist", "doctor"]],
  ["patch", `/api/appointments/${id}/priority`, ["hospital_admin", "receptionist", "doctor"]],
  ["patch", `/api/appointments/${id}/status`, [...QUEUE_VIEWERS, "patient"]],
  ["get", `/api/appointments/patient/${id}`, QUEUE_VIEWERS],
  ["get", `/api/appointments/${id}/slip-pdf`, [...QUEUE_VIEWERS, "patient"]],

  // hospital admin
  ["post", "/api/hospital-admin/staff", ADMIN],
  ["get", "/api/hospital-admin/staff", ADMIN],
  ["patch", `/api/hospital-admin/staff/${id}`, ADMIN],
  ["patch", `/api/hospital-admin/staff/${id}/status`, ADMIN],
  ["post", `/api/hospital-admin/staff/${id}/reset-password`, ADMIN],
  ["get", "/api/hospital-admin/export", ADMIN],
  ["get", "/api/hospital-admin/settings", ADMIN],
  ["patch", "/api/hospital-admin/settings", ADMIN],
  ["post", "/api/hospital-admin/settings/display-key", ADMIN],

  // consultations
  ["get", "/api/consultations/mine", ["patient"]],
  ["post", "/api/consultations", ["doctor"]],
  ["get", `/api/consultations/patient/${id}`, ["doctor", "nurse", "hospital_admin", "receptionist"]],
  ["get", `/api/consultations/${id}`, ["doctor", "nurse", "hospital_admin"]],
  ["get", `/api/consultations/${id}/prescription-pdf`, ["doctor", "nurse", "hospital_admin", "receptionist", "patient"]],

  // wards
  ["post", "/api/wards", ADMIN],
  ["patch", `/api/wards/${id}`, ADMIN],
  ["get", "/api/wards", ["hospital_admin", "doctor", "nurse", "receptionist"]],
  ["post", `/api/wards/${id}/beds`, ADMIN],
  ["get", "/api/wards/beds/all", ["hospital_admin", "doctor", "nurse", "receptionist"]],

  // admissions
  ["post", "/api/admissions", ["hospital_admin", "doctor", "nurse", "receptionist"]],
  ["get", "/api/admissions", ["hospital_admin", "doctor", "nurse", "receptionist", "accountant"]],
  ["get", `/api/admissions/${id}`, ["hospital_admin", "doctor", "nurse", "receptionist", "accountant"]],
  ["get", `/api/admissions/${id}/running-bill`, ["hospital_admin", "doctor", "nurse", "receptionist", "accountant"]],
  ["post", `/api/admissions/${id}/advance-payment`, ["hospital_admin", "receptionist", "accountant"]],
  ["patch", `/api/admissions/${id}/discharge`, CLINICAL],
  ["post", `/api/admissions/${id}/notes`, ["nurse", "doctor", "hospital_admin"]],
  ["get", `/api/admissions/${id}/notes`, ["hospital_admin", "doctor", "nurse", "receptionist"]],

  // lab
  ["post", "/api/lab/tests", ADMIN],
  ["get", "/api/lab/tests", ["hospital_admin", "doctor", "lab_technician", "receptionist"]],
  ["post", "/api/lab/orders", ["doctor", "hospital_admin", "receptionist"]],
  ["get", "/api/lab/orders", ["hospital_admin", "doctor", "nurse", "receptionist", "lab_technician"]],
  ["patch", `/api/lab/orders/${id}/status`, ["lab_technician", "hospital_admin"]],
  ["patch", `/api/lab/orders/${id}/result`, ["lab_technician", "hospital_admin"]],
  ["post", `/api/lab/orders/${id}/upload-result`, ["lab_technician", "hospital_admin"]],
  ["get", `/api/lab/orders/patient/${id}`, ["hospital_admin", "doctor", "nurse", "receptionist", "lab_technician"]],

  // pharmacy
  ["post", "/api/pharmacy/medicines", ["pharmacist", "hospital_admin"]],
  ["get", "/api/pharmacy/medicines", ["pharmacist", "hospital_admin", "doctor", "nurse"]],
  ["patch", `/api/pharmacy/medicines/${id}`, ["pharmacist", "hospital_admin"]],
  ["patch", `/api/pharmacy/medicines/${id}/restock`, ["pharmacist", "hospital_admin"]],
  ["post", "/api/pharmacy/dispense", ["pharmacist", "hospital_admin"]],
  ["get", "/api/pharmacy/sales", ["pharmacist", "hospital_admin"]],

  // billing
  ["get", "/api/billing/mine", ["patient"]],
  ["post", "/api/billing", ["accountant", "hospital_admin", "receptionist"]],
  ["get", "/api/billing", ["accountant", "hospital_admin", "receptionist"]],
  ["get", `/api/billing/patient/${id}`, ["accountant", "hospital_admin", "receptionist"]],
  ["patch", `/api/billing/${id}/payment`, ["accountant", "hospital_admin", "receptionist"]],

  // reports
  ["get", "/api/reports/overview", ADMIN],
  ["get", "/api/reports/dashboard", ADMIN],
  ["get", "/api/reports/financial", ["hospital_admin", "accountant"]],
  ["get", "/api/reports/clinical", ADMIN],
  ["get", "/api/reports/operations", ADMIN],

  // audit
  ["get", "/api/audit-logs", ADMIN],
  ["get", "/api/audit-logs/actions", ADMIN],

  // pre-checks
  ["get", "/api/pre-checks/mine", ["patient"]],
  ["post", "/api/pre-checks", ["patient"]],
  ["patch", `/api/pre-checks/${id}/staff-vitals`, ["hospital_admin", "receptionist", "nurse", "doctor"]],
  ["get", `/api/pre-checks/${id}/attachments/${otherId}/url`, PRE_CHECK_READERS],
  ["get", `/api/pre-checks/${id}`, PRE_CHECK_READERS],

  // doctor schedules
  ["get", "/api/doctor-schedules/available-doctors", SCHEDULE_VIEWERS],
  ["get", "/api/doctor-schedules/available-slots", SCHEDULE_VIEWERS],
  ["put", `/api/doctor-schedules/${id}`, ADMIN],
  ["get", `/api/doctor-schedules/${id}`, SCHEDULE_VIEWERS],

  // platform super admin
  ["post", "/api/super-admin/hospitals", ["platform_super_admin"]],
  ["get", "/api/super-admin/hospitals", ["platform_super_admin"]],
  ["patch", `/api/super-admin/hospitals/${id}`, ["platform_super_admin"]],
  ["delete", `/api/super-admin/hospitals/${id}`, ["platform_super_admin"]],
  ["post", "/api/super-admin/trial-check", ["platform_super_admin"]],
  ["post", "/api/super-admin/appointment-reminder-check", ["platform_super_admin"]],
  ["post", "/api/super-admin/test-email", ["platform_super_admin"]],
];

let request;
let tokens;
let superToken;

before(async () => {
  request = await startTestServer();
  await resetDatabase();
  const tenant = await createTenant({ name: "RBAC Hospital" });
  tokens = tenant.tokens;
  const superAdmin = await createSuperAdmin();
  superToken = superAdmin.token;
});

after(async () => {
  await stopTestServer();
});

function tokenFor(role) {
  return role === "platform_super_admin" ? superToken : tokens[role];
}

test("unauthenticated requests are rejected on every hospital route", async () => {
  for (const [method, path] of ROUTES) {
    const response = await request[method](path).send({});
    assert.equal(response.status, 401, `${method.toUpperCase()} ${path} must require a token`);
  }
});

for (const [method, path, allowed] of ROUTES) {
  test(`${method.toUpperCase()} ${path} enforces its role list`, async () => {
    for (const role of [...ALL_ROLES, "platform_super_admin"]) {
      const response = await request[method](path)
        .set("Authorization", tokenFor(role))
        .send({});

      if (allowed.includes(role)) {
        assert.ok(
          response.status !== 401 && response.status !== 403,
          `${role} should be allowed on ${method.toUpperCase()} ${path}, got ${response.status} ${JSON.stringify(
            response.body
          )}`
        );
      } else {
        assert.equal(
          response.status,
          403,
          `${role} must be refused on ${method.toUpperCase()} ${path}, got ${response.status}`
        );
      }
    }
  });
}

test("cron endpoints require the shared secret, not a user token", async () => {
  for (const path of ["/api/cron/trial-check", "/api/cron/appointment-reminders", "/api/cron/no-show-sweep"]) {
    const unauthenticated = await request.get(path);
    assert.equal(unauthenticated.status, 401, `${path} without secret`);

    const withUserToken = await request.get(path).set("Authorization", tokens.hospital_admin);
    assert.equal(withUserToken.status, 401, `${path} rejects a normal user token`);
  }
});
