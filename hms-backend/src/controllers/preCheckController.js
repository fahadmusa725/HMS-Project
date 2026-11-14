const path = require("path");
const PreCheck = require("../models/PreCheck");
const Appointment = require("../models/Appointment");
const Patient = require("../models/Patient");
const AuditLog = require("../models/AuditLog");
const { uploadBufferToCloudinary } = require("../utils/uploadBufferToCloudinary");
const { detectFileType } = require("../utils/fileSignature");
const { signedAttachmentUrl, destroyAsset } = require("../utils/cloudinaryAssets");
const { getCurrentHospitalId } = require("../utils/tenantContext");
const { describeAction, auditPath, extractResourceId } = require("../utils/auditActions");
const { PRE_CHECK_MAX_FILES } = require("../middleware/upload");

const SYMPTOMS_MAX_LENGTH = 2000;
const DURATION_MAX_LENGTH = 120;
const VITALS_MAX_LENGTH = 40;
const VITAL_KEYS = ["temperature", "bloodPressure", "pulse", "weight"];

// The patient may edit their pre-check while the appointment is still "scheduled".
// Checking in is the hand-over point: from there on the clinical record belongs to staff.
const EDITABLE_STATUSES = ["scheduled"];

function httpError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}

/**
 * Every pre-check access is access to medical information, so it is audited even for reads -
 * the generic auditLogger middleware only writes on mutations. `auditHandled` stops that
 * middleware from adding a second, poorer entry on top of this one.
 *
 * The patient is attached to `req.auditPatientId` by the loader below, so each entry says
 * whose medical data was opened, not just which appointment id was in the URL.
 */
function recordAccess(req, res, { statusCode, details }) {
  res.locals.auditHandled = true;
  const hospitalId = req.user?.hospitalId;
  if (!hospitalId || !req.user) return;

  const path = auditPath(req);

  AuditLog.create({
    hospitalId,
    userId: req.user.userId,
    userName: req.user.name,
    userRole: req.user.role,
    method: req.method,
    path,
    statusCode,
    action: describeAction(req.method, path),
    resourceId: extractResourceId(path),
    patientId: req.auditPatientId,
    details,
  }).catch((err) => console.error("[AuditLog] failed to write pre-check entry:", err.message));
}

/** Shared error path: audit the attempt, then answer with a safe message. */
function fail(req, res, err, fallbackMessage) {
  const status = err.status || 500;
  if (status >= 500) console.error(err);

  recordAccess(req, res, {
    statusCode: status,
    details: status >= 500 ? fallbackMessage : err.message,
  });

  res.status(status).json({ message: status >= 500 ? fallbackMessage : err.message });
}

function pickVitals(source) {
  const clean = {};
  if (!source) return clean;
  for (const key of VITAL_KEYS) {
    const value = typeof source[key] === "string" ? source[key].trim() : "";
    if (value) clean[key] = value.slice(0, VITALS_MAX_LENGTH);
  }
  return clean;
}

/** What the client may see - the Cloudinary public id never leaves the server. */
function toClientShape(preCheck) {
  if (!preCheck) return null;
  return {
    _id: preCheck._id,
    appointmentId: preCheck.appointmentId,
    symptoms: preCheck.symptoms || "",
    duration: preCheck.duration || "",
    patientVitals: pickVitals(preCheck.patientVitals),
    staffVitals: pickVitals(preCheck.staffVitals),
    staffVitalsAt: preCheck.staffVitalsAt || null,
    attachments: (preCheck.attachments || []).map((attachment) => ({
      _id: attachment._id,
      name: attachment.originalName || "Attachment",
      mimeType: attachment.mimeType,
      bytes: attachment.bytes,
    })),
    consentAccepted: Boolean(preCheck.consentAccepted),
    submittedAt: preCheck.submittedAt || null,
    updatedAt: preCheck.updatedAt || null,
  };
}

