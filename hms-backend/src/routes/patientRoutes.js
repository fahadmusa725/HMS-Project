const express = require("express");
const protect = require("../middleware/auth");
const auditLogger = require("../middleware/auditLogger");
const { auditPhiRead } = require("../middleware/phiAudit");
const allowRoles = require("../middleware/rbac");
const {
  registerPatient,
  listPatients,
  getPatientById,
  updatePatient,
  enablePortalAccess,
  claimPatientRecord,
  linkPortalAccount,
  getMyPatientRecord,
  updateMyProfile,
} = require("../controllers/patientController");

const router = express.Router();

// All patient routes require login, and are automatically hospital-scoped
// via the tenant context established in protect().
router.use(protect, auditLogger);

const canManagePatients = allowRoles("hospital_admin", "receptionist", "doctor", "nurse");

// Must come before "/:id" so it isn't swallowed by the param route.
router.get("/me", allowRoles("patient"), getMyPatientRecord);
router.patch("/me", allowRoles("patient"), updateMyProfile);
router.post("/me/claim", allowRoles("patient"), claimPatientRecord);

router.post("/", canManagePatients, registerPatient);
router.get("/", canManagePatients, listPatients);
// Opening a chart is a PHI read: audited with the patient id so the trail answers
// "who looked at this patient" without guessing from the path.
router.get("/:id", canManagePatients, auditPhiRead("Viewed a patient record", { patientParam: "id" }), getPatientById);
router.patch("/:id", canManagePatients, updatePatient);
router.post("/:id/enable-portal", allowRoles("hospital_admin", "receptionist"), enablePortalAccess);
router.post("/:id/link-account", allowRoles("hospital_admin", "receptionist"), linkPortalAccount);

module.exports = router;