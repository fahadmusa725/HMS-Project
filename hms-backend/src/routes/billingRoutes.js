const express = require("express");
const protect = require("../middleware/auth");
const auditLogger = require("../middleware/auditLogger");
const allowRoles = require("../middleware/rbac");
const { createBill, listBills, getPatientBills, recordPayment, getMyBills } = require("../controllers/billingController");

const router = express.Router();

router.use(protect, auditLogger);

const canManage = allowRoles("accountant", "hospital_admin", "receptionist");
const canView = allowRoles("accountant", "hospital_admin", "receptionist");

router.get("/mine", allowRoles("patient"), getMyBills);
router.post("/", canManage, createBill);
router.get("/", canView, listBills);
router.get("/patient/:patientId", canView, getPatientBills);
router.patch("/:id/payment", canManage, recordPayment);

module.exports = router;