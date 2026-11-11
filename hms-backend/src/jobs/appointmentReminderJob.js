const Appointment = require("../models/Appointment");
const { sendEmail } = require("../utils/mailer");
const doctorName = require("../utils/doctorName");
const { hospitalDate } = require("../utils/scheduleSlots");
const { escapeHtml } = require("../utils/security");

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
  for (const appt of upcoming) {
    const result = await sendEmail({
      to: appt.patient.email,
      subject: `Appointment Reminder: ${tomorrow}`,
      html: `
        <p>Hello ${escapeHtml(appt.patient.name)},</p>
        <p>This is a reminder of your appointment <strong>tomorrow (${escapeHtml(tomorrow)})</strong>
        ${appt.time ? `at <strong>${escapeHtml(appt.time)}</strong>` : ""} with ${escapeHtml(doctorName(appt.doctor.name))}.</p>
        <p>Your token number will be: <strong>#${escapeHtml(appt.tokenNumber)}</strong></p>
        <p>Please arrive a little early. If you need to reschedule, please contact the hospital.</p>
      `,
    });
    if (result.sent || result.reason === "Email credentials not configured in .env") sent++;
  }

  return { checked: true, appointmentsFound: upcoming.length, remindersSent: sent };
}

module.exports = { sendAppointmentReminders };