const express = require("express");
const protect = require("../middleware/auth");
const allowRoles = require("../middleware/rbac");
const { listAuditLogs } = require("../controllers/auditController");

const router = express.Router();

// Deliberately does NOT use auditLogger here - we don't audit-log the
// act of viewing audit logs, only mutating actions.
router.use(protect, allowRoles("hospital_admin"));

router.get("/", listAuditLogs);

module.exports = router;