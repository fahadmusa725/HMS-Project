/**
 * Slot math shared by the slot-picker endpoint (doctorScheduleController)
 * and booking validation (appointmentController) - both MUST agree on
 * exactly which times are bookable, so this lives in one place.
 * All times are "HH:MM" 24hr strings; dates are "YYYY-MM-DD".
 */

const HHMM_REGEX = /^([01]\d|2[0-3]):[0-5]\d$/;

/** "HH:MM" <-> minutes-since-midnight, used to step through a block generating slots. */
function toMinutes(hhmm) {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

function toHHMM(mins) {
  const h = String(Math.floor(mins / 60)).padStart(2, "0");
  const m = String(mins % 60).padStart(2, "0");
  return `${h}:${m}`;
}

function generateSlots(startTime, endTime, stepMinutes) {
  const slots = [];
  let cur = toMinutes(startTime);
  const end = toMinutes(endTime);
  while (cur + stepMinutes <= end) {
    slots.push(toHHMM(cur));
    cur += stepMinutes;
  }
  return slots;
}

/** 0=Sunday ... 6=Saturday for a "YYYY-MM-DD" date (parsed as a local calendar day, not UTC). */
function dayOfWeekFor(date) {
  return new Date(date + "T00:00:00").getDay();
}

/** Every slot the doctor works on this date (booked or not), in time order. */
function slotsForDate(schedule, date) {
  const dayOfWeek = dayOfWeekFor(date);
  const slots = schedule.weeklyAvailability
    .filter((b) => b.dayOfWeek === dayOfWeek)
    .flatMap((b) => generateSlots(b.startTime, b.endTime, schedule.slotDurationMinutes));
  return [...new Set(slots)].sort();
}

module.exports = { HHMM_REGEX, generateSlots, dayOfWeekFor, slotsForDate };
