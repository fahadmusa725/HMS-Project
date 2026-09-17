const Patient = require("../models/Patient");
const Hospital = require("../models/Hospital");
const User = require("../models/User");
const { getNextSequence } = require("../models/Counter");
const { getCurrentHospitalId } = require("../utils/tenantContext");
const { sendEmail } = require("../utils/mailer");

/** Builds a short prefix from the hospital name for readable MRNs, e.g. "City Hospital" -> "CTH" */
function buildMrnPrefix(hospitalName) {
  const letters = hospitalName.replace(/[^a-zA-Z ]/g, "").split(" ").filter(Boolean);
  const initials = letters.map((w) => w[0]).join("").toUpperCase();
  return (initials || "HSP").slice(0, 4);
}

function generateTempPassword() {
  return Math.random().toString(36).slice(-10);
}

async function registerPatient(req, res) {
  try {
    const { name, dob, gender, phone, email, cnic, address, allergies, chronicConditions } = req.body;

    if (!name) {
      return res.status(400).json({ message: "Patient name is required." });
    }

    const hospitalId = getCurrentHospitalId();
    const seq = await getNextSequence(hospitalId, "patient_mrn");

    // Look up the hospital's real name for the MRN prefix - never trust
    // client-supplied hospitalName, since it could be spoofed.
    const hospital = await Hospital.findById(hospitalId);
    const prefix = buildMrnPrefix(hospital ? hospital.name : "HSP");
    const mrn = `${prefix}-${String(seq).padStart(6, "0")}`;

    const patient = await Patient.create({
      mrn,
      name,
      dob,
      gender,
      phone,
      email,
      cnic,
      address,
      allergies: allergies || [],
      chronicConditions: chronicConditions || [],
      registeredBy: req.user.userId,
    });

    res.status(201).json(patient);
  } catch (err) {
    if (err.code === 11000 && err.keyPattern?.cnic) {
      return res.status(409).json({ message: "A patient with this CNIC is already registered at this hospital." });
    }
    console.error(err);
    res.status(500).json({ message: "Server error while registering patient." });
  }
}

async function listPatients(req, res) {
  try {
    const { search, page = 1, limit = 20 } = req.query;
    const filter = {};

    if (search) {
      filter.$or = [
        { name: { $regex: search, $options: "i" } },
        { mrn: { $regex: search, $options: "i" } },
        { phone: { $regex: search, $options: "i" } },
      ];
    }

    const patients = await Patient.find(filter)
      .sort({ createdAt: -1 })
      .skip((Number(page) - 1) * Number(limit))
      .limit(Number(limit));

    const total = await Patient.countDocuments(filter);

    res.json({ patients, total, page: Number(page), limit: Number(limit) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error while listing patients." });
  }
}

async function getPatientById(req, res) {
  try {
    const patient = await Patient.findById(req.params.id);
    if (!patient) return res.status(404).json({ message: "Patient not found." });
    res.json(patient);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error while fetching patient." });
  }
}

async function updatePatient(req, res) {
  try {
    const updates = (({ name, dob, gender, phone, email, cnic, address, allergies, chronicConditions }) => ({
      name,
      dob,
      gender,
      phone,
      email,
      cnic,
      address,
      allergies,
      chronicConditions,
    }))(req.body);

    // Strip undefined keys so we don't overwrite fields the client didn't send
    Object.keys(updates).forEach((k) => updates[k] === undefined && delete updates[k]);

    const patient = await Patient.findByIdAndUpdate(req.params.id, updates, { new: true });
    if (!patient) return res.status(404).json({ message: "Patient not found." });
    res.json(patient);
  } catch (err) {
    if (err.code === 11000 && err.keyPattern?.cnic) {
      return res.status(409).json({ message: "A patient with this CNIC is already registered at this hospital." });
    }
    console.error(err);
    res.status(500).json({ message: "Server error while updating patient." });
  }
}

/**
 * Staff-assisted portal enrollment: creates a login account (role: patient)
 * linked to this clinical record, with a system-generated temp password
 * emailed to the patient. Requires the patient record to have an email.
 */
async function enablePortalAccess(req, res) {
  try {
    const patient = await Patient.findById(req.params.id);
    if (!patient) return res.status(404).json({ message: "Patient not found." });
    if (!patient.email) {
      return res.status(400).json({ message: "This patient has no email on file - add one before enabling portal access." });
    }
    if (patient.userId) {
      return res.status(409).json({ message: "This patient already has portal access." });
    }

    const tempPassword = generateTempPassword();
    const user = await User.create({
      name: patient.name,
      email: patient.email,
      password: tempPassword,
      role: "patient",
      status: "active",
    });

    patient.userId = user._id;
    await patient.save();

    await sendEmail({
      to: patient.email,
      subject: "Your patient portal account is ready",
      html: `<p>Hello ${patient.name},</p>
             <p>An account has been created for you to access your patient portal.</p>
             <p><strong>Email:</strong> ${patient.email}<br/>
             <strong>Temporary password:</strong> ${tempPassword}</p>
             <p>Please log in and change your password.</p>`,
    });

    res.json({ message: "Portal access enabled and credentials emailed to the patient." });
  } catch (err) {
    if (err.code === 11000) {
      return res.status(409).json({ message: "That email is already used by another account." });
    }
    console.error(err);
    res.status(500).json({ message: "Server error while enabling portal access." });
  }
}

/** For the logged-in patient: fetch their own clinical record. */
async function getMyPatientRecord(req, res) {
  try {
    const patient = await Patient.findOne({ userId: req.user.userId });
    if (!patient) return res.status(404).json({ message: "No patient record linked to this account." });
    res.json(patient);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error while fetching your record." });
  }
}

module.exports = {
  registerPatient,
  listPatients,
  getPatientById,
  updatePatient,
  enablePortalAccess,
  getMyPatientRecord,
};