const express = require("express");
const protect = require("../middleware/auth");
const auditLogger = require("../middleware/auditLogger");
const allowRoles = require("../middleware/rbac");
const { createStaff, listStaff } = require("../controllers/hospitalAdminController");

const router = express.Router();

router.use(protect, allowRoles("hospital_admin"), auditLogger);

router.post("/staff", createStaff);
router.get("/staff", listStaff);

module.exports = router;