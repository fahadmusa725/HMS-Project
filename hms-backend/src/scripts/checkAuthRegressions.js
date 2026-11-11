/**
 * Regression checks for the auth hardening: forgot-password delivery path, login
 * lockout and the client countdown data. Run: `npm run check:auth`
 *
 * Standalone and repeatable: it creates two throwaway platform_super_admin users,
 * drives the real app over HTTP against the configured database, then deletes them.
 * Email credentials are cleared in-process so nothing is actually sent - the checks
 * assert the flow reaches the mailer and records the outcome server-side.
 */
require("dotenv").config();
delete process.env.EMAIL_USER;
delete process.env.EMAIL_PASS;

const mongoose = require("mongoose");
const app = require("../app");
const User = require("../models/User");
const { hashToken } = require("../utils/security");

const STAMP = Date.now();
const ACTIVE_EMAIL = `__auth_check_${STAMP}@example.test`;
const DISABLED_EMAIL = `__auth_check_disabled_${STAMP}@example.test`;
const PASSWORD = "CheckPass123";
const NEW_PASSWORD = "CheckPass456";
const TEST_RESET_TOKEN = `check-reset-token-${STAMP}`;

let failures = 0;

function check(label, ok, detail) {
  if (ok) {
    console.log(`PASS  ${label}`);
  } else {
    failures += 1;
    console.log(`FAIL  ${label}${detail ? ` - ${detail}` : ""}`);
  }
}

