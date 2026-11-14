const User = require("../models/User");
const Hospital = require("../models/Hospital");

/**
 * Account / tenant access checks shared by login and every authenticated request.
 *
 * Cost: one indexed User._id lookup plus (for hospital users) one Hospital._id
 * lookup. On serverless that would be two extra round trips on EVERY request, so
 * the resolved decision is cached in-process for CACHE_TTL_MS. Tradeoff: a user
 * disabled or a hospital suspended while an instance is warm stays usable for at
 * most CACHE_TTL_MS on that instance. A cold instance always reads from the DB.
 * The cache is per-instance only (memory cannot be shared across serverless
 * instances) - which is acceptable for a 30-60s staleness window and needs no
 * extra infrastructure. Staff status/role changes and password changes call
 * invalidateAccessCache() so they take effect immediately on the instance that
 * handled the write.
 */
const CACHE_TTL_MS = 45 * 1000;
const MAX_CACHE_ENTRIES = 2000;

// Kept on global so a warm serverless invocation reuses it across module reloads.
const cache = global.__hmsAccessCache || (global.__hmsAccessCache = new Map());

const BLOCK_MESSAGES = {
  ACCOUNT_DISABLED: "Your account has been disabled. Contact your hospital administrator.",
  HOSPITAL_SUSPENDED: "This hospital's account is suspended. Contact the platform administrator.",
  TRIAL_EXPIRED: "This hospital's free trial has expired. Contact the platform administrator.",
  HOSPITAL_MISSING: "This hospital's account is no longer available. Contact the platform administrator.",
};

function hospitalBlock(hospital) {
  if (!hospital) return { code: "HOSPITAL_SUSPENDED", message: BLOCK_MESSAGES.HOSPITAL_MISSING };
  if (hospital.status === "suspended") {
    return { code: "HOSPITAL_SUSPENDED", message: BLOCK_MESSAGES.HOSPITAL_SUSPENDED };
  }
  if (hospital.status === "trial" && hospital.trialEndDate && new Date() > hospital.trialEndDate) {
    return { code: "TRIAL_EXPIRED", message: BLOCK_MESSAGES.TRIAL_EXPIRED };
  }
  return null;
}

/**
 * Why this user may not use the platform right now, or null if they may.
 * The platform super admin is deliberately exempt from hospital checks.
 */
async function resolveAccessBlock(user) {
  if (user.status !== "active") {
    return {
      code: "ACCOUNT_DISABLED",
      message:
        user.status === "invited"
          ? "Your account has not been activated yet. Contact your hospital administrator."
          : BLOCK_MESSAGES.ACCOUNT_DISABLED,
    };
  }
  if (user.role === "platform_super_admin") return null;

  const hospital = user.hospitalId ? await Hospital.findById(user.hospitalId) : null;
  return hospitalBlock(hospital);
}

function setCachedIdentity(userId, identity) {
  if (cache.size >= MAX_CACHE_ENTRIES) cache.clear();
  cache.set(String(userId), { at: Date.now(), identity });
}

function invalidateAccessCache(userId) {
  cache.delete(String(userId));
}

/**
 * Cached { userId, role, hospitalId, mustChangePassword, block } for a token's
 * user. Returns null when the user no longer exists. Role/hospitalId come from
 * the database, not the token, so a demotion or move applies within one TTL.
 */
async function getRequestIdentity(userId) {
  const key = String(userId);
  const cached = cache.get(key);
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) return cached.identity;

  const user = await User.findById(userId);
  if (!user) {
    invalidateAccessCache(key);
    return null;
  }

  const identity = {
    userId: String(user._id),
    name: user.name,
    role: user.role,
    hospitalId: user.hospitalId ? String(user.hospitalId) : null,
    mustChangePassword: Boolean(user.mustChangePassword),
    block: await resolveAccessBlock(user),
  };

  setCachedIdentity(key, identity);
  return identity;
}

module.exports = {
  resolveAccessBlock,
  getRequestIdentity,
  invalidateAccessCache,
  CACHE_TTL_MS,
};
