const express = require("express");
const protect = require("../middleware/auth");
const auditLogger = require("../middleware/auditLogger");
const allowRoles = require("../middleware/rbac");
const {
  createConsultation,
  getPatientEMR,
  getConsultationById,
  getMyEMR,
  getPrescriptionPdf,
} = require("../controllers/consultationController");

const router = express.Router();

router.use(protect, auditLogger);

router.get("/mine", allowRoles("patient"), getMyEMR);
router.post("/", allowRoles("doctor"), createConsultation);
router.get("/patient/:patientId", allowRoles("doctor", "nurse", "hospital_admin", "receptionist"), getPatientEMR);
router.get("/:id", allowRoles("doctor", "nurse", "hospital_admin"), getConsultationById);
// Ownership for the "patient" role is verified inside the controller itself
// (they can only ever download their OWN prescription).
router.get(
  "/:id/prescription-pdf",
  allowRoles("doctor", "nurse", "hospital_admin", "receptionist", "patient"),
  getPrescriptionPdf
);

module.exports = router;