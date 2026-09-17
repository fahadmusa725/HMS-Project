const express = require("express");
const protect = require("../middleware/auth");
const auditLogger = require("../middleware/auditLogger");
const allowRoles = require("../middleware/rbac");
const {
  admitPatient,
  dischargePatient,
  listActiveAdmissions,
  getAdmissionById,
} = require("../controllers/admissionController");
const { addNurseNote, getAdmissionNotes } = require("../controllers/nurseNoteController");

const router = express.Router();

router.use(protect, auditLogger);

const canManage = allowRoles("hospital_admin", "doctor", "nurse");
const canView = allowRoles("hospital_admin", "doctor", "nurse", "receptionist");

router.post("/", canManage, admitPatient);
router.get("/", canView, listActiveAdmissions);
router.get("/:id", canView, getAdmissionById);
router.patch("/:id/discharge", canManage, dischargePatient);

// Nursing rounds notes, nested under an admission
router.post("/:admissionId/notes", allowRoles("nurse", "doctor", "hospital_admin"), (req, res, next) => {
  req.body.admissionId = req.params.admissionId; // allow the route param to drive it
  next();
}, addNurseNote);
router.get("/:admissionId/notes", canView, getAdmissionNotes);

module.exports = router;