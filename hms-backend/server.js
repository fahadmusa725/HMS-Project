require("dotenv").config();
const cron = require("node-cron");
const app = require("./src/app");
const { checkTrialsEndingSoon } = require("./src/jobs/trialReminderJob");
const { sendAppointmentReminders } = require("./src/jobs/appointmentReminderJob");
const { sweepNoShowsAcrossHospitals } = require("./src/utils/noShowSweep");

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`[Server] HMS backend running on http://localhost:${PORT}`);
});

// Daily trial-reminder check, 9:00 AM server time. This only runs while
// this long-lived process is alive - on Vercel (serverless, no long-lived
// process), this should be replaced with a Vercel Cron Job that hits a
// protected endpoint calling checkTrialsEndingSoon() instead.
cron.schedule("0 9 * * *", () => {
  console.log("[Cron] Running daily trial-ending check...");
  checkTrialsEndingSoon()
    .then((result) => console.log("[Cron] Trial check result:", result))
    .catch((err) => console.error("[Cron] Trial check failed:", err.message));
});

// Daily appointment-reminder check, 6:00 PM server time (reminds patients
// about tomorrow's appointments). Same Vercel Cron note as above applies.
cron.schedule("0 18 * * *", () => {
  console.log("[Cron] Running daily appointment-reminder check...");
  sendAppointmentReminders()
    .then((result) => console.log("[Cron] Appointment reminder result:", result))
    .catch((err) => console.error("[Cron] Appointment reminder failed:", err.message));
});

// Daily no-show catch-up just after hospital midnight. The live queue GET never writes,
// so this (plus the throttled sweep on booking/walk-in/call-next) is what retires a
// "scheduled" row nobody claimed. Kept daily so it stays within Hobby-plan cron limits.
cron.schedule("30 0 * * *", () => {
  console.log("[Cron] Sweeping unclaimed appointments to no-show...");
  sweepNoShowsAcrossHospitals()
    .then((result) => console.log("[Cron] No-show sweep result:", result))
    .catch((err) => console.error("[Cron] No-show sweep failed:", err.message));
});