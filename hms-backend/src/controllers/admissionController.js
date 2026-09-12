const Admission = require("../models/Admission");
const Bed = require("../models/Bed");
const Patient = require("../models/Patient");

async function admitPatient(req, res) {
  try {
    const { patientId, wardId, bedId, doctorId, reason } = req.body;

    if (!patientId || !wardId || !bedId || !doctorId) {
      return res.status(400).json({ message: "patientId, wardId, bedId and doctorId are required." });
    }

    const [patient, bed] = await Promise.all([Patient.findById(patientId), Bed.findById(bedId)]);

    if (!patient) return res.status(404).json({ message: "Patient not found." });
    if (!bed) return res.status(404).json({ message: "Bed not found." });
    if (bed.status !== "vacant") {
      return res.status(409).json({ message: `Bed is currently ${bed.status}, not vacant.` });
    }

    const admission = await Admission.create({
      patientId,
      wardId,
      bedId,
      doctorId,
      reason,
      admittedBy: req.user.userId,
    });

    bed.status = "occupied";
    await bed.save();

    res.status(201).json(admission);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error while admitting patient." });
  }
}

async function dischargePatient(req, res) {
  try {
    const { id } = req.params; // admission id
    const { dischargeNotes } = req.body;

    const admission = await Admission.findById(id);
    if (!admission) return res.status(404).json({ message: "Admission not found." });
    if (admission.status === "discharged") {
      return res.status(409).json({ message: "Patient is already discharged." });
    }

    admission.status = "discharged";
    admission.dischargeDate = new Date();
    admission.dischargeNotes = dischargeNotes;
    await admission.save();

    await Bed.findByIdAndUpdate(admission.bedId, { status: "vacant" });

    res.json(admission);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error while discharging patient." });
  }
}

/** The live IPD list - everyone currently admitted. */
async function listActiveAdmissions(req, res) {
  try {
    const admissions = await Admission.find({ status: "admitted" })
      .populate("patientId", "name mrn phone")
      .populate("wardId", "name department")
      .populate("bedId", "bedNumber")
      .populate("doctorId", "name")
      .sort({ admitDate: -1 });

    res.json(admissions);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error while listing admissions." });
  }
}

async function getAdmissionById(req, res) {
  try {
    const admission = await Admission.findById(req.params.id)
      .populate("patientId", "name mrn phone")
      .populate("wardId", "name department")
      .populate("bedId", "bedNumber")
      .populate("doctorId", "name");

    if (!admission) return res.status(404).json({ message: "Admission not found." });
    res.json(admission);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error while fetching admission." });
  }
}

module.exports = { admitPatient, dischargePatient, listActiveAdmissions, getAdmissionById };