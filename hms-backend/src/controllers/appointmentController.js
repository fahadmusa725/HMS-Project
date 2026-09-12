const Appointment = require("../models/Appointment");
const Patient = require("../models/Patient");
const { getNextSequence } = require("../models/Counter");
const { getCurrentHospitalId } = require("../utils/tenantContext");

async function bookAppointment(req, res) {
  try {
    const { patientId, doctorId, type, date, time, reason } = req.body;

    if (!patientId || !doctorId || !date) {
      return res.status(400).json({ message: "patientId, doctorId and date are required." });
    }

    // Confirm the patient actually exists (and belongs to this hospital -
    // tenantPlugin makes that check automatic).
    const patient = await Patient.findById(patientId);
    if (!patient) {
      return res.status(404).json({ message: "Patient not found." });
    }

    const hospitalId = getCurrentHospitalId();
    // Token numbers reset per day per hospital: counter name includes the date.
    const tokenNumber = await getNextSequence(hospitalId, `opd_token_${date}`);

    const appointment = await Appointment.create({
      patientId,
      doctorId,
      type: type || "OPD",
      date,
      time,
      tokenNumber,
      reason,
      bookedBy: req.user.userId,
    });

    res.status(201).json(appointment);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error while booking appointment." });
  }
}

/** The live OPD queue for a given date (defaults to today), optionally filtered by doctor. */
async function getQueue(req, res) {
  try {
    const { date, doctorId } = req.query;
    const targetDate = date || new Date().toISOString().slice(0, 10);

    const filter = { date: targetDate };
    if (doctorId) filter.doctorId = doctorId;

    const appointments = await Appointment.find(filter)
      .sort({ tokenNumber: 1 })
      .populate("patientId", "name mrn phone")
      .populate("doctorId", "name");

    res.json(appointments);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error while fetching queue." });
  }
}

async function updateAppointmentStatus(req, res) {
  try {
    const { status } = req.body;
    const allowed = ["scheduled", "checked_in", "in_consultation", "completed", "cancelled", "no_show"];

    if (!allowed.includes(status)) {
      return res.status(400).json({ message: `status must be one of: ${allowed.join(", ")}` });
    }

    const appointment = await Appointment.findByIdAndUpdate(
      req.params.id,
      { status },
      { new: true }
    );

    if (!appointment) return res.status(404).json({ message: "Appointment not found." });
    res.json(appointment);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error while updating appointment." });
  }
}

/** All appointments for one patient - their visit history. */
async function getPatientAppointments(req, res) {
  try {
    const appointments = await Appointment.find({ patientId: req.params.patientId })
      .sort({ createdAt: -1 })
      .populate("doctorId", "name");
    res.json(appointments);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error while fetching patient appointments." });
  }
}

module.exports = { bookAppointment, getQueue, updateAppointmentStatus, getPatientAppointments };
