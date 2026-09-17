const express = require("express");
const protect = require("../middleware/auth");
const auditLogger = require("../middleware/auditLogger");
const allowRoles = require("../middleware/rbac");
const { createWard, listWards, addBeds, listBeds } = require("../controllers/wardController");

const router = express.Router();

router.use(protect, auditLogger);

const canManage = allowRoles("hospital_admin");
const canView = allowRoles("hospital_admin", "doctor", "nurse", "receptionist");

router.post("/", canManage, createWard);
router.get("/", canView, listWards);
router.post("/:wardId/beds", canManage, addBeds);
router.get("/beds/all", canView, listBeds);

module.exports = router;