const express = require("express");
const protect = require("../middleware/auth");
const allowRoles = require("../middleware/rbac");
const {
  createHospital,
  listHospitals,
  updateHospitalStatus,
  deleteHospital,
} = require("../controllers/superAdminController");

const router = express.Router();

// Every route here requires a valid token AND the platform_super_admin role.
router.use(protect, allowRoles("platform_super_admin"));

router.post("/hospitals", createHospital);
router.get("/hospitals", listHospitals);
router.patch("/hospitals/:hospitalId", updateHospitalStatus);
router.delete("/hospitals/:hospitalId", deleteHospital);

module.exports = router;