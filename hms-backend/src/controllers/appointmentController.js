const PDFDocument = require("pdfkit");
const Appointment = require("../models/Appointment");
const Patient = require("../models/Patient");
const User = require("../models/User");
const Hospital = require("../models/Hospital");
const DoctorSchedule = require("../models/DoctorSchedule");
const Bill = require("../models/Bill");
const AuditLog = require("../models/AuditLog");
const { getNextSequence, releaseSequence } = require("../models/Counter");
const { getCurrentHospitalId } = require("../utils/tenantContext");
const { slotsForDate, hospitalNow, APP_TIMEZONE, HHMM_REGEX, toMinutes, toHHMM } = require("../utils/scheduleSlots");
const doctorName = require("../utils/doctorName");
const { REFERENCE_REQUIRED_METHODS, recalcBillTotals } = require("../utils/billTotals");
const { PRIORITY_RANK, compareWaitingOrder } = require("../utils/queueOrder");
const { getHospitalSettings, ageInYears } = require("../utils/hospitalSettings");
const { flagStaleNoShows } = require("../utils/noShowSweep");
const { buildMrnPrefix } = require("../utils/mrn");

/**
 * Who may move an appointment INTO each status. The front desk runs arrival
 * (check-in / no-show), anyone clinical can start the consult, but only the
 * doctor can close it out - completion means a doctor actually saw the patient.
 * Patients may also cancel their own upcoming appointment (ownership and
 * "scheduled only" are enforced in updateAppointmentStatus).
 */
const STATUS_TRANSITION_ROLES = {
  checked_in: ["receptionist", "hospital_admin", "patient"],
  cancelled: ["receptionist", "hospital_admin", "doctor", "patient"],
  no_show: ["receptionist", "hospital_admin"],
  in_consultation: ["nurse", "doctor", "hospital_admin", "receptionist"],
  completed: ["doctor"],
};

// Once an appointment reaches one of these, it's closed and can't be moved again.
const TERMINAL_STATUSES = ["completed", "cancelled", "no_show"];

/**
 * Forward-only state machine: scheduled -> checked_in -> in_consultation -> completed, one step
 * at a time, plus cancelled/no_show as valid exits while an appointment is still waiting to be
 * seen. Nothing moves backward or sideways (e.g. in_consultation can't go back to scheduled).
 */
const VALID_TRANSITIONS = {
  scheduled: ["checked_in", "cancelled", "no_show"],
  checked_in: ["in_consultation", "cancelled", "no_show"],
  in_consultation: ["completed"],
};

// How early front desk (or the patient themself) can check in before their scheduled slot.
const CHECK_IN_GRACE_MINUTES = 30;

// Queue display order: a doctor's current patient first, then their waiting list in call
// order (see utils/queueOrder.js), then scheduled/closed rows by token.
const STATUS_BUCKET = { in_consultation: 0, checked_in: 1, scheduled: 2, completed: 3, cancelled: 4, no_show: 5 };

/** "14:30" -> "2:30 PM" for printed output. Legacy free-text times pass through unchanged. */
function formatSlotTime(time) {
  const match = /^(\d{2}):(\d{2})$/.exec(time || "");
  if (!match) return time || "-";
  const h = Number(match[1]);
  return `${h % 12 || 12}:${match[2]} ${h < 12 ? "AM" : "PM"}`;
}

/** Per-doctor, per-day token sequence - each doctor room has its own numbering. */
function opdTokenCounterName(doctorId, date) {
  return `opd_token_${doctorId}_${date}`;
}

function normalizePriority(priority, priorityReason) {
  const value = priority || "normal";
  if (!Object.prototype.hasOwnProperty.call(PRIORITY_RANK, value)) {
    throw { status: 400, message: "priority must be one of: normal, senior, emergency." };
  }
  const reason = typeof priorityReason === "string" ? priorityReason.trim() : "";
  if (value !== "normal" && !reason) {
    throw { status: 400, message: "A reason is required when priority is senior or emergency." };
  }
  return { priority: value, priorityReason: value === "normal" ? undefined : reason };
}

function describeDuplicate(duplicate) {
  const when = duplicate.time ? `at ${formatSlotTime(duplicate.time)}` : "as a walk-in token";
  return `This patient already has an appointment with this doctor today (Token #${duplicate.tokenNumber} ${when}, status: ${duplicate.status.replace("_", " ")}). Cancel it first, or pick a different doctor/date if this is intentional.`;
}

