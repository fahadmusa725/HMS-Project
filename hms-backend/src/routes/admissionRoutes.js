const express = require("express");
const protect = require("../middleware/auth");
const auditLogger = require("../middleware/auditLogger");
const allowRoles = require("../middleware/rbac");
const {
  admitPatient,
  dischargePatient,
  listAdmissions,
  getAdmissionById,
  getRunningBill,
  addAdvancePayment,
} = require("../controllers/admissionController");
const { addNurseNote, getAdmissionNotes } = require("../controllers/nurseNoteController");

const router = express.Router();

router.use(protect, auditLogger);

const canAdmit = allowRoles("hospital_admin", "doctor", "nurse", "receptionist");
const canView = allowRoles("hospital_admin", "doctor", "nurse", "receptionist");
// Accountants need admission list/detail to see active IPD stays from Billing, but not the
// clinical rounds notes below - kept as a separate list so notes access doesn't widen with it.
const canViewForBilling = allowRoles("hospital_admin", "doctor", "nurse", "receptionist", "accountant");

// Admit a patient (claims a bed atomically).
router.post("/", canAdmit, admitPatient);

// List admissions. ?status=admitted (default) | discharged | all, optional ?patientId=
router.get("/", canViewForBilling, listAdmissions);

// Single admission detail (includes daysAdmitted + advancePaid).
router.get("/:id", canViewForBilling, getAdmissionById);

// Live running bill - viewable any time before discharge, and the final breakdown after.
router.get(
  "/:id/running-bill",
  allowRoles("hospital_admin", "doctor", "nurse", "receptionist", "accountant"),
  getRunningBill
);

// Record an advance/deposit payment during the stay.
router.post("/:id/advance-payment", allowRoles("hospital_admin", "receptionist", "accountant"), addAdvancePayment);

// Discharge - computes and creates the final itemized bill, frees the bed.
router.patch("/:id/discharge", allowRoles("hospital_admin", "doctor", "nurse"), dischargePatient);

// Nursing rounds notes, nested under an admission
router.post(
  "/:admissionId/notes",
  allowRoles("nurse", "doctor", "hospital_admin"),
  (req, res, next) => {
    req.body.admissionId = req.params.admissionId; // allow the route param to drive it
    next();
  },
  addNurseNote
);
router.get("/:admissionId/notes", canView, getAdmissionNotes);

module.exports = router;
