const Hospital = require("../models/Hospital");

/**
 * The hospital's own identity (name and logo) is edited by its Hospital Admin, but it is
 * also created by the Super Admin and read by every surface in the app - so the rules live
 * in one place rather than being repeated in the two controllers that write them.
 */
const HOSPITAL_NAME_MIN = 2;
const HOSPITAL_NAME_MAX = 80;

function normalizeHospitalName(value) {
  return String(value ?? "").trim();
}

/** Returns a client-facing message, or null when the name is acceptable. */
function hospitalNameError(value) {
  const name = normalizeHospitalName(value);
  if (name.length < HOSPITAL_NAME_MIN) {
    return `Hospital name must be at least ${HOSPITAL_NAME_MIN} characters.`;
  }
  if (name.length > HOSPITAL_NAME_MAX) {
    return `Hospital name must be at most ${HOSPITAL_NAME_MAX} characters.`;
  }
  return null;
}

/**
 * The public signup list and the Super Admin console both identify a tenant by its name, so
 * two hospitals must never share one. There is deliberately no unique index: existing data
 * may already collide and a failed index build would block writes to the tenant registry.
 * The check runs on the two write paths (create and rename) instead.
 */
async function findHospitalNameClash(name, excludeId) {
  const escaped = normalizeHospitalName(name).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const query = { name: { $regex: `^${escaped}$`, $options: "i" } };
  if (excludeId) query._id = { $ne: excludeId };
  return Hospital.findOne(query).select("name").lean();
}

module.exports = {
  HOSPITAL_NAME_MIN,
  HOSPITAL_NAME_MAX,
  normalizeHospitalName,
  hospitalNameError,
  findHospitalNameClash,
};
