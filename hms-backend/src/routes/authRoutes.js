const express = require("express");
const { login, getMe, changePassword, forgotPassword, resetPassword } = require("../controllers/authController");
const protect = require("../middleware/auth");

const router = express.Router();

// Public: credentials in, token out; plus the two halves of the forgot-password flow.
router.post("/login", login);
router.post("/forgot-password", forgotPassword);
router.post("/reset-password", resetPassword);

router.get("/me", protect, getMe);
router.post("/change-password", protect, changePassword);

module.exports = router;
