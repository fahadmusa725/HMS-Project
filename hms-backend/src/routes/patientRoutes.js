const express = require("express");
const protect = require("../middleware/auth");
const auditLogger = require("../middleware/auditLogger");
const allowRoles = require("../middleware/rbac");
const {
  registerPatient,
  listPatients,
  getPatientById,
  updatePatient,
} = require("../controllers/patientController");

const router = express.Router();

// All patient routes require login, and are automatically hospital-scoped
// via the tenant context established in protect().
router.use(protect, auditLogger);

const canManagePatients = allowRoles("hospital_admin", "receptionist", "doctor", "nurse");

router.post("/", canManagePatients, registerPatient);
router.get("/", canManagePatients, listPatients);
router.get("/:id", canManagePatients, getPatientById);
router.patch("/:id", canManagePatients, updatePatient);

module.exports = router;