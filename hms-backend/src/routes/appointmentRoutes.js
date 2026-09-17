const express = require("express");
const protect = require("../middleware/auth");
const auditLogger = require("../middleware/auditLogger");
const allowRoles = require("../middleware/rbac");
const {
  bookAppointment,
  getQueue,
  updateAppointmentStatus,
  getPatientAppointments,
  getMyAppointments,
  listDoctorsForBooking,
  bookMyAppointment,
} = require("../controllers/appointmentController");

const router = express.Router();

router.use(protect, auditLogger);

const canBook = allowRoles("hospital_admin", "receptionist");
const canViewQueue = allowRoles("hospital_admin", "receptionist", "doctor", "nurse");
const canUpdateStatus = allowRoles("hospital_admin", "receptionist", "doctor", "nurse");

// Patient self-service - must come before "/patient/:patientId" so it's
// never confused with a param route.
router.get("/mine", allowRoles("patient"), getMyAppointments);
router.get("/doctors", allowRoles("patient"), listDoctorsForBooking);
router.post("/book-mine", allowRoles("patient"), bookMyAppointment);

router.post("/", canBook, bookAppointment);
router.get("/queue", canViewQueue, getQueue);
router.patch("/:id/status", canUpdateStatus, updateAppointmentStatus);
router.get("/patient/:patientId", canViewQueue, getPatientAppointments);

module.exports = router;