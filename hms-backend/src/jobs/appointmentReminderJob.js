const Appointment = require("../models/Appointment");
const { sendEmail } = require("../utils/mailer");
const doctorName = require("../utils/doctorName");
const { hospitalDate } = require("../utils/scheduleSlots");
const { escapeHtml } = require("../utils/security");

// Sending one email at a time made this job's runtime grow linearly with the day's appointments,
// which eventually runs past the Vercel function limit. A few in flight at once is still gentle on
// Gmail SMTP; the deadline makes the job stop cleanly instead of being killed mid-send.
const SEND_CONCURRENCY = 5;
const TIME_BUDGET_MS = 25 * 1000;

/** The portal origin for links in emails - CLIENT_URL may list several, the first is canonical. */
function clientBaseUrl() {
  return String(process.env.CLIENT_URL || "")
    .split(",")[0]
    .trim()
    .replace(/\/+$/, "");
}

/**
 * Finds all appointments scheduled for TOMORROW (across every hospital)
 * and emails a reminder to any patient who has an email on file - this
 * works regardless of whether the patient has portal access, since the
 * email lives on the Patient record itself, not the User account.
 *
 * Uses aggregate() (not find()) so it can legitimately scan across every
 * hospital in one pass - same pattern as the Reports module. Because that is an
 * intentional cross-tenant read it must opt out of the tenant guard explicitly
 * (.option({ skipTenantScope: true })). This is exported as a plain function so
 * it can be triggered manually for testing, or from a Vercel Cron Job.
 */
async function sendAppointmentReminders() {
  const tomorrow = hospitalDate(1);

  const upcoming = await Appointment.aggregate([
    { $match: { date: tomorrow, status: { $in: ["scheduled", "checked_in"] } } },
    { $lookup: { from: "patients", localField: "patientId", foreignField: "_id", as: "patient" } },
    { $unwind: "$patient" },
    { $lookup: { from: "users", localField: "doctorId", foreignField: "_id", as: "doctor" } },
    { $unwind: "$doctor" },
    { $match: { "patient.email": { $exists: true, $ne: null, $ne: "" } } },
  ]).option({ skipTenantScope: true });

  let sent = 0;
  let attempted = 0;
  const queue = upcoming.slice();
  const deadline = Date.now() + TIME_BUDGET_MS;

  const worker = async () => {
    while (Date.now() < deadline) {
      const appt = queue.shift();
      if (!appt) return;
      attempted++;
      // Only worth linking while the appointment is still waiting for the visit - a patient
      // who already checked in cannot edit their pre-check any more.
      const preCheckUrl =
        appt.status === "scheduled" && clientBaseUrl()
          ? `${clientBaseUrl()}/portal/appointments?precheck=${appt._id}`
          : "";

      const result = await sendEmail({
        to: appt.patient.email,
        subject: `Appointment Reminder: ${tomorrow}`,
        html: `
          <p>Hello ${escapeHtml(appt.patient.name)},</p>
          <p>This is a reminder of your appointment <strong>tomorrow (${escapeHtml(tomorrow)})</strong>
          ${appt.time ? `at <strong>${escapeHtml(appt.time)}</strong>` : ""} with ${escapeHtml(doctorName(appt.doctor.name))}.</p>
          <p>Your token number will be: <strong>#${escapeHtml(appt.tokenNumber)}</strong></p>
          ${
            preCheckUrl
              ? `<p>Save time at the front desk: <a href="${escapeHtml(preCheckUrl)}">complete your digital pre-check</a>
                (symptoms, vitals and any reports you already have) before you arrive. It takes about two
                minutes and your doctor sees it before the visit.</p>`
              : ""
          }
          <p>Please arrive a little early. If you need to reschedule, please contact the hospital.</p>
        `,
      });
      if (result.sent || result.reason === "Email credentials not configured in .env") sent++;
    }
  };

  await Promise.all(Array.from({ length: Math.min(SEND_CONCURRENCY, queue.length) }, worker));

  const timedOut = attempted < upcoming.length;
  if (timedOut) {
    console.warn(
      `[Cron] Appointment reminders hit the ${TIME_BUDGET_MS / 1000}s budget after ${attempted}/${upcoming.length} emails; the rest go out on the next run.`
    );
  }

  return { checked: true, appointmentsFound: upcoming.length, remindersSent: sent, timedOut };
}

module.exports = { sendAppointmentReminders };