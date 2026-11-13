const mongoose = require("mongoose");

/**
 * Generic atomic counter, scoped per hospital + counter name.
 * e.g. { hospitalId: X, name: "patient_mrn", seq: 42 }
 *      { hospitalId: X, name: "opd_token_<doctorId>_2026-09-05", seq: 7 }
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

/**
 * Best-effort rollback of an allocation that never became a token (e.g. the appointment
 * write failed). Only decrements when this is still the most recent number, so two
 * concurrent bookings can never be handed the same token. If a later booking already
 * took the next number the rollback is skipped and the token stays a harmless gap -
 * token gaps are accepted by design: the counter is monotonic, and unlike re-use a gap
 * can never make two patients share a number.
 */
async function releaseSequence(hospitalId, name, seq) {
  if (!Number.isInteger(seq)) return;
  await Counter.updateOne({ hospitalId, name, seq }, { $inc: { seq: -1 } });
}

module.exports = { Counter, getNextSequence, releaseSequence };
