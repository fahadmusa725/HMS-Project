const Appointment = require("../models/Appointment");
const Patient = require("../models/Patient");
const User = require("../models/User");
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

// --- Patient self-service (secure by construction: always derives their
// OWN linked Patient record from the JWT, never trusts a client-supplied
// patientId for these three endpoints) ---

async function getMyAppointments(req, res) {
  try {
    const patient = await Patient.findOne({ userId: req.user.userId });
    if (!patient) return res.status(404).json({ message: "No patient record linked to this account." });

    const appointments = await Appointment.find({ patientId: patient._id })
      .sort({ createdAt: -1 })
      .populate("doctorId", "name department");
    res.json(appointments);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error while fetching your appointments." });
  }
}

/** List doctors a patient can choose from when self-booking. */
async function listDoctorsForBooking(req, res) {
  try {
    const doctors = await User.find({ role: "doctor", status: "active" }).select("name department");
    res.json(doctors);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error while listing doctors." });
  }
}

async function bookMyAppointment(req, res) {
  try {
    const { doctorId, date, time, reason } = req.body;
    if (!doctorId || !date) {
      return res.status(400).json({ message: "doctorId and date are required." });
    }

    const patient = await Patient.findOne({ userId: req.user.userId });
    if (!patient) return res.status(404).json({ message: "No patient record linked to this account." });

    const hospitalId = getCurrentHospitalId();
    const tokenNumber = await getNextSequence(hospitalId, `opd_token_${date}`);

    const appointment = await Appointment.create({
      patientId: patient._id,
      doctorId,
      type: "OPD",
      date,
      time,
      tokenNumber,
      reason,
      bookedBy: req.user.userId,
    });

    res.status(201).json(appointment);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error while booking your appointment." });
  }
}

module.exports = {
  bookAppointment,
  getQueue,
  updateAppointmentStatus,
  getPatientAppointments,
  getMyAppointments,
  listDoctorsForBooking,
  bookMyAppointment,
};