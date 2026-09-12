const NurseNote = require("../models/NurseNote");
const Admission = require("../models/Admission");

async function addNurseNote(req, res) {
  try {
    const { admissionId, note, vitals } = req.body;

    if (!admissionId || !note) {
      return res.status(400).json({ message: "admissionId and note are required." });
    }

    const admission = await Admission.findById(admissionId);
    if (!admission) return res.status(404).json({ message: "Admission not found." });

    const nurseNote = await NurseNote.create({
      admissionId,
      patientId: admission.patientId,
      nurseId: req.user.userId,
      note,
      vitals,
    });

    res.status(201).json(nurseNote);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error while adding nurse note." });
  }
}

/** All notes for one admission, in order - the nursing rounds log. */
async function getAdmissionNotes(req, res) {
  try {
    const notes = await NurseNote.find({ admissionId: req.params.admissionId })
      .sort({ createdAt: 1 })
      .populate("nurseId", "name");

    res.json(notes);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error while fetching nurse notes." });
  }
}

module.exports = { addNurseNote, getAdmissionNotes };