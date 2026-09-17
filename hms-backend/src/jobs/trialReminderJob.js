const Hospital = require("../models/Hospital");
const User = require("../models/User");
const { sendEmail } = require("../utils/mailer");

const REMINDER_WINDOW_DAYS = 3;

/**
 * Finds hospitals on trial whose trialEndDate falls within the next
 * REMINDER_WINDOW_DAYS days, and emails every platform_super_admin a
 * summary. Exported as a plain function (not just a cron callback) so it
 * can also be triggered manually for testing, or later from a Vercel
 * Cron Job hitting an endpoint instead of node-cron in production.
 */
async function checkTrialsEndingSoon() {
  const now = new Date();
  const windowEnd = new Date(now.getTime() + REMINDER_WINDOW_DAYS * 24 * 60 * 60 * 1000);

  const endingSoon = await Hospital.find({
    status: "trial",
    trialEndDate: { $gte: now, $lte: windowEnd },
  });

  if (endingSoon.length === 0) {
    return { checked: true, hospitalsFound: 0 };
  }

  const superAdmins = await User.find({ role: "platform_super_admin", status: "active" }).setOptions({
    skipTenantScope: true,
  });

  const listHtml = endingSoon
    .map((h) => `<li>${h.name} — trial ends ${h.trialEndDate.toDateString()}</li>`)
    .join("");

  const subject = `${endingSoon.length} hospital trial(s) ending within ${REMINDER_WINDOW_DAYS} days`;
  const html = `<p>The following hospitals are on trial and ending soon:</p><ul>${listHtml}</ul>`;

  await Promise.all(superAdmins.map((admin) => sendEmail({ to: admin.email, subject, html })));

  return { checked: true, hospitalsFound: endingSoon.length, notified: superAdmins.length };
}

module.exports = { checkTrialsEndingSoon };