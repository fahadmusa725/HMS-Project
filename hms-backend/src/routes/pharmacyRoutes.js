const express = require("express");
const protect = require("../middleware/auth");
const allowRoles = require("../middleware/rbac");
const {
  createMedicine,
  listMedicines,
  updateMedicine,
  restockMedicine,
  dispenseMedicine,
  listSales,
} = require("../controllers/pharmacyController");

const router = express.Router();

router.use(protect);

const canManage = allowRoles("pharmacist", "hospital_admin");
const canView = allowRoles("pharmacist", "hospital_admin", "doctor", "nurse");

router.post("/medicines", canManage, createMedicine);
router.get("/medicines", canView, listMedicines);
router.patch("/medicines/:id", canManage, updateMedicine);
router.patch("/medicines/:id/restock", canManage, restockMedicine);

router.post("/dispense", canManage, dispenseMedicine);
router.get("/sales", canManage, listSales);

module.exports = router;