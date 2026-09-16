const express = require("express");
const protect = require("../middleware/auth");
const allowRoles = require("../middleware/rbac");
const {
  getOverview,
  getFinancialReport,
  getClinicalReport,
  getOperationsReport,
} = require("../controllers/reportsController");

const router = express.Router();

router.use(protect);

router.get("/overview", allowRoles("hospital_admin"), getOverview);
router.get("/financial", allowRoles("hospital_admin", "accountant"), getFinancialReport);
router.get("/clinical", allowRoles("hospital_admin"), getClinicalReport);
router.get("/operations", allowRoles("hospital_admin"), getOperationsReport);

module.exports = router;