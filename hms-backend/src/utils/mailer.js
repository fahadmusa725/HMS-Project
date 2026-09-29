const nodemailer = require("nodemailer");

let transporter = null;

function getTransporter() {
  if (transporter) return transporter;

  if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
    return null; // not configured yet - caller falls back to console logging
  }

  const port = Number(process.env.EMAIL_PORT) || 587;
  transporter = nodemailer.createTransport({
    host: process.env.EMAIL_HOST || "smtp.gmail.com",
    port,
    secure: port === 465, // 465 = implicit TLS; 587 = STARTTLS
    // Gmail shows App Passwords as "abcd efgh ijkl mnop" - accept it pasted with or without the spaces.
    auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS.replace(/\s+/g, "") },
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
    // EMAIL_FROM_NAME is just the display name ("CareFlow HMS"); Gmail requires the address itself to be EMAIL_USER.
    const from = process.env.EMAIL_FROM_NAME
      ? `"${process.env.EMAIL_FROM_NAME}" <${process.env.EMAIL_USER}>`
      : process.env.EMAIL_USER;
    await t.sendMail({ from, to, subject, html });
    return { sent: true };
  } catch (err) {
    console.error("[Mailer] Failed to send email:", err.message);
    return { sent: false, reason: err.message };
  }
}

module.exports = { sendEmail };