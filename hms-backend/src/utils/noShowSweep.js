const Appointment = require("../models/Appointment");
const Hospital = require("../models/Hospital");
const { getCurrentHospitalId, runWithTenantContext } = require("./tenantContext");
const { hospitalNow, HHMM_REGEX, toMinutes, toHHMM } = require("./scheduleSlots");

// A "scheduled" appointment sitting untouched this long past its slot is treated as a no-show.
const NO_SHOW_GRACE_MINUTES = 45;

// The queue GET is the read hot path and must never write, so sweeps are throttled to once a
// minute per hospital and only run from write paths (booking, walk-in, call-next) or the cron job.
const SWEEP_INTERVAL_MS = 60 * 1000;
const lastSweepByHospital = new Map();

/**
 * Appointments that should now be no-shows: any past-date row still "scheduled" (token bookings
 * included), plus today's rows whose slot started more than NO_SHOW_GRACE_MINUTES ago. Never
 * touches anything checked_in or beyond - a real arrival must never be swept away.
 */
function staleNoShowFilter(now) {
  const cutoffTime = toHHMM(Math.max(toMinutes(now.time) - NO_SHOW_GRACE_MINUTES, 0));
  return {
    status: "scheduled",
    $or: [{ date: { $lt: now.date } }, { date: now.date, time: { $regex: HHMM_REGEX, $lte: cutoffTime } }],
  };
}

/** Tenant-scoped sweep, throttled unless `force` (used by write paths that need a fresh answer now). */
async function flagStaleNoShows({ force = false } = {}) {
  const hospitalId = getCurrentHospitalId();
  if (!hospitalId) return;

  const key = String(hospitalId);
  if (!force && Date.now() - (lastSweepByHospital.get(key) || 0) < SWEEP_INTERVAL_MS) return;

  lastSweepByHospital.set(key, Date.now());
  try {
    await Appointment.updateMany(staleNoShowFilter(hospitalNow()), { $set: { status: "no_show" } });
  } catch (err) {
    // Don't let one failed sweep silence the next minute's attempt.
    lastSweepByHospital.delete(key);
    throw err;
  }
}

/**
 * Cron entry point: the same sweep across every active/trial hospital. Runs inside each
 * hospital's tenant context, so the tenant guard still applies to every write.
 */
async function sweepNoShowsAcrossHospitals() {
  const hospitals = await Hospital.find({ status: { $in: ["active", "trial"] } }).select("_id").lean();
  const now = hospitalNow();
  let flagged = 0;

  for (const hospital of hospitals) {
    const result = await runWithTenantContext({ hospitalId: hospital._id }, () =>
      Appointment.updateMany(staleNoShowFilter(now), { $set: { status: "no_show" } })
    );
    flagged += result.modifiedCount || 0;
  }

  return { hospitals: hospitals.length, flagged };
}

module.exports = { NO_SHOW_GRACE_MINUTES, flagStaleNoShows, sweepNoShowsAcrossHospitals };
