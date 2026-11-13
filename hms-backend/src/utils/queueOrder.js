/**
 * NEXT-PATIENT ORDER (checked-in OPD patients)
 * =============================================
 * The queue is not plain "lowest token first". A checked-in patient is called in this order:
 *
 *   1. Priority rank, highest first: emergency (2) > senior (1) > normal (0).
 *   2. checkedInAt, earliest first - within the same priority, whoever arrived first goes first.
 *   3. tokenNumber, lowest first - a deterministic tie-breaker. In practice step 2 already
 *      breaks ties (check-in stamps a time), but legacy rows without checkedInAt fall back to
 *      the appointment's createdAt so they are never ordered randomly.
 *
 * Tokens themselves are per doctor per day, so tokenNumber is only meaningful within one
 * doctor's list - never compare tokens across doctors.
 *
 * Only status === "checked_in" appointments are ordered by this rule. A doctor's current
 * in_consultation patient is "now serving", not part of the waiting list. The same comparator
 * is used by the queue endpoint, "Call next", the patient portal and the public TV display,
 * so every surface agrees on who is next.
 */
const PRIORITY_RANK = { normal: 0, senior: 1, emergency: 2 };

function priorityRank(priority) {
  return PRIORITY_RANK[priority] ?? PRIORITY_RANK.normal;
}

function checkedInTimestamp(entry) {
  const checkedIn = entry && entry.checkedInAt ? new Date(entry.checkedInAt).getTime() : NaN;
  if (Number.isFinite(checkedIn)) return checkedIn;
  const created = entry && entry.createdAt ? new Date(entry.createdAt).getTime() : NaN;
  return Number.isFinite(created) ? created : 0;
}

/** Comparator for two checked_in appointments (ascending = next patient first). */
function compareWaitingOrder(a, b) {
  const rank = priorityRank(b && b.priority) - priorityRank(a && a.priority);
  if (rank) return rank;

  const arrived = checkedInTimestamp(a) - checkedInTimestamp(b);
  if (arrived) return arrived;

  return (a?.tokenNumber || 0) - (b?.tokenNumber || 0);
}

module.exports = { PRIORITY_RANK, priorityRank, compareWaitingOrder };
