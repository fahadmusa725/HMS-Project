const express = require("express");
const protect = require("../middleware/auth");
const allowRoles = require("../middleware/rbac");
const { createStaff, listStaff } = require("../controllers/hospitalAdminController");

const router = express.Router();

router.use(protect, allowRoles("hospital_admin"));

router.post("/staff", createStaff);
router.get("/staff", listStaff);

module.exports = router;
