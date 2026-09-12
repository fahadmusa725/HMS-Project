const User = require("../models/User");
const { ROLES } = require("../models/User");

const STAFF_ROLES = ROLES.filter(
  (r) => !["platform_super_admin", "hospital_admin", "patient"].includes(r)
);

/**
 * Hospital Admin invites a staff member. Because this route runs inside the
 * admin's own tenant context (set by protect() from their JWT), User.create()
 * automatically stamps the new user with the admin's hospitalId - there's no
 * way for an admin to accidentally (or deliberately) create a user under a
 * different hospital.
 */
async function createStaff(req, res) {
  try {
    const { name, email, password, role, department } = req.body;

    if (!name || !email || !password || !role) {
      return res.status(400).json({ message: "name, email, password and role are required." });
    }

    if (!STAFF_ROLES.includes(role)) {
      return res.status(400).json({
        message: `role must be one of: ${STAFF_ROLES.join(", ")}`,
      });
    }

    const staff = await User.create({
      name,
      email,
      password,
      role,
      department,
      status: "active",
    });

    res.status(201).json({
      id: staff._id,
      name: staff.name,
      email: staff.email,
      role: staff.role,
      department: staff.department,
    });
  } catch (err) {
    console.error(err);
    if (err.code === 11000) {
      return res.status(409).json({ message: "That email is already in use." });
    }
    res.status(500).json({ message: "Server error while creating staff." });
  }
}

/** List all staff in the admin's own hospital. */
async function listStaff(req, res) {
  try {
    const staff = await User.find({ role: { $ne: "patient" } }).select("-password");
    res.json(staff);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error while listing staff." });
  }
}

module.exports = { createStaff, listStaff };
