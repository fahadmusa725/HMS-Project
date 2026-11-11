const Patient = require("../models/Patient");
const Hospital = require("../models/Hospital");
const User = require("../models/User");
const { getNextSequence } = require("../models/Counter");
const { getCurrentHospitalId } = require("../utils/tenantContext");
const { sendEmail } = require("../utils/mailer");
const { escapeHtml, generateTempPassword, hashToken, safeCompare } = require("../utils/security");

const MAX_CLAIM_ATTEMPTS = 5;

/** Builds a short prefix from the hospital name for readable MRNs, e.g. "City Hospital" -> "CTH" */
function buildMrnPrefix(hospitalName) {
  const letters = hospitalName.replace(/[^a-zA-Z ]/g, "").split(" ").filter(Boolean);
  const initials = letters.map((w) => w[0]).join("").toUpperCase();
  return (initials || "HSP").slice(0, 4);
}

/** Drops the pending-record verification fields from a User document. */
function clearPendingClaim(userId) {
  return User.updateOne(
    { _id: userId },
    {
      $unset: { pendingPatientId: 1, claimCodeHash: 1, claimCodeExpiresAt: 1 },
      $set: { claimCodeAttempts: 0 },
    },
    { skipTenantScope: true }
  );
}

async function registerPatient(req, res) {
  try {
    const { name, dob, gender, phone, email, cnic, address, referredBy, allergies, chronicConditions } = req.body;

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
      referredBy,
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
    const updates = (({ name, dob, gender, phone, email, cnic, address, referredBy, allergies, chronicConditions }) => ({
      name,
      dob,
      gender,
      phone,
      email,
      cnic,
      address,
      referredBy,
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
      // The password was generated by staff and sent by email - force a change at first login.
      mustChangePassword: true,
    });

    patient.userId = user._id;
    await patient.save();

    const emailResult = await sendEmail({
      to: patient.email,
      subject: "Your patient portal account is ready",
      html: `<p>Hello ${escapeHtml(patient.name)},</p>
             <p>An account has been created for you to access your patient portal.</p>
             <p><strong>Email:</strong> ${escapeHtml(patient.email)}<br/>
             <strong>Temporary password:</strong> ${escapeHtml(tempPassword)}</p>
             <p>You will be asked to set your own password after logging in.</p>`,
    });

    res.json({
      message: emailResult.sent
        ? "Portal access enabled and credentials emailed to the patient."
        : "Portal access enabled, but the email could not be sent - share the temporary password with the patient.",
      emailSent: emailResult.sent,
      tempPassword: emailResult.sent ? undefined : tempPassword,
    });
  } catch (err) {
    if (err.code === 11000) {
      return res.status(409).json({ message: "That email is already used by another account." });
    }
    console.error(err);
    res.status(500).json({ message: "Server error while enabling portal access." });
  }
}

/**
 * Patient confirms ownership of an existing clinical record with the one-time code
 * emailed to the address already on that record during signup. Only then is the
 * record linked to this account - the code is single use and attempt-limited.
 */
async function claimPatientRecord(req, res) {
  try {
    const code = String(req.body.code || "").trim();
    if (!/^\d{6}$/.test(code)) {
      return res.status(400).json({ message: "Enter the 6-digit code from your email." });
    }

    const user = await User.findById(req.user.userId).select(
      "+claimCodeHash +claimCodeExpiresAt +claimCodeAttempts"
    );
    if (!user) return res.status(404).json({ message: "User not found." });

    if (!user.pendingPatientId || !user.claimCodeHash) {
      return res.status(400).json({ message: "There is no hospital record waiting to be linked to this account." });
    }

    if (!user.claimCodeExpiresAt || user.claimCodeExpiresAt < new Date()) {
      await clearPendingClaim(user._id);
      return res.status(400).json({ message: "This code has expired. Ask the front desk to link your record." });
    }

    if (user.claimCodeAttempts >= MAX_CLAIM_ATTEMPTS) {
      await clearPendingClaim(user._id);
      return res.status(429).json({ message: "Too many incorrect codes. Ask the front desk to link your record." });
    }

    if (!safeCompare(hashToken(code), user.claimCodeHash)) {
      await User.updateOne(
        { _id: user._id },
        { $inc: { claimCodeAttempts: 1 } },
        { skipTenantScope: true }
      );
      return res.status(400).json({ message: "Incorrect code. Please check and try again." });
    }

    const patient = await Patient.findById(user.pendingPatientId);
    if (!patient || patient.userId) {
      await clearPendingClaim(user._id);
      return res.status(409).json({
        message: "This record can no longer be linked automatically. Please contact the front desk.",
      });
    }

    patient.userId = user._id;
    await patient.save();
    await clearPendingClaim(user._id);

    res.json({ message: "Your hospital record has been linked to this account.", patient });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error while verifying your code." });
  }
}

/**
 * Front-desk path for records with no email on file: staff verify the person's
 * identity in person, then attach an existing portal account to this record.
 */
async function linkPortalAccount(req, res) {
  try {
    const email = String(req.body.email || "").trim().toLowerCase();
    if (!email) return res.status(400).json({ message: "The patient's portal account email is required." });

    const patient = await Patient.findById(req.params.id);
    if (!patient) return res.status(404).json({ message: "Patient not found." });
    if (patient.userId) {
      return res.status(409).json({ message: "This patient already has portal access." });
    }

    // User reads are tenant-scoped, so this can only ever find an account in this hospital.
    const user = await User.findOne({ email });
    if (!user || user.role !== "patient") {
      return res.status(404).json({ message: "No patient portal account exists with that email at this hospital." });
    }
    if (user.status !== "active") {
      return res.status(400).json({ message: "That portal account is not active." });
    }

    const alreadyLinked = await Patient.findOne({ userId: user._id });
    if (alreadyLinked) {
      return res.status(409).json({ message: "That portal account is already linked to another patient record." });
    }

    patient.userId = user._id;
    await patient.save();
    await clearPendingClaim(user._id);

    res.json({ message: `Linked ${patient.name}'s record to ${user.email}.`, patient });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error while linking the account." });
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

/**
 * For the logged-in patient: update their own record. Deliberately limited
 * to demographic/self-reported fields - name, mrn, and cnic stay
 * staff-controlled for record integrity (a patient can't silently rename
 * themselves or swap their identity number after registration).
 */
async function updateMyProfile(req, res) {
  try {
    const updates = (({ dob, gender, phone, address, allergies, chronicConditions }) => ({
      dob,
      gender,
      phone,
      address,
      allergies,
      chronicConditions,
    }))(req.body);
    Object.keys(updates).forEach((k) => updates[k] === undefined && delete updates[k]);

    const patient = await Patient.findOneAndUpdate({ userId: req.user.userId }, updates, { new: true });
    if (!patient) return res.status(404).json({ message: "No patient record linked to this account." });
    res.json(patient);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error while updating your profile." });
  }
}

module.exports = {
  registerPatient,
  listPatients,
  getPatientById,
  updatePatient,
  enablePortalAccess,
  claimPatientRecord,
  linkPortalAccount,
  getMyPatientRecord,
  updateMyProfile,
};