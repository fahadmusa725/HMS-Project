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

router.get("/available-doctors", canView, getAvailableDoctors);

router.get("/available-slots", canView, getAvailableSlots);

router.put("/:doctorId", allowRoles("hospital_admin"), upsertSchedule);

router.get("/:doctorId", canView, getSchedule);

module.exports = router;