function appointmentSummary(appointment) {
  return {
    _id: appointment._id,
    date: appointment.date,
    time: appointment.time || null,
    status: appointment.status,
    doctor: appointment.doctorId
      ? { _id: appointment.doctorId._id, name: appointment.doctorId.name, department: appointment.doctorId.department }
      : null,
  };
}

/** Loads the appointment and (for the "patient" role) proves it belongs to the caller. */
async function loadAccessibleAppointment(req, appointmentId) {
  if (!appointmentId) throw httpError(400, "appointmentId is required.");

  const appointment = await Appointment.findById(appointmentId)
    .populate("patientId", "name mrn userId")
    .populate("doctorId", "name department");
  if (!appointment) throw httpError(404, "Appointment not found.");

  if (req.user.role === "patient") {
    const ownPatient = await Patient.findOne({ userId: req.user.userId }).select("_id");
    const ownerId = appointment.patientId?._id || appointment.patientId;
    if (!ownPatient || String(ownerId) !== String(ownPatient._id)) {
      throw httpError(403, "You can only manage the pre-check for your own appointment.");
    }
  }

  req.auditPatientId = appointment.patientId?._id || appointment.patientId;
  return appointment;
}

function assertEditable(appointment) {
  if (EDITABLE_STATUSES.includes(appointment.status)) return;

  if (appointment.status === "cancelled") {
    throw httpError(409, "This appointment was cancelled, so the pre-check can no longer be changed.");
  }
  if (appointment.status === "no_show") {
    throw httpError(409, "This appointment was marked as a no-show, so the pre-check is closed.");
  }
  throw httpError(
    409,
    "The pre-check is locked because you have already checked in. Please tell the front desk about any changes."
  );
}

function parseIdList(value) {
  if (!value) return [];
  const list = Array.isArray(value) ? value : String(value).split(",");
  return list.map((entry) => String(entry).trim()).filter(Boolean);
}

function safeFileName(name) {
  return String(path.basename(String(name || "attachment")))
    .replace(/[^\w.\- ]+/g, "_")
    .slice(0, 120);
}

/**
 * POST /api/pre-checks - the patient creates or updates the pre-check of one of their own
 * appointments. Multipart because of the optional reports; the flat vitals fields are
 * temperature/bloodPressure/pulse/weight.
 */
