const crypto = require("crypto");
const User = require("../models/User");
const Hospital = require("../models/Hospital");
const generateToken = require("../utils/generateToken");
const { sendEmail } = require("../utils/mailer");
const { escapeHtml, hashToken, safeCompare } = require("../utils/security");
const { resolveAccessBlock, invalidateAccessCache } = require("../utils/accountAccess");

const MIN_PASSWORD_LENGTH = 8;
const MAX_FAILED_ATTEMPTS = 5;
const LOCK_DURATION_MS = 15 * 60 * 1000;
const RESET_TOKEN_TTL_MS = 60 * 60 * 1000;

const INVALID_CREDENTIALS = "Invalid credentials.";
// Same answer for "wrong password", "locked account" and "no such account" so the
// endpoint can't be used to discover which emails have accounts.
const RESET_REQUESTED_MESSAGE =
  "If an account with that email exists, a password reset link has been sent to it.";

function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || ""));
}

/** The user's hospital name plus its subscription state, so the dashboard can warn about an ending trial. */
async function resolveHospital(hospitalId) {
  const none = { hospitalName: null, hospitalStatus: null, trialEndDate: null };
  if (!hospitalId) return none;
  const hospital = await Hospital.findById(hospitalId);
  if (!hospital) return none;
  return { hospitalName: hospital.name, hospitalStatus: hospital.status, trialEndDate: hospital.trialEndDate || null };
}

/**
 * Counts a failed attempt and locks the account after MAX_FAILED_ATTEMPTS.
 * The counter is deliberately left at MAX while locked: after the lock expires one
 * more failure locks the account again instead of handing out a fresh five guesses.
 * Only a successful login or a password reset clears it.
 */
async function recordFailedLogin(user) {
  const updated = await User.findOneAndUpdate(
    { _id: user._id },
    { $inc: { failedLoginAttempts: 1 } },
    { new: true, skipTenantScope: true }
  ).select("failedLoginAttempts");

  if (updated && updated.failedLoginAttempts >= MAX_FAILED_ATTEMPTS) {
    await User.updateOne(
      { _id: user._id },
      { $set: { lockUntil: new Date(Date.now() + LOCK_DURATION_MS) } },
      { skipTenantScope: true }
    );
  }
}

/**
 * Login works the same for every role including platform_super_admin.
 * Because User.hospitalId is scoped by tenantPlugin on READS, and we
 * don't yet have a tenant context at login time (nobody is logged in
 * yet!), we must explicitly bypass tenant scoping here with
 * { skipTenantScope: true } - this is the one legitimate place it's
 * needed, since login is inherently a cross-tenant lookup by email.
 */
async function login(req, res) {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ message: "Email and password are required." });
    }

    const user = await User.findOne({ email: String(email).trim().toLowerCase() })
      .setOptions({ skipTenantScope: true })
      .select("+password");

    if (!user) {
      return res.status(401).json({ message: INVALID_CREDENTIALS });
    }

    // A still-locked account answers 429 instead of the generic 401 so the user is
    // not left retyping a correct password. This only reveals that an account the
    // caller already targeted exists; unknown emails keep the 401 below.
    // Nothing here touches the counters, so attempts made while locked never
    // extend lockUntil.
    if (user.lockUntil && user.lockUntil > new Date()) {
      const retryAfter = Math.max(1, Math.ceil((user.lockUntil.getTime() - Date.now()) / 1000));
      res.set("Retry-After", String(retryAfter));
      return res.status(429).json({
        code: "ACCOUNT_LOCKED",
        message: "Too many failed login attempts. Your account is locked for a short time - try again shortly or reset your password.",
        retryAfter,
      });
    }

    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      await recordFailedLogin(user);
      return res.status(401).json({ message: INVALID_CREDENTIALS });
    }

    // Checked only AFTER the password is known to be correct, so these clearer
    // messages never help someone who is merely guessing emails.
    const block = await resolveAccessBlock(user);
    if (block) {
      return res.status(403).json(block);
    }

    if (user.failedLoginAttempts || user.lockUntil) {
      await User.updateOne(
        { _id: user._id },
        { $set: { failedLoginAttempts: 0, lockUntil: null } },
        { skipTenantScope: true }
      );
    }

    // Drop any cached status from a previous session so the next request is
    // judged on the account as it is now.
    invalidateAccessCache(user._id);

    const token = generateToken(user);
    const hospitalInfo = await resolveHospital(user.hospitalId);

    res.json({
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        hospitalId: user.hospitalId,
        mustChangePassword: Boolean(user.mustChangePassword),
        ...hospitalInfo, // hospitalName ("City Hospital"), hospitalStatus, trialEndDate - null for platform_super_admin
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error during login." });
  }
}

/**
 * Fetch the current user's fresh profile + hospital name at any time
 * (not just at login) - useful for the frontend to re-hydrate identity
 * info (e.g. after a page refresh) without forcing a re-login.
 */
