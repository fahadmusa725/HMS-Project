const mongoose = require("mongoose");
const tenantPlugin = require("../utils/tenantPlugin");

/**
 * Digital pre-check: the patient fills in symptoms, self-reported vitals and (optional)
 * reports from home, before the visit.
 *
 * Stored as its own collection rather than embedded in Appointment on purpose:
 *  - Appointments are the hottest documents in the system (the queue polls them every 12s
 *    and the public TV endpoint reads them for every screen), so multi-KB symptom text and
 *    attachment metadata stay out of that read path.
 *  - A pre-check has a lifecycle of its own (draft -> submitted -> locked, staff vitals,
 *    Cloudinary asset cleanup on cancellation), while the appointment moves through a
 *    status state machine that rewrites it with $set.
 * The 1:1 relationship is still enforced by the unique index on appointmentId below.
 */

// Self-reported by the patient, or measured at the desk - same shape, different meaning.
const vitalsSchema = new mongoose.Schema(
  {
    temperature: { type: String, trim: true, maxlength: 40 },
    bloodPressure: { type: String, trim: true, maxlength: 40 },
    pulse: { type: String, trim: true, maxlength: 40 },
    weight: { type: String, trim: true, maxlength: 40 },
  },
  { _id: false }
);

// Only the Cloudinary handle is stored - the file itself is never public.
const attachmentSchema = new mongoose.Schema(
  {
    publicId: { type: String, required: true },
    resourceType: { type: String, required: true, default: "image" }, // image | raw (PDF)
    format: { type: String }, // "pdf" | "jpg" | "png"
    mimeType: { type: String },
    originalName: { type: String, trim: true },
    bytes: { type: Number },
    uploadedAt: { type: Date, default: Date.now },
  },
  { _id: true }
);

const preCheckSchema = new mongoose.Schema(
  {
    appointmentId: { type: mongoose.Schema.Types.ObjectId, ref: "Appointment", required: true },
    patientId: { type: mongoose.Schema.Types.ObjectId, ref: "Patient", required: true },
    doctorId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },

    // Only symptom text is required, and the controller enforces it when the patient
    // submits. The schema leaves it optional so staff can record vitals at the desk
    // before (or instead of) a patient submission.
    symptoms: { type: String, trim: true, maxlength: 2000 },
    duration: { type: String, trim: true, maxlength: 120 },

    patientVitals: vitalsSchema,
    staffVitals: vitalsSchema,
    staffVitalsBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    staffVitalsAt: { type: Date },

    attachments: [attachmentSchema],

    consentAccepted: { type: Boolean, default: false },
    consentAcceptedAt: { type: Date },
    // Stamped only by the patient's own submission - what the portal shows as "submitted".
    submittedAt: { type: Date },
    lastEditedByRole: { type: String },
    // Set when a cancellation deleted the Cloudinary files behind this pre-check.
    attachmentsPurgedAt: { type: Date },
  },
  { timestamps: true }
);

preCheckSchema.plugin(tenantPlugin);

// One pre-check per appointment, enforced by the database (not just the controller).
preCheckSchema.index({ hospitalId: 1, appointmentId: 1 }, { unique: true });
preCheckSchema.index({ hospitalId: 1, patientId: 1, createdAt: -1 });

module.exports = mongoose.model("PreCheck", preCheckSchema);