async function saveMyPreCheck(req, res) {
  try {
    const appointment = await loadAccessibleAppointment(req, req.body.appointmentId);
    assertEditable(appointment);

    const symptoms = String(req.body.symptoms || "").trim();
    if (!symptoms) throw httpError(400, "Please describe your symptoms - it is the only required field.");
    if (symptoms.length > SYMPTOMS_MAX_LENGTH) {
      throw httpError(400, `Symptoms must be ${SYMPTOMS_MAX_LENGTH} characters or fewer.`);
    }

    const duration = String(req.body.duration || "").trim();
    if (duration.length > DURATION_MAX_LENGTH) {
      throw httpError(400, `Duration must be ${DURATION_MAX_LENGTH} characters or fewer.`);
    }

    const consentAccepted = req.body.consentAccepted === true || req.body.consentAccepted === "true";
    if (!consentAccepted) {
      throw httpError(400, "Please confirm the consent statement before submitting your pre-check.");
    }

    const files = Array.isArray(req.files) ? req.files : [];
    // Validate every buffer BEFORE anything is uploaded, so a bad file never costs storage.
    const detectedFiles = files.map((file) => {
      const detected = detectFileType(file.buffer);
      if (!detected) {
        throw httpError(400, `"${safeFileName(file.originalname)}" is not a PDF, JPG or PNG file.`);
      }
      return { file, detected };
    });

    let preCheck = await PreCheck.findOne({ appointmentId: appointment._id });
    const existingAttachments = preCheck ? preCheck.attachments.slice() : [];

    const removeIds = parseIdList(req.body.removeAttachmentIds);
    const removedAttachments = existingAttachments.filter((attachment) =>
      removeIds.includes(String(attachment._id))
    );
    const keptAttachments = existingAttachments.filter(
      (attachment) => !removeIds.includes(String(attachment._id))
    );

    if (keptAttachments.length + detectedFiles.length > PRE_CHECK_MAX_FILES) {
      throw httpError(400, `You can attach at most ${PRE_CHECK_MAX_FILES} files. Remove one to add another.`);
    }

    const uploaded = [];
    try {
      const folder = `hms-precheck/${getCurrentHospitalId()}`;
      for (const { file, detected } of detectedFiles) {
        // "authenticated": no public delivery URL exists, only signed ones (2 minute TTL).
        const result = await uploadBufferToCloudinary(file.buffer, {
          folder,
          resourceType: detected.resourceType,
          type: "authenticated",
        });
        uploaded.push({
          publicId: result.public_id,
          resourceType: result.resource_type || detected.resourceType,
          format: result.format || detected.format,
          mimeType: detected.mimeType,
          originalName: safeFileName(file.originalname),
          bytes: file.size,
          uploadedAt: new Date(),
        });
      }
    } catch (err) {
      // A half-finished batch would leave paid-for orphans behind.
      await Promise.all(uploaded.map((asset) => destroyAsset(asset)));
      if (String(err.message).includes("Cloudinary is not configured")) {
        throw httpError(503, "Report uploads are unavailable right now. Please submit without attachments.");
      }
      throw err;
    }

    const isNew = !preCheck;
    if (!preCheck) {
      preCheck = new PreCheck({
        appointmentId: appointment._id,
        patientId: appointment.patientId?._id || appointment.patientId,
        doctorId: appointment.doctorId?._id || appointment.doctorId,
      });
    }

    preCheck.symptoms = symptoms;
    preCheck.duration = duration || undefined;
    preCheck.patientVitals = pickVitals(req.body);
    preCheck.consentAccepted = true;
    preCheck.consentAcceptedAt = preCheck.consentAcceptedAt || new Date();
    preCheck.submittedAt = new Date();
    preCheck.lastEditedByRole = req.user.role;
    preCheck.attachments = [...keptAttachments, ...uploaded];
    await preCheck.save();

    // Only now that the document is safe do we let go of the files it no longer references.
    await Promise.all(
      removedAttachments.map((attachment) =>
        destroyAsset({ publicId: attachment.publicId, resourceType: attachment.resourceType })
      )
    );

    recordAccess(req, res, {
      statusCode: isNew ? 201 : 200,
      details: `${isNew ? "Submitted" : "Updated"} pre-check for appointment ${appointment._id} (${
        uploaded.length
      } file(s) added, ${removedAttachments.length} removed)`,
    });

    res.status(isNew ? 201 : 200).json({ preCheck: toClientShape(preCheck), editable: true });
  } catch (err) {
    fail(req, res, err, "Server error while saving the pre-check.");
  }
}

/**
 * GET /api/pre-checks/:appointmentId - one pre-check with its appointment context.
 * Returns `preCheck: null` (not a 404) when the patient has not started it, which is what
 * the portal and the doctor's form both need to render an empty state.
 */
async function getPreCheck(req, res) {
  try {
    const appointment = await loadAccessibleAppointment(req, req.params.appointmentId);
    const preCheck = await PreCheck.findOne({ appointmentId: appointment._id });
    const editable = EDITABLE_STATUSES.includes(appointment.status);

    recordAccess(req, res, {
      statusCode: 200,
      details: `${preCheck ? "Viewed" : "Checked for"} pre-check of appointment ${appointment._id}`,
    });

    res.json({
      appointment: appointmentSummary(appointment),
      preCheck: toClientShape(preCheck),
      editable: editable && req.user.role === "patient",
      locked: !editable,
    });
  } catch (err) {
    fail(req, res, err, "Server error while loading the pre-check.");
  }
}

