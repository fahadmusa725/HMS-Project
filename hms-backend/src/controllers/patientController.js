const Patient = require("../models/Patient");
const Hospital = require("../models/Hospital");
const { getNextSequence } = require("../models/Counter");
const { getCurrentHospitalId } = require("../utils/tenantContext");

/** Builds a short prefix from the hospital name for readable MRNs, e.g. "City Hospital" -> "CTH" */
function buildMrnPrefix(hospitalName) {
  const letters = hospitalName.replace(/[^a-zA-Z ]/g, "").split(" ").filter(Boolean);
  const initials = letters.map((w) => w[0]).join("").toUpperCase();
  return (initials || "HSP").slice(0, 4);
}

async function registerPatient(req, res) {
  try {
    const { name, dob, gender, phone, address, allergies, chronicConditions } = req.body;

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
      address,
      allergies: allergies || [],
      chronicConditions: chronicConditions || [],
      registeredBy: req.user.userId,
    });

    res.status(201).json(patient);
  } catch (err) {
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
    const updates = (({ name, dob, gender, phone, address, allergies, chronicConditions }) => ({
      name,
      dob,
      gender,
      phone,
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
    console.error(err);
    res.status(500).json({ message: "Server error while updating patient." });
  }
}

module.exports = { registerPatient, listPatients, getPatientById, updatePatient };
