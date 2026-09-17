const express = require("express");
const { listSignupHospitals, patientSignup } = require("../controllers/publicController");

const router = express.Router();

// Deliberately NO protect() here - these are public, unauthenticated endpoints.
router.get("/hospitals", listSignupHospitals);
router.post("/patient-signup", patientSignup);

module.exports = router;