/** GET /api/pre-checks/mine - status per appointment, for the portal's appointment cards. */
async function listMyPreChecks(req, res) {
  try {
    const patient = await Patient.findOne({ userId: req.user.userId }).select("_id");
    if (!patient) throw httpError(404, "No patient record linked to this account.");
    req.auditPatientId = patient._id;

    const preChecks = await PreCheck.find({ patientId: patient._id })
      .select("appointmentId symptoms submittedAt patientVitals staffVitalsAt attachments")
      .lean();

    recordAccess(req, res, {
      statusCode: 200,
      details: `Listed ${preChecks.length} pre-check(s)`,
    });

    res.json(
      preChecks.map((preCheck) => ({
        appointmentId: preCheck.appointmentId,
        status: preCheck.submittedAt ? "submitted" : "not_started",
        submittedAt: preCheck.submittedAt || null,
        attachmentCount: (preCheck.attachments || []).length,
        hasPatientVitals: Object.keys(pickVitals(preCheck.patientVitals)).length > 0,
        hasStaffVitals: Boolean(preCheck.staffVitalsAt),
      }))
    );
  } catch (err) {
    fail(req, res, err, "Server error while loading your pre-checks.");
  }
}

/**
 * PATCH /api/pre-checks/:appointmentId/staff-vitals - nurse/receptionist (or the doctor,
 * or an admin) measures vitals at the desk. Kept separate from patientVitals so the two
 * can never be confused in the record.
 */
async function recordStaffVitals(req, res) {
  try {
    const appointment = await loadAccessibleAppointment(req, req.params.appointmentId);
    const vitals = pickVitals(req.body);
    if (Object.keys(vitals).length === 0) {
      throw httpError(400, "Enter at least one vital sign before saving.");
    }

    let preCheck = await PreCheck.findOne({ appointmentId: appointment._id });
    const isNew = !preCheck;
    if (!preCheck) {
      preCheck = new PreCheck({
        appointmentId: appointment._id,
        patientId: appointment.patientId?._id || appointment.patientId,
        doctorId: appointment.doctorId?._id || appointment.doctorId,
      });
    }

    preCheck.staffVitals = vitals;
    preCheck.staffVitalsBy = req.user.userId;
    preCheck.staffVitalsAt = new Date();
    await preCheck.save();

    recordAccess(req, res, {
      statusCode: isNew ? 201 : 200,
      details: `Recorded desk vitals for appointment ${appointment._id} (${Object.keys(vitals).join(", ")})`,
    });

    res.status(isNew ? 201 : 200).json({ preCheck: toClientShape(preCheck) });
  } catch (err) {
    fail(req, res, err, "Server error while recording vitals.");
  }
}

/**
 * GET /api/pre-checks/:appointmentId/attachments/:attachmentId/url
 * The only way to read a report: an authorization check here, then a signed Cloudinary URL
 * that expires in two minutes (utils/cloudinaryAssets.js).
 */
async function getAttachmentUrl(req, res) {
  try {
    const appointment = await loadAccessibleAppointment(req, req.params.appointmentId);
    const preCheck = await PreCheck.findOne({ appointmentId: appointment._id });
    if (!preCheck) throw httpError(404, "No pre-check found for this appointment.");

    const attachment = preCheck.attachments.id(req.params.attachmentId);
    if (!attachment) throw httpError(404, "Attachment not found.");

    const { url, expiresAt } = signedAttachmentUrl({
      publicId: attachment.publicId,
      format: attachment.format,
      resourceType: attachment.resourceType,
    });

    recordAccess(req, res, {
      statusCode: 200,
      details: `Opened attachment "${attachment.originalName}" of appointment ${appointment._id}`,
    });

    res.json({
      url,
      expiresAt,
      name: attachment.originalName,
      mimeType: attachment.mimeType,
      bytes: attachment.bytes,
    });
  } catch (err) {
    fail(req, res, err, "Server error while opening the attachment.");
  }
}

module.exports = {
  saveMyPreCheck,
  getPreCheck,
  listMyPreChecks,
  recordStaffVitals,
  getAttachmentUrl,
  // Exported for the reminder email / future tests.
  EDITABLE_STATUSES,
};
