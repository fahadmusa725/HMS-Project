const express = require("express");
const protect = require("../middleware/auth");
const allowRoles = require("../middleware/rbac");
const { createBill, listBills, getPatientBills, recordPayment } = require("../controllers/billingController");

const router = express.Router();

router.use(protect);

const canManage = allowRoles("accountant", "hospital_admin", "receptionist");
const canView = allowRoles("accountant", "hospital_admin", "receptionist");

router.post("/", canManage, createBill);
router.get("/", canView, listBills);
router.get("/patient/:patientId", canView, getPatientBills);
router.patch("/:id/payment", canManage, recordPayment);

module.exports = router;