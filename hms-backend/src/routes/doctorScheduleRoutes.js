const express = require("express");
const protect = require("../middleware/auth");
const auditLogger = require("../middleware/auditLogger");
const allowRoles = require("../middleware/rbac");
const {
  upsertSchedule,
  getSchedule,
  getAvailableDoctors,
  getAvailableSlots,
} = require("../controllers/doctorScheduleController");

const router = express.Router();

router.use(protect, auditLogger);

const canView = allowRoles("hospital_admin", "receptionist", "doctor", "nurse", "patient");

// Which doctors work on a given date - real availability for the booking search.
router.get("/available-doctors", canView, getAvailableDoctors);

// Open slots for one doctor on one date, already-booked times excluded.
router.get("/available-slots", canView, getAvailableSlots);

// Set/update a doctor's weekly hours, fee and slot length.
router.put("/:doctorId", allowRoles("hospital_admin"), upsertSchedule);

// Fetch one doctor's schedule.
router.get("/:doctorId", canView, getSchedule);

module.exports = router;