function compareQueueEntries(a, b) {
  const doctorCompare = String(a.doctorId?.name || "").localeCompare(String(b.doctorId?.name || ""));
  if (doctorCompare) return doctorCompare;

  const bucket = (STATUS_BUCKET[a.status] ?? 9) - (STATUS_BUCKET[b.status] ?? 9);
  if (bucket) return bucket;

  if (a.status === "checked_in" && b.status === "checked_in") return compareWaitingOrder(a, b);
  return (a.tokenNumber || 0) - (b.tokenNumber || 0);
}

/**
 * Shared booking path for staff (bookAppointment, walk-in) and patient self-service
 * (bookMyAppointment). When the doctor has a DoctorSchedule, a slot booking's time
 * must be one of their real slots on that day and not already taken. Walk-ins skip
 * that validation entirely and never carry a time.
 *
 * If the schedule carries a consultation fee, an unpaid OPD bill is raised straight
 * away so the front desk can collect it at check-in - walk-ins get exactly the same bill.
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
  priority,
  priorityReason,
  status = "scheduled",
  checkedInAt,
  skipSlotValidation = false,
}) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date || "")) {
    throw { status: 400, message: "date must be in YYYY-MM-DD format." };
  }

  const normalizedPriority = normalizePriority(priority, priorityReason);

  const collectPayment = Number(paymentAmount) > 0;
  if (paymentAmount !== undefined && paymentAmount !== null && (!Number.isFinite(Number(paymentAmount)) || Number(paymentAmount) < 0)) {
    throw { status: 400, message: "Payment amount must be a positive number." };
  }
  if (collectPayment && REFERENCE_REQUIRED_METHODS.includes(paymentMethod) && !referenceNumber) {
    throw { status: 400, message: "A reference/transaction number is required for this payment method." };
  }

  const now = hospitalNow();
  if (date < now.date) {
    throw { status: 400, message: "Appointments cannot be booked for a past date." };
  }

  const doctor = await User.findOne({ _id: doctorId, role: "doctor", status: "active" }).select("name");
  if (!doctor) throw { status: 404, message: "Doctor not found." };

  // Same patient, same doctor, same day, not cancelled/no-show - almost always a duplicate
  // booking rather than an intentional same-day follow-up, so this is blocked outright rather
  // than just warned. The partial unique index on Appointment is the real guarantee; this
  // check only exists to give a friendlier error before the write races.
  const duplicate = await Appointment.findOne({
    patientId,
    doctorId,
    date,
    status: { $nin: ["cancelled", "no_show"] },
  });
  if (duplicate) throw { status: 409, message: describeDuplicate(duplicate) };

  const schedule = await DoctorSchedule.findOne({ doctorId });

  if (!skipSlotValidation && schedule) {
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
    // A stale "scheduled" appointment sitting on this exact slot should free it up, not block it.
    // Booking is a write path where the answer has to be current, so it bypasses the read throttle.
    await flagStaleNoShows({ force: true });
    const clash = await Appointment.findOne({ doctorId, date, time, status: { $nin: ["cancelled", "no_show"] } });
    if (clash) {
      throw { status: 409, message: "This slot was just booked by someone else. Please pick another time." };
    }
  }

  // Validate the payment against the fee BEFORE allocating a token, so a bad amount never
  // burns a number.
  if (schedule && schedule.consultationFee > 0 && collectPayment && Number(paymentAmount) > schedule.consultationFee) {
    throw { status: 400, message: `Payment amount exceeds the consultation fee of ${schedule.consultationFee}.` };
  }

  // Token numbers reset per doctor per day: counter name includes both doctorId and date.
  const hospitalId = getCurrentHospitalId();
  const counterName = opdTokenCounterName(doctorId, date);
  const tokenNumber = await getNextSequence(hospitalId, counterName);

  const appointmentFields = {
    patientId,
    doctorId,
    type: type || "OPD",
    date,
    tokenNumber,
    reason,
    priority: normalizedPriority.priority,
    bookedBy: bookedByUserId,
    status,
  };
  if (normalizedPriority.priorityReason) appointmentFields.priorityReason = normalizedPriority.priorityReason;
  // Never send `time: undefined` for a walk-in - the slot index is partial on time existing.
  if (time) appointmentFields.time = time;
  if (status === "checked_in") appointmentFields.checkedInAt = checkedInAt || new Date();

  let appointment;
  try {
    appointment = await Appointment.create(appointmentFields);
  } catch (err) {
    // The token never became a visible queue entry: reclaim it when it is still the tail,
    // otherwise leave a harmless gap (see releaseSequence in models/Counter.js).
    await releaseSequence(hospitalId, counterName, tokenNumber).catch(() => {});
    throw err;
  }

  let bill = null;
  if (schedule && schedule.consultationFee > 0) {
    try {
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
      // Don't leave an orphaned appointment (and its slot) behind with no fee attached to it.
      await Appointment.findByIdAndDelete(appointment._id).catch(() => {});
      await releaseSequence(hospitalId, counterName, tokenNumber).catch(() => {});
      throw err;
    }
  }

  return { appointment, bill };
}

/**
 * Maps controller-level errors, duplicate-key races and schema validation failures to a
 * readable response. Duplicate keys are the normal outcome of two desks booking at once,
 * so they must never surface as a 500.
 */
