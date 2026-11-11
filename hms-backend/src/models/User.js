const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const tenantPlugin = require("../utils/tenantPlugin");

const ROLES = [
  "platform_super_admin", // you - not scoped to any single hospital
  "hospital_admin",
  "doctor",
  "receptionist",
  "nurse",
  "lab_technician",
  "pharmacist",
  "accountant",
  "patient",
];

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    // Global unique email (not per-hospital) - keeps login unambiguous:
    // one email always maps to exactly one account/hospital.
    email: { type: String, required: true, trim: true, lowercase: true, unique: true },
    password: { type: String, required: true, minlength: 8, select: false },
    role: { type: String, enum: ROLES, required: true },
    department: { type: String },
    status: {
      type: String,
      enum: ["active", "invited", "disabled"],
      default: "invited",
    },
    // Set for admin-generated / portal temporary passwords: the user may log in
    // but cannot use any other endpoint until they choose their own password.
    mustChangePassword: { type: Boolean, default: false },
    // Brute-force protection. Counted per account, reset on a successful login.
    failedLoginAttempts: { type: Number, default: 0 },
    lockUntil: { type: Date },
    // Forgot-password token: only its SHA-256 hash is stored, single use.
    resetTokenHash: { type: String, index: true, select: false },
    resetTokenExpiresAt: { type: Date, select: false },
    // Patient self-signup matched an existing clinical record: remember which one
    // and require the emailed one-time code before linking it to this account.
    pendingPatientId: { type: mongoose.Schema.Types.ObjectId, ref: "Patient" },
    claimCodeHash: { type: String, select: false },
    claimCodeExpiresAt: { type: Date, select: false },
    claimCodeAttempts: { type: Number, default: 0, select: false },
  },
  { timestamps: true }
);

userSchema.pre("save", async function (next) {
  if (!this.isModified("password")) return next();
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
  next();
});

userSchema.methods.comparePassword = function (candidate) {
  return bcrypt.compare(candidate, this.password);
};

// platform_super_admin is the ONE role allowed to exist without a
// hospitalId - so we apply tenantPlugin in non-strict mode here and
// handle the super-admin exception explicitly in the auth logic.
userSchema.plugin(tenantPlugin, { strict: false });
userSchema.path("hospitalId").required(false); // super admin has none

module.exports = mongoose.model("User", userSchema);
module.exports.ROLES = ROLES;
