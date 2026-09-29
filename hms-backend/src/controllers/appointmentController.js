const PDFDocument = require("pdfkit");
const Appointment = require("../models/Appointment");
const Patient = require("../models/Patient");
const User = require("../models/User");
const Hospital = require("../models/Hospital");
const DoctorSchedule = require("../models/DoctorSchedule");
const Bill = require("../models/Bill");
const { getNextSequence } = require("../models/Counter");
const { getCurrentHospitalId } = require("../utils/tenantContext");
const { slotsForDate, hospitalNow, APP_TIMEZONE, HHMM_REGEX, toMinutes, toHHMM } = require("../utils/scheduleSlots");
const doctorName = require("../utils/doctorName");
const { REFERENCE_REQUIRED_METHODS, recalcBillTotals } = require("../utils/billTotals");

/**
 * Who may move an appointment INTO each status. The front desk runs arrival
 * (check-in / no-show), anyone clinical can start the consult, but only the
 * doctor can close it out - completion means a doctor actually saw the patient.
 */
const STATUS_TRANSITION_ROLES = {
  checked_in: ["receptionist", "hospital_admin"],
  cancelled: ["receptionist", "hospital_admin", "doctor"],
  no_show: ["receptionist", "hospital_admin"],
  in_consultation: ["nurse", "doctor", "hospital_admin", "receptionist"],
  completed: ["doctor"],
};

// Once an appointment reaches one of these, it's closed and can't be moved again.
const TERMINAL_STATUSES = ["completed", "cancelled", "no_show"];

// How early front desk can check a patient in before their scheduled slot.
const CHECK_IN_GRACE_MINUTES = 30;

/** "14:30" -> "2:30 PM" for printed output. Legacy free-text times pass through unchanged. */
function formatSlotTime(time) {
  const match = /^(\d{2}):(\d{2})$/.exec(time || "");
  if (!match) return time || "-";
  const h = Number(match[1]);
  return `${h % 12 || 12}:${match[2]} ${h < 12 ? "AM" : "PM"}`;
}

/**
 * Shared booking path for staff (bookAppointment) and patient self-service
 * (bookMyAppointment). When the doctor has a DoctorSchedule, the requested
 * time must be one of their real slots on that day and not already taken.
 * If the schedule carries a consultation fee, an unpaid OPD bill is raised
 * straight away so the front desk can collect it at check-in.
 * Throws { status, message } for anything the caller should report as-is.
 */
async function createAppointmentWithBilling({
  patientId,
  doctorId,
  type,
  date,
  time,
  reason,
  bookedByUserId,
  paymentMethod,
  paymentAmount,
  referenceNumber,
}) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date || "")) {
    throw { status: 400, message: "date must be in YYYY-MM-DD format." };
  }
  const collectPayment = Number(paymentAmount) > 0;
  if (collectPayment && REFERENCE_REQUIRED_METHODS.includes(paymentMethod) && !referenceNumber) {
    throw { status: 400, message: "A reference/transaction number is required for this payment method." };
  }
  const now = hospitalNow();
  if (date < now.date) {
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
    if (date === now.date && time <= now.time) {
      throw { status: 400, message: "That time slot has already passed today. Please pick a later slot." };
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
      if (collectPayment && Number(paymentAmount) > schedule.consultationFee) {
        throw { status: 400, message: `Payment amount exceeds the consultation fee of ${schedule.consultationFee}.` };
      }

      bill = new Bill({
        patientId,
        appointmentId: appointment._id,
        items: [
          {
            description: `OPD Consultation Fee - ${doctorName(doctor.name)}`,
            category: "OPD",
            amount: schedule.consultationFee,
          },
        ],
        totalAmount: schedule.consultationFee,
        payments: collectPayment
          ? [{ method: paymentMethod || "cash", amount: Number(paymentAmount), referenceNumber, paidBy: bookedByUserId }]
          : [],
        paymentMethod: collectPayment ? paymentMethod : undefined,
        createdBy: bookedByUserId,
      });
      recalcBillTotals(bill);
      await bill.save();
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
    const { patientId, doctorId, type, date, time, reason, paymentMethod, paymentAmount, referenceNumber } = req.body;

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
      paymentMethod,
      paymentAmount,
      referenceNumber,
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
    const targetDate = date || hospitalNow().date;

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
    const allowedRoles = STATUS_TRANSITION_ROLES[status];
    if (!allowedRoles) {
      return res.status(400).json({
        message: `status must be one of: ${Object.keys(STATUS_TRANSITION_ROLES).join(", ")}`,
      });
    }
    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ message: `Your role (${req.user.role}) cannot set an appointment to "${status}".` });
    }

    const appointment = await Appointment.findById(req.params.id);
    if (!appointment) return res.status(404).json({ message: "Appointment not found." });

    if (TERMINAL_STATUSES.includes(appointment.status)) {
      return res.status(409).json({ message: `This appointment is already ${appointment.status.replace("_", " ")}.` });
    }
    // A doctor may only close out or cancel their own patients, not a colleague's.
    if (req.user.role === "doctor" && String(appointment.doctorId) !== String(req.user.userId)) {
      return res.status(403).json({ message: "You can only update your own appointments." });
    }

    if (status === "checked_in") {
      const now = hospitalNow();
      if (appointment.date > now.date) {
        return res.status(400).json({ message: "This appointment is for a future date and cannot be checked in yet." });
      }
      if (appointment.date === now.date && appointment.time && HHMM_REGEX.test(appointment.time)) {
        const checkInOpensAt = toMinutes(appointment.time) - CHECK_IN_GRACE_MINUTES;
        if (toMinutes(now.time) < checkInOpensAt) {
          const opensAtTime = toHHMM(Math.max(checkInOpensAt, 0));
          return res.status(400).json({
            message: `This appointment is at ${formatSlotTime(appointment.time)} — check-in opens at ${formatSlotTime(opensAtTime)}.`,
          });
        }
      }
    }

    appointment.status = status;
    await appointment.save();
    res.json(appointment);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error while updating appointment status." });
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

