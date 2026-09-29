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

const DAY_MINUTES = 24 * 60;

/** A block whose endTime is earlier than its startTime (e.g. 21:00 -> 02:00) runs past midnight into the next day. */
function isOvernight(block) {
  return toMinutes(block.endTime) < toMinutes(block.startTime);
}

/**
 * Slot start times for one block, in minutes from midnight of the block's OWN day. An overnight
 * block keeps stepping past 24:00, so 21:00 -> 02:00 in 60-min slots gives 21:00, 22:00, 23:00,
 * 24:00 (= 00:00 next day) and 25:00 (= 01:00 next day). A slot is only offered if it finishes
 * by the block's end.
 */
function blockSlotMinutes(block, stepMinutes) {
  const start = toMinutes(block.startTime);
  const end = toMinutes(block.endTime) + (isOvernight(block) ? DAY_MINUTES : 0);
  const slots = [];
  for (let cur = start; cur + stepMinutes <= end; cur += stepMinutes) slots.push(cur);
  return slots;
}

/** 0=Sunday ... 6=Saturday for a "YYYY-MM-DD" date (parsed as a local calendar day, not UTC). */
function dayOfWeekFor(date) {
  return new Date(date + "T00:00:00").getDay();
}

/**
 * Every slot the doctor works on this calendar date (booked or not), in time order. That's the
 * part of this day's blocks before midnight, plus the after-midnight tail of the PREVIOUS day's
 * overnight blocks - e.g. a Monday 21:00-02:00 shift puts its 00:00 and 01:00 slots on Tuesday.
 */
function slotsForDate(schedule, date) {
  const dayOfWeek = dayOfWeekFor(date);
  const previousDay = (dayOfWeek + 6) % 7;
  const step = schedule.slotDurationMinutes;
  const slots = [];

  for (const block of schedule.weeklyAvailability) {
    if (block.dayOfWeek === dayOfWeek) {
      blockSlotMinutes(block, step)
        .filter((m) => m < DAY_MINUTES)
        .forEach((m) => slots.push(toHHMM(m)));
    }
    if (block.dayOfWeek === previousDay && isOvernight(block)) {
      blockSlotMinutes(block, step)
        .filter((m) => m >= DAY_MINUTES)
        .forEach((m) => slots.push(toHHMM(m - DAY_MINUTES)));
    }
  }
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

module.exports = { HHMM_REGEX, isOvernight, dayOfWeekFor, slotsForDate, hospitalNow, hospitalDate, APP_TIMEZONE };
