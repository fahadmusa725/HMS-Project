const express = require("express");
const protect = require("../middleware/auth");
const allowRoles = require("../middleware/rbac");
const {
  bookAppointment,
  getQueue,
  updateAppointmentStatus,
  getPatientAppointments,
} = require("../controllers/appointmentController");

const router = express.Router();

router.use(protect);

const canBook = allowRoles("hospital_admin", "receptionist");
const canViewQueue = allowRoles("hospital_admin", "receptionist", "doctor", "nurse");
const canUpdateStatus = allowRoles("hospital_admin", "receptionist", "doctor", "nurse");

router.post("/", canBook, bookAppointment);
router.get("/queue", canViewQueue, getQueue);
router.patch("/:id/status", canUpdateStatus, updateAppointmentStatus);
router.get("/patient/:patientId", canViewQueue, getPatientAppointments);

module.exports = router;
