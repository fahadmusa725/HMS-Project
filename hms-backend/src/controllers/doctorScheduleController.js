const DoctorSchedule = require("../models/DoctorSchedule");
const User = require("../models/User");
const Appointment = require("../models/Appointment");
const { HHMM_REGEX, dayOfWeekFor, slotsForDate, hospitalNow } = require("../utils/scheduleSlots");

/** Upsert a doctor's weekly working hours, fee and slot length. Hospital admin only. */
async function upsertSchedule(req, res) {
  try {
    const { doctorId } = req.params;
    const { consultationFee, slotDurationMinutes, weeklyAvailability } = req.body;

    const doctor = await User.findOne({ _id: doctorId, role: "doctor" });
    if (!doctor) return res.status(404).json({ message: "Doctor not found." });

    if (consultationFee !== undefined && !(Number(consultationFee) >= 0)) {
      return res.status(400).json({ message: "consultationFee must be zero or a positive number." });
    }
    if (slotDurationMinutes !== undefined && !(Number(slotDurationMinutes) >= 5 && Number(slotDurationMinutes) <= 240)) {
      return res.status(400).json({ message: "slotDurationMinutes must be between 5 and 240." });
    }

    if (weeklyAvailability !== undefined) {
      if (!Array.isArray(weeklyAvailability)) {
        return res.status(400).json({ message: "weeklyAvailability must be an array." });
      }
      for (const block of weeklyAvailability) {
        if (
          !Number.isInteger(block.dayOfWeek) ||
          block.dayOfWeek < 0 ||
          block.dayOfWeek > 6 ||
          !HHMM_REGEX.test(block.startTime || "") ||
          !HHMM_REGEX.test(block.endTime || "") ||
          block.startTime === block.endTime // endTime before startTime is fine: an overnight shift, e.g. 21:00-02:00
        ) {
          return res.status(400).json({
            message:
              "Each availability block needs a dayOfWeek (0-6) and different HH:MM start and end times (an end time earlier than the start means the shift runs past midnight).",
          });
        }
      }
    }

    const schedule = await DoctorSchedule.findOneAndUpdate(
      { doctorId },
      {
        $set: {
          ...(consultationFee !== undefined && { consultationFee: Number(consultationFee) }),
          ...(slotDurationMinutes !== undefined && { slotDurationMinutes: Number(slotDurationMinutes) }),
          ...(weeklyAvailability !== undefined && { weeklyAvailability }),
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true, runValidators: true }
    );

    res.json(schedule);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error while saving doctor schedule." });
  }
}

async function getSchedule(req, res) {
  try {
    const schedule = await DoctorSchedule.findOne({ doctorId: req.params.doctorId });
    if (!schedule) return res.status(404).json({ message: "No schedule set for this doctor yet." });
    res.json(schedule);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error while fetching doctor schedule." });
  }
}

/** Which doctors actually work on the given date - real availability, not "pick any time". */
async function getAvailableDoctors(req, res) {
  try {
    const { date } = req.query;
    if (!date) return res.status(400).json({ message: "date query param is required (YYYY-MM-DD)." });

    // Candidates: blocks on this weekday, or on the day before (an overnight shift spills into today).
    const dayOfWeek = dayOfWeekFor(date);
    const schedules = await DoctorSchedule.find({
      "weeklyAvailability.dayOfWeek": { $in: [dayOfWeek, (dayOfWeek + 6) % 7] },
    }).populate("doctorId", "name department status");

    const doctors = schedules
      .filter((s) => s.doctorId && s.doctorId.status === "active") // skip deleted/disabled doctor accounts
      .filter((s) => slotsForDate(s, date).length > 0) // e.g. yesterday's block that ends at midnight gives nothing today
      .map((s) => ({
        id: s.doctorId._id,
        name: s.doctorId.name,
        department: s.doctorId.department,
        consultationFee: s.consultationFee,
      }))
      .sort((a, b) => a.name.localeCompare(b.name));

    res.json(doctors);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error while fetching available doctors." });
  }
}

/** Real open slots for one doctor on one date, with already-booked times excluded. */
async function getAvailableSlots(req, res) {
  try {
    const { doctorId, date } = req.query;
    if (!doctorId || !date) {
      return res.status(400).json({ message: "doctorId and date query params are required." });
    }

    const schedule = await DoctorSchedule.findOne({ doctorId });
    if (!schedule) {
      return res.json({ slots: [], consultationFee: 0, message: "This doctor has no schedule configured yet." });
    }

    let allSlots = slotsForDate(schedule, date);
    if (allSlots.length === 0) {
      return res.json({ slots: [], consultationFee: schedule.consultationFee, message: "Doctor is not available on this day." });
    }

    // A slot that has already started today can't be booked any more.
    const now = hospitalNow();
    if (date < now.date) {
      return res.json({ slots: [], consultationFee: schedule.consultationFee, message: "This date is in the past." });
    }
    if (date === now.date) {
      allSlots = allSlots.filter((t) => t > now.time);
      if (allSlots.length === 0) {
        return res.json({ slots: [], consultationFee: schedule.consultationFee, message: "This doctor has no more slots left today." });
      }
    }

    const bookedAppointments = await Appointment.find({
      doctorId,
      date,
      status: { $ne: "cancelled" },
    }).select("time");
    const booked = new Set(bookedAppointments.map((a) => a.time));

    const openSlots = allSlots.filter((t) => !booked.has(t));

    res.json({
      slots: openSlots,
      consultationFee: schedule.consultationFee,
      ...(openSlots.length === 0 && { message: "All slots for this day are already booked." }),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error while fetching available slots." });
  }
}

module.exports = { upsertSchedule, getSchedule, getAvailableDoctors, getAvailableSlots };
