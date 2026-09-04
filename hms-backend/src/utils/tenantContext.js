const { AsyncLocalStorage } = require("async_hooks");

/**
 * TENANT CONTEXT
 * ----------------------------------------------------------------
 * This is the heart of data isolation between hospitals.
 *
 * We use Node's AsyncLocalStorage to store the current request's
 * hospitalId (and role/userId) in a way that's automatically
 * available to any code running during that request - including
 * deep inside Mongoose query hooks - WITHOUT having to manually
 * pass hospitalId through every function call.
 *
 * Flow:
 *  1. authMiddleware verifies the JWT and learns the user's hospitalId.
 *  2. runWithTenantContext() wraps the rest of the request in a
 *     context that carries that hospitalId.
 *  3. tenantPlugin.js (applied to every tenant-scoped Mongoose model)
 *     reads getTenantContext() inside pre-hooks and automatically
 *     injects { hospitalId } into every query/document.
 *
 * Result: a developer writing `Patient.find({ name: "Ali" })` gets
 * results automatically scoped to the logged-in user's hospital -
 * it is structurally impossible to forget the scoping, because it
 * isn't left to the developer to remember per-query.
 */

const tenantStorage = new AsyncLocalStorage();

function runWithTenantContext(context, callback) {
  return tenantStorage.run(context, callback);
}

function getTenantContext() {
  return tenantStorage.getStore();
}

/** Convenience: current hospitalId, or null if running outside a request
 *  (e.g. the seed script) or if the caller is the Platform Super Admin
 *  (who is intentionally NOT scoped to any single hospital). */
function getCurrentHospitalId() {
  const ctx = getTenantContext();
  return ctx ? ctx.hospitalId : null;
}

module.exports = {
  runWithTenantContext,
  getTenantContext,
  getCurrentHospitalId,
};
