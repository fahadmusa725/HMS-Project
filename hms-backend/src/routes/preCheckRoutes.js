const express = require("express");
const protect = require("../middleware/auth");
const auditLogger = require("../middleware/auditLogger");
const allowRoles = require("../middleware/rbac");
const { preCheckUpload, PRE_CHECK_MAX_FILES, PRE_CHECK_MAX_FILE_BYTES } = require("../middleware/upload");
const { createRateLimiter } = require("../utils/rateLimit");
const {
  saveMyPreCheck,
  getPreCheck,
  listMyPreChecks,
  recordStaffVitals,
  getAttachmentUrl,
} = require("../controllers/preCheckController");

const router = express.Router();

router.use(protect, auditLogger);

// Mirrors the clinical-read roles used across the app (see consultationRoutes): the patient
// plus the four staff roles that already see the queue and the EMR.
const canView = allowRoles("hospital_admin", "receptionist", "doctor", "nurse", "patient");
// Vitals measured at the desk: the front desk, nursing, the doctor, or an admin.
const canRecordVitals = allowRoles("hospital_admin", "receptionist", "nurse", "doctor");

// Uploads are the only expensive pre-check action (each file costs Cloudinary storage and
// bandwidth on a free plan), so they get their own ceiling on top of the global one.
const uploadLimiter = createRateLimiter({ windowMs: 10 * 60 * 1000, max: 20 });

/** Turns multer's limit errors into readable 400s instead of a 500 from the error handler. */
function receiveReports(req, res, next) {
  preCheckUpload.array("attachments", PRE_CHECK_MAX_FILES)(req, res, (err) => {
    if (!err) return next();

    const megabytes = Math.round(PRE_CHECK_MAX_FILE_BYTES / (1024 * 1024));
    if (err.code === "LIMIT_FILE_SIZE") {
      return res.status(400).json({ message: `Each file must be ${megabytes} MB or smaller.` });
    }
    if (err.code === "LIMIT_FILE_COUNT") {
      return res.status(400).json({ message: `You can attach at most ${PRE_CHECK_MAX_FILES} files.` });
    }
    if (err.code === "LIMIT_UNEXPECTED_FILE") {
      // A wrong field name (or a 4th file sent under its own key) is a client bug, not a limit
      // the patient hit - saying "at most 3 files" here would be misleading.
      console.error("[PreCheck] unexpected upload field:", err.field);
      return res.status(400).json({ message: "The report upload was rejected. Please try again." });
    }

    console.error("[PreCheck] upload failed:", err.message);
    return res.status(400).json({ message: "The uploaded files could not be read. Please try again." });
  });
}

// "/mine" must come before "/:appointmentId".
router.get("/mine", allowRoles("patient"), listMyPreChecks);
router.post("/", allowRoles("patient"), uploadLimiter, receiveReports, saveMyPreCheck);
router.patch("/:appointmentId/staff-vitals", canRecordVitals, recordStaffVitals);
router.get("/:appointmentId/attachments/:attachmentId/url", canView, getAttachmentUrl);
router.get("/:appointmentId", canView, getPreCheck);

module.exports = router;
