const express = require("express");
const protect = require("../middleware/auth");
const auditLogger = require("../middleware/auditLogger");
const { auditPhiRead } = require("../middleware/phiAudit");
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

// The EMR and prescriptions are PHI: each successful read is recorded against the patient.
router.get("/mine", allowRoles("patient"), auditPhiRead("Viewed own medical history"), getMyEMR);
router.post("/", allowRoles("doctor"), createConsultation);
router.get(
  "/patient/:patientId",
  allowRoles("doctor", "nurse", "hospital_admin", "receptionist"),
  auditPhiRead("Viewed a patient's medical history"),
  getPatientEMR
);
router.get("/:id", allowRoles("doctor", "nurse", "hospital_admin"), auditPhiRead("Viewed a consultation"), getConsultationById);
// Ownership for the "patient" role is verified inside the controller itself
// (they can only ever download their OWN prescription).
router.get(
  "/:id/prescription-pdf",
  allowRoles("doctor", "nurse", "hospital_admin", "receptionist", "patient"),
  auditPhiRead("Downloaded a prescription"),
  getPrescriptionPdf
);

module.exports = router;