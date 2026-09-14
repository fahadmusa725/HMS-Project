const User = require("../models/User");
const Hospital = require("../models/Hospital");
const generateToken = require("../utils/generateToken");

/** Looks up the hospital's display name for a hospital-scoped user (null for super admin). */
async function resolveHospitalName(hospitalId) {
  if (!hospitalId) return null;
  const hospital = await Hospital.findById(hospitalId);
  return hospital ? hospital.name : null;
}

/**
 * Login works the same for every role including platform_super_admin.
 * Because User.hospitalId is scoped by tenantPlugin on READS, and we
 * don't yet have a tenant context at login time (nobody is logged in
 * yet!), we must explicitly bypass tenant scoping here with
 * { skipTenantScope: true } - this is the one legitimate place it's
 * needed, since login is inherently a cross-tenant lookup by email.
 */
async function login(req, res) {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ message: "Email and password are required." });
    }

    const user = await User.findOne({ email: email.toLowerCase() })
      .setOptions({ skipTenantScope: true })
      .select("+password");

    if (!user || user.status === "disabled") {
      return res.status(401).json({ message: "Invalid credentials." });
    }

    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res.status(401).json({ message: "Invalid credentials." });
    }

    const token = generateToken(user);
    const hospitalName = await resolveHospitalName(user.hospitalId);

    res.json({
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        hospitalId: user.hospitalId,
        hospitalName, // e.g. "City Hospital" - null for platform_super_admin
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error during login." });
  }
}

/**
 * Fetch the current user's fresh profile + hospital name at any time
 * (not just at login) - useful for the frontend to re-hydrate identity
 * info (e.g. after a page refresh) without forcing a re-login.
 */
async function getMe(req, res) {
  try {
    const user = await User.findById(req.user.userId).setOptions({ skipTenantScope: true });
    if (!user) return res.status(404).json({ message: "User not found." });

    const hospitalName = await resolveHospitalName(user.hospitalId);

    res.json({
      id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      hospitalId: user.hospitalId,
      hospitalName,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error while fetching profile." });
  }
}

module.exports = { login, getMe };