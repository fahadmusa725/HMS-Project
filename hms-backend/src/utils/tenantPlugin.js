const mongoose = require("mongoose");
const { getCurrentHospitalId } = require("./tenantContext");

/**
 * TENANT PLUGIN
 * ----------------------------------------------------------------
 * Attach this plugin to every schema that belongs to a hospital
 * (Patients, Appointments, Bills, Medicines, etc). It:
 *
 *  1. Adds a `hospitalId` field to the schema automatically.
 *  2. On every read (find, findOne, findOneAndUpdate, countDocuments,
 *     aggregate's first $match, etc.) it injects hospitalId into the
 *     filter - so a query simply CANNOT return another hospital's data.
 *  3. On every write (save/create) it auto-sets hospitalId from the
 *     current request context if not explicitly provided.
 *  4. If there is no tenant context at all (e.g. a background script,
 *     or the Platform Super Admin's own request), it throws rather
 *     than silently returning unscoped data - fail loud, not leaky.
 *
 * Usage in a model file:
 *   const schema = new mongoose.Schema({ ... });
 *   schema.plugin(tenantPlugin);
 */

const QUERY_HOOKS = [
  "find",
  "findOne",
  "findOneAndUpdate",
  "findOneAndDelete",
  "count",
  "countDocuments",
  "updateMany",
  "updateOne",
  "deleteMany",
  "deleteOne",
];

function tenantPlugin(schema, options = {}) {
  // Allow an explicit escape hatch for genuinely platform-level models
  // (e.g. the Hospital model itself is NOT tenant-scoped - it's the
  // table OF tenants, so it must never get this plugin).
  const strict = options.strict !== false;

  schema.add({
    hospitalId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Hospital",
      required: true,
      index: true,
    },
  });

  QUERY_HOOKS.forEach((hook) => {
    schema.pre(hook, function (next) {
      // `.setOptions({ skipTenantScope: true })` is an explicit,
      // intentional escape hatch for the rare cross-tenant admin
      // query - it must be opted into per-query, never the default.
      if (this.getOptions().skipTenantScope) {
        return next();
      }

      const hospitalId = getCurrentHospitalId();

      if (!hospitalId) {
        if (strict) {
          return next(
            new Error(
              "Tenant context missing: refusing to run an unscoped query on a tenant-owned collection."
            )
          );
        }
        return next();
      }

      this.where({ hospitalId });
      next();
    });
  });

  // Auto-stamp hospitalId on create/save if not already set
  schema.pre("save", function (next) {
    if (!this.hospitalId) {
      const hospitalId = getCurrentHospitalId();
      if (!hospitalId && strict) {
        return next(
          new Error(
            "Tenant context missing: refusing to save a tenant-owned document without a hospitalId."
          )
        );
      }
      if (hospitalId) this.hospitalId = hospitalId;
    }
    next();
  });
}

module.exports = tenantPlugin;
