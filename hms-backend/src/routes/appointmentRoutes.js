const express = require("express");
const protect = require("../middleware/auth");
const auditLogger = require("../middleware/auditLogger");
const allowRoles = require("../middleware/rbac");
const {
  bookAppointment,
  getQueue,
  updateAppointmentStatus,
  getPatientAppointments,
  getAppointmentSlipPdf,
  getMyAppointments,
  listDoctors,
  bookMyAppointment,
} = require("../controllers/appointmentController");

const router = express.Router();

router.use(protect, auditLogger);

const canBook = allowRoles("hospital_admin", "receptionist");
const canViewQueue = allowRoles("hospital_admin", "receptionist", "doctor", "nurse");
// Coarse gate only - the per-status role rules live in the controller (STATUS_TRANSITION_ROLES).
// "patient" is included so they can check themselves in - ownership is enforced in the controller.
const canUpdateStatus = allowRoles("hospital_admin", "receptionist", "doctor", "nurse", "patient");

// Patient self-service - must come before "/patient/:patientId" so it's
// never confused with a param route.
router.get("/mine", allowRoles("patient"), getMyAppointments);
router.post("/book-mine", allowRoles("patient"), bookMyAppointment);

router.get("/doctors", allowRoles("hospital_admin", "receptionist", "doctor", "nurse", "patient"), listDoctors);

router.post("/", canBook, bookAppointment);
router.get("/queue", canViewQueue, getQueue);
router.patch("/:id/status", canUpdateStatus, updateAppointmentStatus);
router.get("/patient/:patientId", canViewQueue, getPatientAppointments);
// Ownership for the "patient" role is verified inside the controller itself.
router.get(
  "/:id/slip-pdf",
  allowRoles("receptionist", "hospital_admin", "doctor", "nurse", "patient"),
  getAppointmentSlipPdf
);

module.exports = router;