async function main() {
  await mongoose.connect(process.env.MONGO_URI, { serverSelectionTimeoutMS: 10000 });

  const created = await User.create([
    { name: "Auth Check", email: ACTIVE_EMAIL, password: PASSWORD, role: "platform_super_admin", status: "active" },
    { name: "Auth Check Disabled", email: DISABLED_EMAIL, password: PASSWORD, role: "platform_super_admin", status: "disabled" },
  ]);
  const userId = created[0]._id;

  const server = app.listen(0);
  const base = `http://127.0.0.1:${server.address().port}`;

  async function post(path, body, token) {
    const res = await fetch(`${base}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify(body),
    });
    return { status: res.status, body: await res.json(), headers: res.headers };
  }

  async function get(path, token) {
    const res = await fetch(`${base}${path}`, { headers: { Authorization: `Bearer ${token}` } });
    return { status: res.status, body: await res.json() };
  }

  const readUser = (id) =>
    User.findById(id)
      .setOptions({ skipTenantScope: true })
      .select("+resetTokenHash +resetTokenExpiresAt")
      .lean();

  try {
    // --- 1. forgot password -------------------------------------------------
    const logs = [];
    const realConsole = { log: console.log, error: console.error, warn: console.warn };
    const capture = (...args) => logs.push(args.join(" "));
    console.log = capture;
    console.error = capture;
    console.warn = capture;

    const unknown = await post("/api/auth/forgot-password", { email: `nobody_${STAMP}@example.test` });
    const known = await post("/api/auth/forgot-password", { email: ACTIVE_EMAIL });
    const disabled = await post("/api/auth/forgot-password", { email: DISABLED_EMAIL });

    console.log = realConsole.log;
    console.error = realConsole.error;
    console.warn = realConsole.warn;

    check("forgot-password answers 200 for an unknown email", unknown.status === 200);
    check("forgot-password answers 200 for a real account", known.status === 200);
    check(
      "the answer is identical for known and unknown emails (no enumeration)",
      known.body.message === unknown.body.message && known.body.message === disabled.body.message,
      `${known.body.message} vs ${unknown.body.message}`
    );

    const activeAfterReset = await readUser(userId);
    check("a reset token is issued for the real account", Boolean(activeAfterReset.resetTokenHash));

    const disabledRow = await User.findOne({ email: DISABLED_EMAIL }).setOptions({ skipTenantScope: true })
      .select("+resetTokenHash").lean();
    check("a disabled account also gets a reset link (no silent skip)", Boolean(disabledRow.resetTokenHash));

    check(
      "the mail outcome is logged server-side",
      logs.some((line) => line.includes("[Auth] Password reset email NOT sent") && line.includes(ACTIVE_EMAIL)),
      logs.join(" | ")
    );
    check(
      "the response never carries the reset token or mail error",
      !JSON.stringify(known.body).includes(activeAfterReset.resetTokenHash) && !/reason|smtp/i.test(JSON.stringify(known.body))
    );

    // --- 2. lockout ---------------------------------------------------------
    const good = await post("/api/auth/login", { email: ACTIVE_EMAIL, password: PASSWORD });
    check("login with the right password works before any lock", good.status === 200, `status ${good.status}`);
    const token = good.body.token;

    let wrongStatus = 0;
    let leaky = false;
    for (let i = 0; i < 5; i += 1) {
      const r = await post("/api/auth/login", { email: ACTIVE_EMAIL, password: "definitely-wrong" });
      wrongStatus = r.status;
      if (r.body.retryAfter !== undefined || r.body.code) leaky = true;
    }
    check("the 5th wrong password still answers the generic 401", wrongStatus === 401, `status ${wrongStatus}`);
    check("wrong-password responses carry no lock metadata", !leaky);

    const lockedCorrect = await post("/api/auth/login", { email: ACTIVE_EMAIL, password: PASSWORD });
    check(
      "the correct password on a locked account answers 429",
      lockedCorrect.status === 429 && lockedCorrect.body.code === "ACCOUNT_LOCKED",
      `status ${lockedCorrect.status}`
    );
    check(
      "the lock response carries retryAfter seconds",
      Number.isInteger(lockedCorrect.body.retryAfter) && lockedCorrect.body.retryAfter > 0 && lockedCorrect.body.retryAfter <= 15 * 60,
      String(lockedCorrect.body.retryAfter)
    );
    check("the lock response sets a Retry-After header", Boolean(lockedCorrect.headers.get("retry-after")));

    const lockBefore = (await readUser(userId)).lockUntil;
    await new Promise((resolve) => setTimeout(resolve, 1100));
    const lockedAgain = await post("/api/auth/login", { email: ACTIVE_EMAIL, password: "definitely-wrong" });
    const lockAfter = (await readUser(userId)).lockUntil;
    check("attempts while locked also answer 429", lockedAgain.status === 429);
    check(
      "attempts while locked do not extend lockUntil",
      String(lockBefore) === String(lockAfter),
      `${lockBefore} -> ${lockAfter}`
    );

    // --- 4. an existing session survives the lock ---------------------------
    const me = await get("/api/auth/me", token);
    check("/api/auth/me still works for an already logged-in user while locked", me.status === 200, `status ${me.status}`);

    const noToken = await fetch(`${base}/api/auth/me`);
    check("/api/auth/me still rejects a request without a token", noToken.status === 401);

    // --- 2b. expiry resets the counter --------------------------------------
    await User.updateOne(
      { _id: userId },
      { $set: { failedLoginAttempts: 5, lockUntil: new Date(Date.now() - 1000) } },
      { skipTenantScope: true }
    );
    const afterExpiry = await post("/api/auth/login", { email: ACTIVE_EMAIL, password: PASSWORD });
    const afterExpiryRow = await readUser(userId);
    check("a correct login after the lock expired succeeds", afterExpiry.status === 200, `status ${afterExpiry.status}`);
    check(
      "a successful login after expiry resets the counter and the lock",
      afterExpiryRow.failedLoginAttempts === 0 && !afterExpiryRow.lockUntil,
      `${afterExpiryRow.failedLoginAttempts}/${afterExpiryRow.lockUntil}`
    );

    // --- 2c. a password reset clears the lock -------------------------------
    await User.updateOne(
      { _id: userId },
      {
        $set: {
          failedLoginAttempts: 5,
          lockUntil: new Date(Date.now() + 10 * 60 * 1000),
          resetTokenHash: hashToken(TEST_RESET_TOKEN),
          resetTokenExpiresAt: new Date(Date.now() + 10 * 60 * 1000),
        },
      },
      { skipTenantScope: true }
    );
    const reset = await post("/api/auth/reset-password", { token: TEST_RESET_TOKEN, newPassword: NEW_PASSWORD });
    const afterResetRow = await readUser(userId);
    check("a valid reset token is accepted", reset.status === 200, `status ${reset.status}`);
    check(
      "a password reset clears the lock and the counter",
      afterResetRow.failedLoginAttempts === 0 && !afterResetRow.lockUntil,
      `${afterResetRow.failedLoginAttempts}/${afterResetRow.lockUntil}`
    );
    const loginNew = await post("/api/auth/login", { email: ACTIVE_EMAIL, password: NEW_PASSWORD });
    check("the new password logs in immediately after a locked-out reset", loginNew.status === 200, `status ${loginNew.status}`);
    const loginOld = await post("/api/auth/login", { email: ACTIVE_EMAIL, password: PASSWORD });
    check("the old password no longer works", loginOld.status === 401);

    // --- unknown emails stay generic ---------------------------------------
    const unknownLogin = await post("/api/auth/login", { email: `nobody_${STAMP}@example.test`, password: "whatever" });
    check(
      "an unknown email still answers the generic 401 with no lock metadata",
      unknownLogin.status === 401 && unknownLogin.body.message === "Invalid credentials." && !unknownLogin.body.code,
      `${unknownLogin.status} ${JSON.stringify(unknownLogin.body)}`
    );

    server.close();
  } finally {
    server.close();
    await User.deleteMany({ email: { $in: [ACTIVE_EMAIL, DISABLED_EMAIL] } }).setOptions({ skipTenantScope: true });
    await mongoose.disconnect();
  }

  console.log(failures === 0 ? "\nAll auth regression checks passed." : `\n${failures} check(s) failed.`);
  process.exitCode = failures === 0 ? 0 : 1;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
