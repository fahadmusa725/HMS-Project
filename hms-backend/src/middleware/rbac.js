/**
 * allowRoles("hospital_admin", "doctor") -> middleware that 403s
 * anyone whose JWT role isn't in the allowed list.
 * Must run AFTER protect() so req.user is populated.
 */
function allowRoles(...roles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ message: "Not authenticated." });
    }
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ message: "You don't have permission to do this." });
    }
    next();
  };
}

module.exports = allowRoles;
