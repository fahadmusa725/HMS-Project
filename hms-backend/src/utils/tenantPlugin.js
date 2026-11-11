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
 *     distinct, etc.) it injects hospitalId into the filter - so a query
 *     simply CANNOT return another hospital's data.
 *  3. On every write (save/create) it auto-sets hospitalId from the
 *     current request context if not explicitly provided.
 *  4. Aggregations are NOT rewritten (a pipeline can't be safely patched);
 *     instead every aggregate on a tenant-owned model must start with a
 *     $match on the current hospitalId, or the hook throws.
 *  5. If there is no tenant context at all (e.g. a background script,
 *     or the Platform Super Admin's own request), it throws rather
 *     than silently returning unscoped data - fail loud, not leaky.
 *     Genuinely cross-tenant work opts out explicitly with
 *     `.setOptions({ skipTenantScope: true })` (queries) or
 *     `.option({ skipTenantScope: true })` (aggregates).
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
  "findOneAndReplace",
  "replaceOne",
  "count",
  "countDocuments",
  "distinct",
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

  // Aggregations run through a different code path where a filter cannot be
  // injected safely, so the rule is inverted: the pipeline itself must start by
  // matching this hospital, otherwise the whole aggregate is refused.
  schema.pre("aggregate", function (next) {
    if (this.options && this.options.skipTenantScope) {
      return next();
    }

    const hospitalId = getCurrentHospitalId();

    if (!hospitalId) {
      if (strict) {
        return next(
          new Error(
            "Tenant context missing: refusing to run an unscoped aggregate on a tenant-owned collection. " +
              "Use .option({ skipTenantScope: true }) for an intentional cross-tenant job."
          )
        );
      }
      return next();
    }

    const firstStage = this.pipeline()[0];
    const matchedHospitalId = firstStage && firstStage.$match && firstStage.$match.hospitalId;

    if (!matchedHospitalId || String(matchedHospitalId) !== String(hospitalId)) {
      return next(
        new Error(
          "Tenant-scoped aggregate must start with { $match: { hospitalId } } for the current hospital."
        )
      );
    }

    next();
  });

  // Auto-stamp hospitalId BEFORE validation runs. Mongoose's document
  // lifecycle is: pre-validate -> validate -> pre-save -> actual save.
  // Since hospitalId is a required field, it must be set in pre-validate,
  // not pre-save - by the time pre-save fires, validation has already
  // happened and would reject the document as missing hospitalId.
  schema.pre("validate", function (next) {
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