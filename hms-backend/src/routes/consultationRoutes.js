const express = require("express");
const protect = require("../middleware/auth");
const auditLogger = require("../middleware/auditLogger");
const allowRoles = require("../middleware/rbac");
const {
  createConsultation,
  getPatientEMR,
  getConsultationById,
} = require("../controllers/consultationController");

const router = express.Router();

router.use(protect, auditLogger);

router.post("/", allowRoles("doctor"), createConsultation);
router.get("/patient/:patientId", allowRoles("doctor", "nurse", "hospital_admin", "receptionist"), getPatientEMR);
router.get("/:id", allowRoles("doctor", "nurse", "hospital_admin"), getConsultationById);

module.exports = router;