/**
 * Printable OPD token slip (small receipt-sized PDF) the receptionist hands
 * over at booking/check-in. Patients may download their OWN slip only.
 */
async function getAppointmentSlipPdf(req, res) {
  try {
    const appointment = await Appointment.findById(req.params.id)
      .populate("patientId", "name mrn userId")
      .populate("doctorId", "name department");
    if (!appointment) return res.status(404).json({ message: "Appointment not found." });

    if (req.user.role === "patient" && String(appointment.patientId?.userId) !== String(req.user.userId)) {
      return res.status(403).json({ message: "You don't have permission to view this slip." });
    }

    const [hospital, bill] = await Promise.all([
      Hospital.findById(getCurrentHospitalId()).select("name"),
      Bill.findOne({ appointmentId: appointment._id }),
    ]);

    const doc = new PDFDocument({ size: [283, 420], margin: 18 });
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `inline; filename="token-slip-${appointment.date}-${appointment.tokenNumber}.pdf"`);
    doc.pipe(res);

    doc.font("Helvetica-Bold").fontSize(13).fillColor("#000").text(hospital ? hospital.name : "Hospital", { align: "center" });
    doc.font("Helvetica").fontSize(9).fillColor("#555").text("OPD Token Slip", { align: "center" });
    doc.moveDown(0.6);
    doc.strokeColor("#0F766E").lineWidth(1).moveTo(18, doc.y).lineTo(265, doc.y).stroke();
    doc.moveDown(0.6);

    doc.font("Helvetica").fontSize(8).fillColor("#555").text("TOKEN NO.", { align: "center" });
    doc.font("Helvetica-Bold").fontSize(40).fillColor("#0F766E").text(String(appointment.tokenNumber), { align: "center" });
    doc.moveDown(0.4);

    const row = (label, value) => {
      doc.font("Helvetica-Bold").fontSize(9).fillColor("#000").text(`${label}: `, { continued: true });
      doc.font("Helvetica").text(value || "-");
    };
    row("Patient", appointment.patientId ? `${appointment.patientId.name} (${appointment.patientId.mrn})` : "-");
    row(
      "Doctor",
      appointment.doctorId
        ? `${doctorName(appointment.doctorId.name)}${appointment.doctorId.department ? " - " + appointment.doctorId.department : ""}`
        : "-"
    );
    row("Date", new Date(appointment.date + "T00:00:00").toDateString());
    row("Time", formatSlotTime(appointment.time));
    if (appointment.reason) row("Reason", appointment.reason);

    if (bill) {
      doc.moveDown(0.5);
      doc.strokeColor("#DDDDDD").lineWidth(0.5).moveTo(18, doc.y).lineTo(265, doc.y).stroke();
      doc.moveDown(0.5);
      row("Consultation Fee", `Rs. ${bill.totalAmount.toLocaleString("en-US")}`);
      row("Paid", `Rs. ${bill.amountPaid.toLocaleString("en-US")} (${bill.paymentStatus.toUpperCase()})`);
    }

    doc.moveDown(1);
    doc.font("Helvetica").fontSize(7).fillColor("#888").text(`Printed ${new Date().toLocaleString("en-GB", { timeZone: APP_TIMEZONE })}`, { align: "center" });
    doc.text("Please wait for your token number to be called.", { align: "center" });

    doc.end();
  } catch (err) {
    console.error(err);
    if (!res.headersSent) {
      res.status(500).json({ message: "Server error while generating the slip." });
    }
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
  getAppointmentSlipPdf,
  getMyAppointments,
  listDoctors,
  bookMyAppointment,
};
