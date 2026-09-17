const nodemailer = require("nodemailer");

let transporter = null;

function getTransporter() {
  if (transporter) return transporter;

  if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
    return null; // not configured yet - caller falls back to console logging
  }

  transporter = nodemailer.createTransport({
    host: process.env.EMAIL_HOST,
    port: Number(process.env.EMAIL_PORT) || 587,
    secure: false,
    auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS },
  });

  return transporter;
}

/**
 * Sends an email, or - if EMAIL_USER/EMAIL_PASS aren't set in .env yet -
 * just logs what WOULD have been sent to the console. This lets every
 * notification feature be built and tested right away without requiring
 * real email credentials, and starts actually sending the moment
 * credentials are added later, with no code changes needed.
 */
async function sendEmail({ to, subject, html }) {
  const t = getTransporter();

  if (!t) {
    console.log(`\n📧 [Email not configured - would have sent]\nTo: ${to}\nSubject: ${subject}\n${html}\n`);
    return { sent: false, reason: "Email credentials not configured in .env" };
  }

  try {
    await t.sendMail({ from: process.env.EMAIL_USER, to, subject, html });
    return { sent: true };
  } catch (err) {
    console.error("[Mailer] Failed to send email:", err.message);
    return { sent: false, reason: err.message };
  }
}

module.exports = { sendEmail };