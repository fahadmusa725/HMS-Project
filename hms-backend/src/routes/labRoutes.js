const express = require("express");
const protect = require("../middleware/auth");
const allowRoles = require("../middleware/rbac");
const {
  createLabTest,
  listLabTests,
  createLabOrder,
  listLabOrders,
  updateLabOrderStatus,
  addLabResult,
  getPatientLabOrders,
} = require("../controllers/labController");

const router = express.Router();

router.use(protect);

// Catalog setup - hospital_admin only
router.post("/tests", allowRoles("hospital_admin"), createLabTest);
router.get("/tests", allowRoles("hospital_admin", "doctor", "lab_technician", "receptionist"), listLabTests);

// Orders
const canOrder = allowRoles("doctor", "hospital_admin", "receptionist");
const canManageOrders = allowRoles("lab_technician", "hospital_admin");
const canView = allowRoles("hospital_admin", "doctor", "nurse", "receptionist", "lab_technician");

router.post("/orders", canOrder, createLabOrder);
router.get("/orders", canView, listLabOrders);
router.patch("/orders/:id/status", canManageOrders, updateLabOrderStatus);
router.patch("/orders/:id/result", canManageOrders, addLabResult);
router.get("/orders/patient/:patientId", canView, getPatientLabOrders);

module.exports = router;