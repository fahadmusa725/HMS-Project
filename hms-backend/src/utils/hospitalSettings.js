const Hospital = require("../models/Hospital");
const { getCurrentHospitalId } = require("./tenantContext");
const { hospitalNow } = require("./scheduleSlots");

/**
 * Defaults are applied in code as well as in the schema, because hospitals created before
 * the settings subdocument existed have no settings object at all until they are saved.
 */
const DEFAULT_SETTINGS = {
  displayName: "",
  seniorAgeThreshold: 60,
  allowPatientSelfCheckIn: false,
  averageConsultationMinutes: 15,
  displayKey: null,
};

function normalizeSettings(raw) {
  const source = raw || {};
  const threshold = Number(source.seniorAgeThreshold);
  const average = Number(source.averageConsultationMinutes);

  return {
    displayName: typeof source.displayName === "string" ? source.displayName.trim() : "",
    seniorAgeThreshold: Number.isFinite(threshold) ? threshold : DEFAULT_SETTINGS.seniorAgeThreshold,
    allowPatientSelfCheckIn: source.allowPatientSelfCheckIn === true,
    averageConsultationMinutes: Number.isFinite(average) ? average : DEFAULT_SETTINGS.averageConsultationMinutes,
    displayKey: typeof source.displayKey === "string" && source.displayKey ? source.displayKey : null,
  };
}

/**
 * Read-only settings lookup - safe to call from GET endpoints. Never writes, so it is
 * also safe on the public display route. Returns defaults when the hospital has none yet.
 */
async function getHospitalSettings(hospitalId = getCurrentHospitalId()) {
  if (!hospitalId) return { ...DEFAULT_SETTINGS };
  const hospital = await Hospital.findById(hospitalId).select("settings").lean();
  return normalizeSettings(hospital && hospital.settings);
}

/** Whole years between a date of birth and today in HOSPITAL time; null when dob is missing/invalid. */
function ageInYears(dob) {
  if (!dob) return null;
  const birth = new Date(dob);
  if (Number.isNaN(birth.getTime())) return null;

  const [todayYear, todayMonth, todayDay] = hospitalNow().date.split("-").map(Number);
  const birthYear = birth.getUTCFullYear();
  const birthMonth = birth.getUTCMonth() + 1;
  const birthDay = birth.getUTCDate();

  let age = todayYear - birthYear;
  if (todayMonth < birthMonth || (todayMonth === birthMonth && todayDay < birthDay)) age -= 1;
  return age >= 0 ? age : null;
}

module.exports = { DEFAULT_SETTINGS, normalizeSettings, getHospitalSettings, ageInYears };
