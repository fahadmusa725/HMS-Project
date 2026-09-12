const mongoose = require("mongoose");

/**
 * Generic atomic counter, scoped per hospital + counter name.
 * e.g. { hospitalId: X, name: "patient_mrn", seq: 42 }
 *      { hospitalId: X, name: "opd_token_2026-09-05", seq: 7 }
 *
 * NOT tenant-plugin-scoped (it's an internal utility collection), but every
 * document still carries hospitalId manually so counters never collide or
 * leak across hospitals.
 */
const counterSchema = new mongoose.Schema({
  hospitalId: { type: mongoose.Schema.Types.ObjectId, required: true },
  name: { type: String, required: true },
  seq: { type: Number, default: 0 },
});

counterSchema.index({ hospitalId: 1, name: 1 }, { unique: true });

const Counter = mongoose.model("Counter", counterSchema);

/** Atomically increment and return the next number for (hospitalId, name). */
async function getNextSequence(hospitalId, name) {
  const doc = await Counter.findOneAndUpdate(
    { hospitalId, name },
    { $inc: { seq: 1 } },
    { new: true, upsert: true }
  );
  return doc.seq;
}

module.exports = { Counter, getNextSequence };
