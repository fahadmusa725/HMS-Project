const express = require("express");
const { listSignupHospitals, patientSignup, requestDemo } = require("../controllers/publicController");

const router = express.Router();

// Deliberately NO protect() here - these are public, unauthenticated endpoints.
router.get("/hospitals", listSignupHospitals);
router.post("/patient-signup", patientSignup);
router.post("/demo-request", requestDemo);

module.exports = router;