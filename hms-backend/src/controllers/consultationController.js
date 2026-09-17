const Consultation = require("../models/Consultation");
const Appointment = require("../models/Appointment");
const Patient = require("../models/Patient");

async function createConsultation(req, res) {
  try {
    const {
      patientId,
      appointmentId,
      vitals,
      symptoms,
      diagnosis,
      notes,
      prescriptions,
      followUpDate,
    } = req.body;

    if (!patientId) {
      return res.status(400).json({ message: "patientId is required." });
    }

    // Confirm the patient exists in this hospital (tenantPlugin makes this automatic).
    const patient = await Patient.findById(patientId);
    if (!patient) {
      return res.status(404).json({ message: "Patient not found." });
    }

    const consultation = await Consultation.create({
      patientId,
      doctorId: req.user.userId,
      appointmentId,
      vitals,
      symptoms,
      diagnosis,
      notes,
      prescriptions: prescriptions || [],
      followUpDate,
    });

    // If this consultation is tied to an appointment, mark it completed.
    if (appointmentId) {
      await Appointment.findByIdAndUpdate(appointmentId, { status: "completed" });
    }

    res.status(201).json(consultation);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error while creating consultation." });
  }
}

/** The patient's EMR timeline - every consultation they've ever had, newest first. */
async function getPatientEMR(req, res) {
  try {
    const consultations = await Consultation.find({ patientId: req.params.patientId })
      .sort({ createdAt: -1 })
      .populate("doctorId", "name department");

    res.json(consultations);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error while fetching EMR." });
  }
}

async function getConsultationById(req, res) {
  try {
    const consultation = await Consultation.findById(req.params.id)
      .populate("doctorId", "name department")
      .populate("patientId", "name mrn");

    if (!consultation) return res.status(404).json({ message: "Consultation not found." });
    res.json(consultation);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error while fetching consultation." });
  }
}

/** Patient self-service: their own EMR timeline, derived from their linked patient record. */
async function getMyEMR(req, res) {
  try {
    const patient = await Patient.findOne({ userId: req.user.userId });
    if (!patient) return res.status(404).json({ message: "No patient record linked to this account." });

    const consultations = await Consultation.find({ patientId: patient._id })
      .sort({ createdAt: -1 })
      .populate("doctorId", "name department");
    res.json(consultations);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error while fetching your medical history." });
  }
}

module.exports = { createConsultation, getPatientEMR, getConsultationById, getMyEMR };