async function getMe(req, res) {
  try {
    const user = await User.findById(req.user.userId).setOptions({ skipTenantScope: true });
    if (!user) return res.status(404).json({ message: "User not found." });

    const hospitalInfo = await resolveHospital(user.hospitalId);

    res.json({
      id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      hospitalId: user.hospitalId,
      mustChangePassword: Boolean(user.mustChangePassword),
      ...hospitalInfo,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error while fetching profile." });
  }
}

/** Change your own password - available to every role, forced after a temp password. */
async function changePassword(req, res) {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ message: "Current password and new password are required." });
    }
    if (String(newPassword).length < MIN_PASSWORD_LENGTH) {
      return res
        .status(400)
        .json({ message: `New password must be at least ${MIN_PASSWORD_LENGTH} characters.` });
    }
    if (currentPassword === newPassword) {
      return res.status(400).json({ message: "New password must be different from the current one." });
    }

    const user = await User.findById(req.user.userId).select("+password");
    if (!user) return res.status(404).json({ message: "User not found." });

    const isMatch = await user.comparePassword(currentPassword);
    if (!isMatch) {
      return res.status(400).json({ message: "Current password is incorrect." });
    }

    user.password = newPassword;
    user.mustChangePassword = false;
    await user.save();
    invalidateAccessCache(user._id);

    res.json({ message: "Password updated." });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error while changing your password." });
  }
}

/**
 * Start a password reset. Always answers with the same message so this endpoint
 * cannot be used to find out whether an email has an account.
 */
async function forgotPassword(req, res) {
  try {
    const email = String(req.body.email || "").trim().toLowerCase();
    if (!isValidEmail(email)) {
      return res.status(400).json({ message: "Please enter a valid email address." });
    }

    // Every account gets a link, whatever its status: a disabled or invited user is
    // still refused at login (resolveAccessBlock), so mailing them a reset changes no
    // access decision - it just means the endpoint keeps one single answer, and a
    // locked user can always recover on their own.
    const user = await User.findOne({ email }).setOptions({ skipTenantScope: true });

    if (user) {
      const token = crypto.randomBytes(32).toString("hex");

      await User.updateOne(
        { _id: user._id },
        {
          $set: {
            resetTokenHash: hashToken(token),
            resetTokenExpiresAt: new Date(Date.now() + RESET_TOKEN_TTL_MS),
          },
        },
        { skipTenantScope: true }
      );

      const origin = (process.env.CLIENT_URL || "")
        .split(",")[0]
        .trim()
        .replace(/\/+$/, "");
      const resetUrl = `${origin}/reset-password?token=${token}`;

      // A deployed backend with the dev origin still in CLIENT_URL mails out links to
      // localhost: the mail "works" but the link can never open. Say so in the log.
      if (process.env.NODE_ENV === "production" && /localhost|127\.0\.0\.1/.test(origin)) {
        console.warn(`[Auth] Reset links point at ${origin} - CLIENT_URL should list the public frontend URL in production.`);
      }

      // The send result is only ever recorded server-side. The client gets the same
      // message either way, so a mail failure is never an oracle for account existence.
      const result = await sendEmail({
        to: user.email,
        subject: "Reset your CareFlow HMS password",
        html: `
          <p>Hello ${escapeHtml(user.name)},</p>
          <p>Use the link below to set a new password. It works once and expires in 60 minutes.</p>
          <p><a href="${escapeHtml(resetUrl)}">Reset my password</a></p>
          <p>If you did not ask for this, you can ignore this email - your password stays unchanged.</p>
        `,
      });

      if (result.sent) {
        console.log(`[Auth] Password reset email sent to ${user.email}`);
      } else {
        console.error(`[Auth] Password reset email NOT sent to ${user.email}: ${result.reason}`);
      }
    } else {
      console.warn(`[Auth] Password reset requested for an email with no account: ${email}`);
    }

    res.json({ message: RESET_REQUESTED_MESSAGE });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error while starting the password reset." });
  }
}

/** Finish a password reset with the single-use token from the email. */
async function resetPassword(req, res) {
  try {
    const { token, newPassword } = req.body;

    if (!token || !newPassword) {
      return res.status(400).json({ message: "Reset token and new password are required." });
    }
    if (String(newPassword).length < MIN_PASSWORD_LENGTH) {
      return res.status(400).json({ message: `Password must be at least ${MIN_PASSWORD_LENGTH} characters.` });
    }

    const user = await User.findOne({ resetTokenHash: hashToken(token) })
      .setOptions({ skipTenantScope: true })
      .select("+password +resetTokenHash +resetTokenExpiresAt");

    const expired = !user || !user.resetTokenExpiresAt || user.resetTokenExpiresAt < new Date();
    if (expired) {
      return res.status(400).json({ message: "This reset link is invalid or has expired. Please request a new one." });
    }
    if (!safeCompare(hashToken(token), user.resetTokenHash)) {
      return res.status(400).json({ message: "This reset link is invalid or has expired. Please request a new one." });
    }

    // A completed reset clears the brute-force state too, so a user who locked
    // themselves out is back in immediately with the password they just chose.
    user.password = newPassword;
    user.mustChangePassword = false;
    user.failedLoginAttempts = 0;
    user.lockUntil = undefined;
    user.resetTokenHash = undefined;
    user.resetTokenExpiresAt = undefined;
    await user.save();
    invalidateAccessCache(user._id);

    res.json({ message: "Password reset. You can now log in with your new password." });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error while resetting your password." });
  }
}

module.exports = { login, getMe, changePassword, forgotPassword, resetPassword };
