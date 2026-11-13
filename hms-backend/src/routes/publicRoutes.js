const express = require("express");
const {
  listSignupHospitals,
  patientSignup,
  requestDemo,
  getDisplayQueue,
} = require("../controllers/publicController");
const { createRateLimiter } = require("../utils/rateLimit");

const router = express.Router();

// Deliberately NO protect() here - these are public, unauthenticated endpoints.

// A waiting room can hold several screens, each polling every 10s, all behind one NAT
// address - so this is generous per IP while still capping a runaway client or a scrape.
const displayLimiter = createRateLimiter({ windowMs: 60 * 1000, max: 180 });

router.get("/hospitals", listSignupHospitals);
router.post("/patient-signup", patientSignup);
router.post("/demo-request", requestDemo);
router.get("/display/:hospitalId", displayLimiter, getDisplayQueue);

module.exports = router;
