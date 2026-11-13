const express = require("express");
const protect = require("../middleware/auth");
const auditLogger = require("../middleware/auditLogger");
const allowRoles = require("../middleware/rbac");
const {
  bookAppointment,
  createWalkIn,
  getQueue,
  callNextPatient,
  setAppointmentPriority,
  updateAppointmentStatus,
  getPatientAppointments,
  getAppointmentSlipPdf,
  getMyAppointments,
  getMyLiveStatus,
  listDoctors,
  bookMyAppointment,
} = require("../controllers/appointmentController");

const router = express.Router();

router.use(protect, auditLogger);

const canBook = allowRoles("hospital_admin", "receptionist");
const canRunFrontDesk = allowRoles("hospital_admin", "receptionist");
const canViewQueue = allowRoles("hospital_admin", "receptionist", "doctor", "nurse");
// Coarse gate only - the per-status role rules live in the controller (STATUS_TRANSITION_ROLES).
// "patient" is included so they can check themselves in - ownership is enforced in the controller.
const canUpdateStatus = allowRoles("hospital_admin", "receptionist", "doctor", "nurse", "patient");

// Patient self-service - must come before "/patient/:patientId" so it's
// never confused with a param route.
router.get("/mine", allowRoles("patient"), getMyAppointments);
router.get("/mine/live", allowRoles("patient"), getMyLiveStatus);
router.post("/book-mine", allowRoles("patient"), bookMyAppointment);

router.get("/doctors", allowRoles("hospital_admin", "receptionist", "doctor", "nurse", "patient"), listDoctors);

router.post("/", canBook, bookAppointment);
// Front desk quick flow: existing patient or a minimal quick-register, same-day token, checked_in.
router.post("/walk-in", canRunFrontDesk, createWalkIn);
router.get("/queue", canViewQueue, getQueue);
// "Call next" - a doctor is always scoped to themself; admin/reception must pass doctorId.
router.post("/call-next", allowRoles("hospital_admin", "receptionist", "doctor"), callNextPatient);
// Patients must never be able to set priority, so they are deliberately absent here.
router.patch("/:id/priority", allowRoles("hospital_admin", "receptionist", "doctor"), setAppointmentPriority);
router.patch("/:id/status", canUpdateStatus, updateAppointmentStatus);
router.get("/patient/:patientId", canViewQueue, getPatientAppointments);
// Ownership for the "patient" role is verified inside the controller itself.
router.get(
  "/:id/slip-pdf",
  allowRoles("receptionist", "hospital_admin", "doctor", "nurse", "patient"),
  getAppointmentSlipPdf
);

module.exports = router;
