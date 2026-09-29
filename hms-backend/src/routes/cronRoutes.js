const express = require("express");
const { checkTrialsEndingSoon } = require("../jobs/trialReminderJob");
const { sendAppointmentReminders } = require("../jobs/appointmentReminderJob");

const router = express.Router();

/**
 * Daily jobs for Vercel Cron (see vercel.json). On Vercel there's no long-lived
 * process for node-cron, so Vercel calls these URLs on schedule instead and sends
 * `Authorization: Bearer <CRON_SECRET>` - anything without that header is refused.
 */
function requireCronSecret(req, res, next) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.authorization !== `Bearer ${secret}`) {
    return res.status(401).json({ message: "Unauthorized." });
  }
  next();
}

const run = (job) => async (req, res) => {
  try {
    res.json(await job());
  } catch (err) {
    console.error("[Cron]", err);
    res.status(500).json({ message: err.message });
  }
};

router.get("/trial-check", requireCronSecret, run(checkTrialsEndingSoon)); // 04:00 UTC = 9 AM PKT
router.get("/appointment-reminders", requireCronSecret, run(sendAppointmentReminders)); // 13:00 UTC = 6 PM PKT

module.exports = router;
