const Hospital = require("../models/Hospital");
const Patient = require("../models/Patient");
const User = require("../models/User");
const { getNextSequence } = require("../models/Counter");
const generateToken = require("../utils/generateToken");
const { runWithTenantContext } = require("../utils/tenantContext");

/** Public: list of hospitals a patient can sign up under (active or on trial - not suspended). */
async function listSignupHospitals(req, res) {
  try {
    const hospitals = await Hospital.find({ status: { $in: ["active", "trial"] } })
      .select("name")
      .sort({ name: 1 });
    res.json(hospitals);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error while listing hospitals." });
  }
}

function buildMrnPrefix(hospitalName) {
  const letters = hospitalName.replace(/[^a-zA-Z ]/g, "").split(" ").filter(Boolean);
  const initials = letters.map((w) => w[0]).join("").toUpperCase();
  return (initials || "HSP").slice(0, 4);
}

/**
 * Public patient self-signup. Runs inside a manually-established tenant
 * context (runWithTenantContext) since there's no logged-in user yet to
 * derive it from a JWT - this is the same pattern used when the Super
 * Admin creates a hospital's first admin account.
 *
 * Matching logic to avoid duplicate clinical records:
 *   1. Try to match an existing Patient in this hospital by CNIC.
 *   2. If no CNIC match, try matching by phone number.
 *   3. If still no match, create a brand new Patient record.
 * If a match IS found but it already has a linked account, signup is
 * rejected (they should log in or use "forgot password" instead).
 */
async function patientSignup(req, res) {
  try {
    const { hospitalId, name, phone, cnic, email, password, dob, gender, address } = req.body;

    if (!hospitalId || !name || !email || !password) {
      return res.status(400).json({ message: "hospitalId, name, email and password are required." });
    }
    if (password.length < 6) {
      return res.status(400).json({ message: "Password must be at least 6 characters." });
    }

    const hospital = await Hospital.findById(hospitalId);
    if (!hospital) return res.status(404).json({ message: "Selected hospital not found." });

    const result = await runWithTenantContext({ hospitalId }, async () => {
      let patient = null;

      if (cnic) {
        patient = await Patient.findOne({ cnic });
      }
      if (!patient && phone) {
        patient = await Patient.findOne({ phone });
      }

      if (patient && patient.userId) {
        return { conflict: true };
      }

      const user = await User.create({ name, email, password, role: "patient", status: "active" });

      if (patient) {
        // Link the new account to the existing clinical record. Fill in
        // any fields the existing record is missing, but never overwrite
        // what staff already verified and entered.
        patient.userId = user._id;
        if (email && !patient.email) patient.email = email;
        if (dob && !patient.dob) patient.dob = dob;
        if (gender && !patient.gender) patient.gender = gender;
        if (address && !patient.address) patient.address = address;
        await patient.save();
      } else {
        // No existing record - self-register a new one with whatever they gave us.
        const seq = await getNextSequence(hospitalId, "patient_mrn");
        const mrn = `${buildMrnPrefix(hospital.name)}-${String(seq).padStart(6, "0")}`;
        patient = await Patient.create({ mrn, name, phone, cnic, email, dob, gender, address, userId: user._id });
      }

      return { user, patient };
    });

    if (result.conflict) {
      return res.status(409).json({
        message: "An account already exists for this patient. Please log in instead, or use 'forgot password'.",
      });
    }

    const token = generateToken(result.user);
    res.status(201).json({
      token,
      user: {
        id: result.user._id,
        name: result.user.name,
        email: result.user.email,
        role: result.user.role,
        hospitalId,
        hospitalName: hospital.name,
      },
    });
  } catch (err) {
    if (err.code === 11000) {
      return res.status(409).json({ message: "An account with this email already exists." });
    }
    console.error(err);
    res.status(500).json({ message: "Server error during signup." });
  }
}

module.exports = { listSignupHospitals, patientSignup };