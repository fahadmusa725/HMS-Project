const express = require("express");
const protect = require("../middleware/auth");
const auditLogger = require("../middleware/auditLogger");
const allowRoles = require("../middleware/rbac");
const { logoUpload, LOGO_MAX_FILE_BYTES } = require("../middleware/upload");
const {
  createStaff,
  listStaff,
  updateStaff,
  setStaffStatus,
  resetStaffPassword,
  exportData,
  getSettings,
  updateSettings,
  uploadHospitalLogo,
  removeHospitalLogo,
  regenerateDisplayKey,
} = require("../controllers/hospitalAdminController");

const router = express.Router();

router.use(protect, allowRoles("hospital_admin"), auditLogger);

/** Turns multer's limit errors into readable 400s instead of a 500 from the error handler. */
function receiveLogo(req, res, next) {
  logoUpload.single("logo")(req, res, (err) => {
    if (!err) return next();

    if (err.code === "LIMIT_FILE_SIZE") {
      const megabytes = Math.round(LOGO_MAX_FILE_BYTES / (1024 * 1024));
      return res.status(400).json({ message: `The logo must be ${megabytes} MB or smaller.` });
    }
    if (err.code === "LIMIT_UNEXPECTED_FILE") {
      return res.status(400).json({ message: "Upload the logo as a single image in the 'logo' field." });
    }

    console.error("[HospitalLogo] upload failed:", err.message);
    return res.status(400).json({ message: "The logo upload could not be read. Please try again." });
  });
}

router.post("/staff", createStaff);
router.get("/staff", listStaff);
router.patch("/staff/:id", updateStaff);
router.patch("/staff/:id/status", setStaffStatus);
router.post("/staff/:id/reset-password", resetStaffPassword);
router.get("/export", exportData);

// Tenant behaviour toggles plus the hospital's own identity (name, logo) and the TV key.
router.get("/settings", getSettings);
router.patch("/settings", updateSettings);
router.post("/settings/logo", receiveLogo, uploadHospitalLogo);
router.delete("/settings/logo", removeHospitalLogo);
router.post("/settings/display-key", regenerateDisplayKey);

module.exports = router;