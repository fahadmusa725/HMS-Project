/**
 * Factories for the two-hospital test world.
 *
 * Everything is written with an explicit hospitalId, so the tenant plugin's pre-validate
 * stamp (which needs an AsyncLocalStorage context) is never the thing being exercised here.
 */
const Hospital = require("../../src/models/Hospital");
const User = require("../../src/models/User");
const Patient = require("../../src/models/Patient");
const Ward = require("../../src/models/Ward");
const Bed = require("../../src/models/Bed");
const generateToken = require("../../src/utils/generateToken");

const PASSWORD = "TestPass123!";
const STAFF_ROLES = [
  "hospital_admin",
  "doctor",
  "receptionist",
  "nurse",
  "lab_technician",
  "pharmacist",
  "accountant",
];

let counter = 0;

function nextId() {
  counter += 1;
  return counter;
}

function uniqueEmail(label) {
  return `${label}-${process.pid}-${nextId()}@example.test`;
}

async function createHospital(overrides = {}) {
  const n = nextId();
  return Hospital.create({ name: `Test Hospital ${n}`, status: "active", ...overrides });
}

async function createUser(hospitalId, role, overrides = {}) {
  return User.create({
    hospitalId,
    name: `${role.replace(/_/g, " ")} ${nextId()}`,
    email: uniqueEmail(role),
    password: PASSWORD,
    role,
    status: "active",
    ...overrides,
  });
}

async function createPatient(hospitalId, overrides = {}) {
  const n = nextId();
  return Patient.create({
    hospitalId,
    mrn: `TST-${String(n).padStart(6, "0")}`,
    name: `Patient ${n}`,
    phone: `03${String(100000000 + n).slice(0, 9)}`,
    ...overrides,
  });
}

async function createPatientWithLogin(hospitalId) {
  const patient = await createPatient(hospitalId);
  const user = await createUser(hospitalId, "patient", { name: patient.name });
  patient.userId = user._id;
  await patient.save();
  return { patient, user };
}

/**
 * A hospital with one active user per role, one linked patient account, and a ward+bed.
 * `tokens` maps role -> "Bearer ..." ready for `.set("Authorization", ...)`.
 */
async function createTenant(overrides = {}) {
  const hospital = await createHospital(overrides);
  const users = {};

  for (const role of STAFF_ROLES) {
    users[role] = await createUser(hospital._id, role);
  }

  const { patient, user: patientUser } = await createPatientWithLogin(hospital._id);
  users.patient = patientUser;

  const tokens = {};
  Object.entries(users).forEach(([role, user]) => {
    tokens[role] = `Bearer ${generateToken(user)}`;
  });

  const ward = await Ward.create({ hospitalId: hospital._id, name: "General Ward", dailyRate: 2000 });
  const bed = await Bed.create({ hospitalId: hospital._id, wardId: ward._id, bedNumber: "G-01" });

  return { hospital, users, tokens, patient, patientUser, ward, bed };
}

async function createSuperAdmin() {
  const user = await User.create({
    name: "Platform Admin",
    email: uniqueEmail("super-admin"),
    password: PASSWORD,
    role: "platform_super_admin",
    status: "active",
  });
  return { user, token: `Bearer ${generateToken(user)}` };
}

/** 24-hex ObjectId that is valid but absent from the database. */
function absentId() {
  const { Types } = require("mongoose");
  return new Types.ObjectId().toString();
}

/** Polls until `predicate` returns a truthy value, or fails after `timeoutMs`. */
async function waitFor(predicate, { timeoutMs = 2000, intervalMs = 25 } = {}) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const value = await predicate();
    if (value) return value;
    if (Date.now() > deadline) return null;
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
}

module.exports = {
  PASSWORD,
  STAFF_ROLES,
  createHospital,
  createUser,
  createPatient,
  createPatientWithLogin,
  createTenant,
  createSuperAdmin,
  absentId,
  waitFor,
};
