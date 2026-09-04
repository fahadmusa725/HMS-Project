const User = require("../models/User");
const generateToken = require("../utils/generateToken");

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

    res.json({
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        hospitalId: user.hospitalId,
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error during login." });
  }
}

module.exports = { login };
