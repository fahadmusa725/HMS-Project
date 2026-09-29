const Appointment = require("../models/Appointment");
const Patient = require("../models/Patient");
const User = require("../models/User");
const DoctorSchedule = require("../models/DoctorSchedule");
const Bill = require("../models/Bill");
const { getNextSequence } = require("../models/Counter");
const { getCurrentHospitalId } = require("../utils/tenantContext");
const { slotsForDate } = require("../utils/scheduleSlots");

/**
 * Shared booking path for staff (bookAppointment) and patient self-service
 * (bookMyAppointment). When the doctor has a DoctorSchedule, the requested
 * time must be one of their real slots on that day and not already taken.
 * If the schedule carries a consultation fee, an unpaid OPD bill is raised
 * straight away so the front desk can collect it at check-in.
 * Throws { status, message } for anything the caller should report as-is.
 */
async function createAppointmentWithBilling({ patientId, doctorId, type, date, time, reason, bookedByUserId }) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date || "")) {
    throw { status: 400, message: "date must be in YYYY-MM-DD format." };
  }
  if (date < new Date().toISOString().slice(0, 10)) {
    throw { status: 400, message: "Appointments cannot be booked for a past date." };
  }

  const doctor = await User.findOne({ _id: doctorId, role: "doctor", status: "active" }).select("name");
  if (!doctor) throw { status: 404, message: "Doctor not found." };

  const schedule = await DoctorSchedule.findOne({ doctorId });

  if (schedule) {
    if (!time) {
      throw { status: 400, message: "Please select a time slot for this doctor." };
    }
    const workingSlots = slotsForDate(schedule, date);
    if (workingSlots.length === 0) {
      throw { status: 400, message: "This doctor does not have working hours on the selected day." };
    }
    if (!workingSlots.includes(time)) {
      throw { status: 400, message: "The selected time is outside this doctor's working hours." };
    }
    const clash = await Appointment.findOne({ doctorId, date, time, status: { $ne: "cancelled" } });
    if (clash) {
      throw { status: 409, message: "This slot was just booked by someone else. Please pick another time." };
    }
  }

  // Token numbers reset per day per hospital: counter name includes the date.
  const tokenNumber = await getNextSequence(getCurrentHospitalId(), `opd_token_${date}`);

  const appointment = await Appointment.create({
    patientId,
    doctorId,
    type: type || "OPD",
    date,
    time,
    tokenNumber,
    reason,
    bookedBy: bookedByUserId,
  });

  let bill = null;
  if (schedule && schedule.consultationFee > 0) {
    try {
      bill = await Bill.create({
        patientId,
        appointmentId: appointment._id,
        items: [
          {
            description: `OPD Consultation Fee - Dr. ${doctor.name}`,
            category: "OPD",
            amount: schedule.consultationFee,
          },
        ],
        totalAmount: schedule.consultationFee,
        amountPaid: 0,
        paymentStatus: "unpaid",
        createdBy: bookedByUserId,
      });
    } catch (err) {
      // Don't leave a booked slot behind with no fee attached to it.
      await Appointment.findByIdAndDelete(appointment._id).catch(() => {});
      throw err;
    }
  }

  return { appointment, bill };
}

function sendBookingError(res, err, fallbackMessage) {
  if (err && err.status) {
    return res.status(err.status).json({ message: err.message });
  }
  console.error(err);
  res.status(500).json({ message: fallbackMessage });
}

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

    const { appointment, bill } = await createAppointmentWithBilling({
      patientId,
      doctorId,
      type,
      date,
      time,
      reason,
      bookedByUserId: req.user.userId,
    });

    res.status(201).json({ ...appointment.toObject(), bill });
  } catch (err) {
    sendBookingError(res, err, "Server error while booking appointment.");
  }
}

/**
 * The live OPD queue for a given date (defaults to today), optionally filtered
 * by doctor. Each entry carries a summary of its OPD fee bill (if any) so the
 * front desk can see at a glance who still needs to pay.
 */
async function getQueue(req, res) {
  try {
    const { date, doctorId } = req.query;
    const targetDate = date || new Date().toISOString().slice(0, 10);

    const filter = { date: targetDate };
    if (doctorId) filter.doctorId = doctorId;

    const appointments = await Appointment.find(filter)
      .sort({ tokenNumber: 1 })
      .populate("patientId", "name mrn phone")
      .populate("doctorId", "name department");

    const bills = await Bill.find({ appointmentId: { $in: appointments.map((a) => a._id) } }).select(
      "appointmentId totalAmount amountPaid paymentStatus"
    );
    const billByAppointment = new Map(bills.map((b) => [String(b.appointmentId), b]));

    res.json(
      appointments.map((a) => {
        const bill = billByAppointment.get(String(a._id));
        return {
          ...a.toObject(),
          bill: bill
            ? { _id: bill._id, totalAmount: bill.totalAmount, amountPaid: bill.amountPaid, paymentStatus: bill.paymentStatus }
            : null,
        };
      })
    );
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
// patientId for these endpoints) ---

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

/** All active doctors - used for doctor pickers outside of slot booking (e.g. admitting doctor, queue filter). */
async function listDoctors(req, res) {
  try {
    const doctors = await User.find({ role: "doctor", status: "active" }).select("name department").sort({ name: 1 });
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

    const { appointment, bill } = await createAppointmentWithBilling({
      patientId: patient._id,
      doctorId,
      type: "OPD",
      date,
      time,
      reason,
      bookedByUserId: req.user.userId,
    });

    res.status(201).json({ ...appointment.toObject(), bill });
  } catch (err) {
    sendBookingError(res, err, "Server error while booking your appointment.");
  }
}

module.exports = {
  bookAppointment,
  getQueue,
  updateAppointmentStatus,
  getPatientAppointments,
  getMyAppointments,
  listDoctors,
  bookMyAppointment,
};
