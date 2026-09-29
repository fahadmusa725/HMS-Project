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

/**
 * The hospital's local "now". Schedules, appointment dates and "today's queue" are all in local
 * clinic time, but servers (Vercel included) run in UTC - so "today" must never come from
 * toISOString(), or between midnight and 5 AM in Pakistan it would still be yesterday.
 */
const APP_TIMEZONE = process.env.APP_TIMEZONE || "Asia/Karachi";

function hospitalNow(at = new Date()) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: APP_TIMEZONE,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(at)
      .map((p) => [p.type, p.value])
  );
  return { date: `${parts.year}-${parts.month}-${parts.day}`, time: `${parts.hour}:${parts.minute}` };
}

/** Local calendar date `days` away from today, as "YYYY-MM-DD" (e.g. 1 = tomorrow). */
function hospitalDate(days = 0) {
  const d = new Date(hospitalNow().date + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

module.exports = { HHMM_REGEX, generateSlots, dayOfWeekFor, slotsForDate, hospitalNow, hospitalDate, APP_TIMEZONE };