function sendBookingError(res, err, fallbackMessage) {
  if (err && err.status) {
    return res.status(err.status).json({ message: err.message });
  }
  if (err && err.code === 11000) {
    const keys = err.keyPattern || {};
    const message = keys.patientId
      ? "This patient already has an appointment with this doctor today. Cancel it first, or pick a different doctor/date if this is intentional."
      : keys.time
        ? "This slot was just booked by someone else. Please pick another time."
        : "This appointment conflicts with an existing booking. Please refresh and try again.";
    return res.status(409).json({ message });
  }
  if (err && err.name === "ValidationError") {
    const first = Object.values(err.errors || {})[0];
    return res.status(400).json({ message: first?.message || "Please check the appointment details." });
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
 * Walk-in token for the front desk: either an existing patientId, or a minimal
 * quick-register (name + phone, CNIC optional). The token is issued immediately in
 * checked_in state with no time, even when the doctor has a schedule - walk-ins do
 * not consume a slot. Billing is identical to a normal booking.
 */
async function createWalkIn(req, res) {
  try {
    const {
      patientId,
      name,
      phone,
      cnic,
      dob,
      gender,
      address,
      doctorId,
      reason,
      priority,
      priorityReason,
      paymentMethod,
      paymentAmount,
      referenceNumber,
    } = req.body;

    if (!doctorId) {
      return res.status(400).json({ message: "Please select a doctor for this walk-in." });
    }

    let targetPatientId = patientId;

    if (!targetPatientId) {
      if (!name || !phone) {
        return res.status(400).json({
          message: "Select an existing patient, or enter at least a name and phone number to register a new one.",
        });
      }

      const hospitalId = getCurrentHospitalId();
      const hospital = await Hospital.findById(hospitalId).select("name");
      const seq = await getNextSequence(hospitalId, "patient_mrn");
      const mrn = `${buildMrnPrefix(hospital ? hospital.name : "HSP")}-${String(seq).padStart(6, "0")}`;

      const patient = await Patient.create({
        mrn,
        name,
        phone,
        cnic,
        dob: dob || undefined,
        gender: gender || undefined,
        address: address || undefined,
        referredBy: "Walk-in",
        registeredBy: req.user.userId,
      });
      targetPatientId = patient._id;
    } else {
      const patient = await Patient.findById(targetPatientId).select("_id");
      if (!patient) return res.status(404).json({ message: "Patient not found." });
    }

    // A write path, so refreshing stale no-shows here is allowed (the queue GET never writes).
    await flagStaleNoShows({ force: true });

    const { appointment, bill } = await createAppointmentWithBilling({
      patientId: targetPatientId,
      doctorId,
      type: "OPD",
      date: hospitalNow().date,
      time: undefined,
      reason,
      bookedByUserId: req.user.userId,
      paymentMethod,
      paymentAmount,
      referenceNumber,
      priority,
      priorityReason,
      status: "checked_in",
      checkedInAt: new Date(),
      skipSlotValidation: true,
    });

    res.status(201).json({ ...appointment.toObject(), bill });
  } catch (err) {
    if (err && err.code === 11000 && err.keyPattern?.cnic) {
      return res.status(409).json({ message: "A patient with this CNIC is already registered at this hospital." });
    }
    sendBookingError(res, err, "Server error while issuing the walk-in token.");
  }
}

/**
 * The live OPD queue for a given date (defaults to today), optionally filtered
 * by doctor. READ-ONLY: no lazy no-show sweep here - GET /queue must never write.
 * The sweep runs on booking/walk-in/call-next and from the daily cron instead.
 *
 * Rows are grouped per doctor so each room's now-serving + waiting order is obvious,
 * and each row carries a `suggestedPriority` when the patient's age crosses the
 * hospital's senior threshold - a suggestion only, staff must confirm it.
 */
async function getQueue(req, res) {
  try {
    const { date, doctorId } = req.query;
    const targetDate = date || hospitalNow().date;

    const filter = { date: targetDate };
    if (doctorId) filter.doctorId = doctorId;

    const [appointments, settings] = await Promise.all([
      Appointment.find(filter)
        .populate("patientId", "name mrn phone dob")
        .populate("doctorId", "name department")
        .lean(),
      getHospitalSettings(),
    ]);

    const bills = await Bill.find({ appointmentId: { $in: appointments.map((a) => a._id) } })
      .select("appointmentId totalAmount amountPaid paymentStatus")
      .lean();
    const billByAppointment = new Map(bills.map((b) => [String(b.appointmentId), b]));

    const queue = appointments.map((appointment) => {
      const bill = billByAppointment.get(String(appointment._id));
      const age = ageInYears(appointment.patientId?.dob);
      const canSuggest =
        ["scheduled", "checked_in"].includes(appointment.status) &&
        (appointment.priority || "normal") === "normal" &&
        age !== null &&
        age >= settings.seniorAgeThreshold;

      return {
        ...appointment,
        patientAge: age,
        suggestedPriority: canSuggest ? "senior" : null,
        bill: bill
          ? { _id: bill._id, totalAmount: bill.totalAmount, amountPaid: bill.amountPaid, paymentStatus: bill.paymentStatus }
          : null,
      };
    });

    queue.sort(compareQueueEntries);
    res.json(queue);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error while fetching queue." });
  }
}

/**
 * "Call next" for a doctor room: takes the highest-priority checked-in patient
 * (priority rank -> checkedInAt -> tokenNumber) and moves them to in_consultation.
 * A doctor can never have two patients in_consultation at once - the partial unique
 * index on Appointment enforces that even if two desks press the button together.
 */
async function callNextPatient(req, res) {
  try {
    const doctorId = req.user.role === "doctor" ? req.user.userId : req.body.doctorId || req.query.doctorId;
    if (!doctorId) return res.status(400).json({ message: "doctorId is required." });

    const doctor = await User.findOne({ _id: doctorId, role: "doctor", status: "active" }).select("name");
    if (!doctor) return res.status(404).json({ message: "Doctor not found." });

    const today = hospitalNow().date;

    // A write path, so refresh stale no-shows before choosing the next patient.
    await flagStaleNoShows({ force: true });

    const current = await Appointment.findOne({ doctorId, date: today, status: "in_consultation" }).select(
      "tokenNumber"
    );
    if (current) {
      return res.status(409).json({
        message: `${doctorName(doctor.name)} is already with Token #${current.tokenNumber}. Complete that consultation before calling the next patient.`,
      });
    }

    const waiting = await Appointment.find({ doctorId, date: today, status: "checked_in" })
      .select("tokenNumber priority checkedInAt createdAt")
      .lean();
    if (waiting.length === 0) {
      return res.status(409).json({ message: "No checked-in patients are waiting for this doctor right now." });
    }

    waiting.sort(compareWaitingOrder);
    const next = waiting[0];

    let updated;
    try {
      updated = await Appointment.findOneAndUpdate(
        { _id: next._id, status: "checked_in" },
        { $set: { status: "in_consultation" } },
        { new: true }
      )
        .populate("patientId", "name mrn phone")
        .populate("doctorId", "name department");
    } catch (err) {
      if (err.code === 11000) {
        return res.status(409).json({
          message: "That doctor already has a patient in consultation. Complete it before calling the next patient.",
        });
      }
      throw err;
    }

    if (!updated) {
      return res.status(409).json({ message: "That patient was just called by someone else. Refresh the queue and try again." });
    }

    res.json(updated);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error while calling the next patient." });
  }
}

/**
 * Sets (or clears) queue priority. Only reception, hospital admin and the doctor
 * may do this - patients never can. Every actual change writes a detailed audit
 * entry (the generic middleware entry is suppressed via res.locals.auditHandled).
 */
async function setAppointmentPriority(req, res) {
  try {
    const { priority, priorityReason } = req.body;
    let normalized;
    try {
      normalized = normalizePriority(priority, priorityReason);
    } catch (err) {
      return res.status(err.status).json({ message: err.message });
    }

    const appointment = await Appointment.findById(req.params.id);
    if (!appointment) return res.status(404).json({ message: "Appointment not found." });

    if (TERMINAL_STATUSES.includes(appointment.status)) {
      return res.status(409).json({ message: `This appointment is already ${appointment.status.replace("_", " ")}.` });
    }
    // A doctor may only re-prioritise their own patients, never a colleague's.
    if (req.user.role === "doctor" && String(appointment.doctorId) !== String(req.user.userId)) {
      return res.status(403).json({ message: "You can only update your own appointments." });
    }

    const previousPriority = appointment.priority || "normal";
    const previousReason = appointment.priorityReason || "";
    const unchanged =
      previousPriority === normalized.priority &&
      (normalized.priority === "normal" || previousReason === normalized.priorityReason);
    if (unchanged) return res.json(appointment);

    appointment.priority = normalized.priority;
    appointment.priorityReason = normalized.priorityReason;
    await appointment.save();

    res.locals.auditHandled = true;
    await AuditLog.create({
      userId: req.user.userId,
      userRole: req.user.role,
      method: "PATCH",
      path: `/api/appointments/${appointment._id}/priority`,
      statusCode: 200,
      details: `Priority ${previousPriority} -> ${normalized.priority}${
        normalized.priorityReason ? ` (${normalized.priorityReason})` : ""
      }`,
    }).catch((err) => console.error("[AuditLog] failed to write priority entry:", err.message));

    res.json(appointment);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error while updating priority." });
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
    if (!VALID_TRANSITIONS[appointment.status]?.includes(status)) {
      return res.status(409).json({
        message: `Cannot move an appointment from "${appointment.status.replace("_", " ")}" to "${status.replace("_", " ")}".`,
      });
    }
    // A doctor may only close out or cancel their own patients, not a colleague's.
    if (req.user.role === "doctor" && String(appointment.doctorId) !== String(req.user.userId)) {
      return res.status(403).json({ message: "You can only update your own appointments." });
    }

    const now = hospitalNow();

    if (req.user.role === "patient") {
      // A patient may only act on their own appointment.
      const ownPatient = await Patient.findOne({ userId: req.user.userId }).select("_id");
      if (!ownPatient || String(appointment.patientId) !== String(ownPatient._id)) {
        return res.status(403).json({ message: "You can only update your own appointment." });
      }

      if (status === "checked_in") {
        const settings = await getHospitalSettings();
        if (!settings.allowPatientSelfCheckIn) {
          return res.status(403).json({
            message: "Self check-in is disabled for this hospital. Please check in at the reception desk.",
          });
        }
      }

      if (status === "cancelled") {
        if (appointment.date < now.date) {
          return res.status(400).json({ message: "A past appointment cannot be cancelled." });
        }
        if (appointment.status !== "scheduled") {
          return res.status(409).json({
            message: "You can only cancel an appointment before checking in. Please ask reception for help.",
          });
        }
      }
    }

    if (status === "checked_in") {
      if (appointment.date > now.date) {
        return res.status(400).json({ message: "This appointment is for a future date and cannot be checked in yet." });
      }
      if (appointment.date === now.date && appointment.time && HHMM_REGEX.test(appointment.time)) {
        const checkInOpensAt = toMinutes(appointment.time) - CHECK_IN_GRACE_MINUTES;
        if (toMinutes(now.time) < checkInOpensAt) {
          const opensAtTime = toHHMM(Math.max(checkInOpensAt, 0));
          return res.status(400).json({
            message: `This appointment is at ${formatSlotTime(appointment.time)}. Check-in opens at ${formatSlotTime(opensAtTime)}.`,
          });
        }
      }
    }

    appointment.status = status;
    if (status === "checked_in" && !appointment.checkedInAt) appointment.checkedInAt = new Date();

    try {
      await appointment.save();
    } catch (err) {
      if (err.code === 11000) {
        return res.status(409).json({
          message: "This doctor already has a patient in consultation. Complete it before starting another.",
        });
      }
      throw err;
    }

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
 * Tokens are per doctor per day, so the slip always prints the doctor's name
 * next to the number to keep it unambiguous.
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
    doc.strokeColor("#1F5F5B").lineWidth(1).moveTo(18, doc.y).lineTo(265, doc.y).stroke();
    doc.moveDown(0.6);

    doc.font("Helvetica").fontSize(8).fillColor("#555").text("TOKEN NO.", { align: "center" });
    doc.font("Helvetica-Bold").fontSize(40).fillColor("#1F5F5B").text(String(appointment.tokenNumber), { align: "center" });
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
    row("Time", appointment.time ? formatSlotTime(appointment.time) : "Walk-in (any time today)");
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

/**
 * Today's live OPD position for the logged-in patient: their token, how many
 * checked-in patients are ahead of them (same call order as the queue), the
 * doctor's current token, and an estimated wait from the hospital's average
 * consultation minutes. Polled by the portal every 15 seconds.
 */
async function getMyLiveStatus(req, res) {
  try {
    const patient = await Patient.findOne({ userId: req.user.userId }).select("_id");
    if (!patient) return res.status(404).json({ message: "No patient record linked to this account." });

    const settings = await getHospitalSettings();
    const today = hospitalNow().date;
    const base = {
      date: today,
      appointment: null,
      patientsAhead: null,
      nowServingToken: null,
      nextToken: null,
      estimatedWaitMinutes: null,
      selfCheckInAllowed: settings.allowPatientSelfCheckIn,
      averageConsultationMinutes: settings.averageConsultationMinutes,
    };

    const todays = await Appointment.find({
      patientId: patient._id,
      date: today,
      status: { $in: ["scheduled", "checked_in", "in_consultation", "completed"] },
    })
      .populate("doctorId", "name department")
      .lean();

    if (todays.length === 0) return res.json(base);

    const statusRank = { in_consultation: 0, checked_in: 1, scheduled: 2, completed: 3 };
    todays.sort(
      (a, b) =>
        (statusRank[a.status] ?? 9) - (statusRank[b.status] ?? 9) || (a.tokenNumber || 0) - (b.tokenNumber || 0)
    );
    const appointment = todays[0];

    let patientsAhead = null;
    let nowServingToken = null;
    let nextToken = null;

    if (appointment.doctorId) {
      const doctorQueue = await Appointment.find({
        doctorId: appointment.doctorId._id,
        date: today,
        status: { $in: ["checked_in", "in_consultation"] },
      })
        .select("status tokenNumber priority checkedInAt createdAt")
        .lean();

      const serving = doctorQueue.find((row) => row.status === "in_consultation");
      const waiting = doctorQueue.filter((row) => row.status === "checked_in").sort(compareWaitingOrder);

      nowServingToken = serving ? serving.tokenNumber : null;
      nextToken = waiting.length > 0 ? waiting[0].tokenNumber : null;

      if (appointment.status === "checked_in") {
        const index = waiting.findIndex((row) => String(row._id) === String(appointment._id));
        patientsAhead = index >= 0 ? index : waiting.length;
      } else if (appointment.status === "in_consultation") {
        patientsAhead = 0;
      }
    }

    const estimatedWaitMinutes =
      patientsAhead === null ? null : Math.max(0, patientsAhead * settings.averageConsultationMinutes);

    res.json({
      ...base,
      appointment: {
        _id: appointment._id,
        tokenNumber: appointment.tokenNumber,
        status: appointment.status,
        time: appointment.time || null,
        date: appointment.date,
        checkedInAt: appointment.checkedInAt || null,
        priority: appointment.priority || "normal",
        doctor: appointment.doctorId
          ? {
              _id: appointment.doctorId._id,
              name: appointment.doctorId.name,
              department: appointment.doctorId.department,
            }
          : null,
      },
      patientsAhead,
      nowServingToken,
      nextToken,
      estimatedWaitMinutes,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error while fetching your live queue status." });
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
  createWalkIn,
  getQueue,
  callNextPatient,
  setAppointmentPriority,
  updateAppointmentStatus,
  getPatientAppointments,
  getAppointmentSlipPdf,
  getMyAppointments,
  getMyLiveStatus,
  listDoctors,
  bookMyAppointment,
  // Exported for future automated tests of the state machine / ordering.
  STATUS_TRANSITION_ROLES,
  VALID_TRANSITIONS,
  opdTokenCounterName,
};
