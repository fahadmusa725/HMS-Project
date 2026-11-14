/**
 * Audit log helpers shared by the automatic middleware and the handlers that write
 * their own richer entries (priority changes, pre-check access).
 *
 * Rules are matched in order against "<METHOD> <path>", so a specific rule must come
 * before a generic one (`/:id/prescription-pdf` before `/:id`). The first match wins;
 * anything unmatched is stored as the bare "<METHOD> <path>", so a new route is still
 * logged, just without a friendly label.
 */
const ACTION_RULES = [
  // Patient record and clinical reads (PHI - logged even though they are GETs)
  [/^GET \/api\/patients\/[^/]+$/, "Viewed a patient record"],
  [/^GET \/api\/consultations\/patient\/[^/]+$/, "Viewed a patient's medical history"],
  [/^GET \/api\/consultations\/[^/]+\/prescription-pdf$/, "Downloaded a prescription"],
  [/^GET \/api\/consultations\/[^/]+$/, "Viewed a consultation"],
  [/^GET \/api\/lab\/orders\/patient\/[^/]+$/, "Viewed a patient's lab orders"],
  [/^GET \/api\/pre-checks\/[^/]+\/attachments\/[^/]+\/url$/, "Opened a pre-check attachment"],
  [/^GET \/api\/pre-checks\/[^/]+$/, "Viewed a pre-check"],

  // Mutations
  [/^POST \/api\/patients$/, "Registered a patient"],
  [/^PATCH \/api\/patients\/[^/]+$/, "Updated a patient record"],
  [/^POST \/api\/appointments$/, "Booked an appointment"],
  [/^POST \/api\/appointments\/walk-in$/, "Issued a walk-in token"],
  [/^POST \/api\/appointments\/call-next$/, "Called the next patient"],
  [/^PATCH \/api\/appointments\/[^/]+\/priority$/, "Changed appointment queue priority"],
  [/^PATCH \/api\/appointments\/[^/]+\/status$/, "Updated appointment status"],
  [/^POST \/api\/appointments\/book-mine$/, "Booked own appointment (portal)"],
  [/^POST \/api\/consultations$/, "Recorded a consultation"],
  [/^POST \/api\/admissions$/, "Admitted a patient"],
  [/^PATCH \/api\/admissions\/[^/]+\/discharge$/, "Discharged a patient"],
  [/^POST \/api\/admissions\/[^/]+\/advance-payment$/, "Recorded an IPD advance payment"],
  [/^POST \/api\/admissions\/[^/]+\/notes$/, "Added a nursing note"],
  [/^PUT \/api\/doctor-schedules\/[^/]+$/, "Updated a doctor's schedule"],
  [/^PATCH \/api\/wards\/[^/]+$/, "Updated a ward"],
  [/^POST \/api\/wards$/, "Created a ward"],
  [/^POST \/api\/wards\/[^/]+\/beds$/, "Added beds to a ward"],
  [/^POST \/api\/lab\/tests$/, "Added a lab test to the catalog"],
  [/^POST \/api\/lab\/orders$/, "Ordered a lab test"],
  [/^PATCH \/api\/lab\/orders\/[^/]+\/status$/, "Updated a lab order status"],
  [/^PATCH \/api\/lab\/orders\/[^/]+\/result$/, "Added a lab result"],
  [/^POST \/api\/lab\/orders\/[^/]+\/upload-result$/, "Uploaded a lab result file"],
  [/^POST \/api\/pharmacy\/medicines$/, "Added medicine to inventory"],
  [/^PATCH \/api\/pharmacy\/medicines\/[^/]+\/restock$/, "Restocked a medicine"],
  [/^PATCH \/api\/pharmacy\/medicines\/[^/]+$/, "Updated a medicine"],
  [/^POST \/api\/pharmacy\/dispense$/, "Dispensed medicine"],
  [/^POST \/api\/billing$/, "Created a bill"],
  [/^PATCH \/api\/billing\/[^/]+\/payment$/, "Recorded a payment"],
  [/^POST \/api\/hospital-admin\/staff$/, "Invited a staff member"],
  [/^PATCH \/api\/hospital-admin\/staff\/[^/]+$/, "Updated a staff member"],
  [/^PATCH \/api\/hospital-admin\/staff\/[^/]+\/status$/, "Changed a staff member's status"],
  [/^POST \/api\/hospital-admin\/staff\/[^/]+\/reset-password$/, "Reset a staff password"],
  [/^PATCH \/api\/hospital-admin\/settings$/, "Updated hospital settings"],
  [/^POST \/api\/hospital-admin\/settings\/display-key$/, "Regenerated the waiting-room display key"],
  [/^POST \/api\/pre-checks$/, "Submitted a pre-check"],
  [/^PATCH \/api\/pre-checks\/[^/]+\/staff-vitals$/, "Recorded desk vitals"],
];

/** Every label the rules can produce - used by the viewer's action filter. */
const ACTION_LABELS = [...new Set(ACTION_RULES.map(([, label]) => label))].sort((a, b) => a.localeCompare(b));

/** "POST /api/patients" -> "Registered a patient". Falls back to the raw key. */
function describeAction(method, path) {
  const key = `${method} ${path}`;
  const match = ACTION_RULES.find(([pattern]) => pattern.test(key));
  return match ? match[1] : key;
}

/**
 * The request path without its query string. Query strings can carry search terms,
 * patient names and tokens, none of which belong in a permanent audit trail.
 */
function auditPath(req) {
  return String(req.originalUrl || req.path || "").split("?")[0];
}

/**
 * The first 24-hex ObjectId-looking segment of a path, i.e. the resource an action was
 * performed on. Segments like "mine", "queue" or "walk-in" are intentionally ignored.
 */
function extractResourceId(path) {
  const segments = String(path || "").split("/");
  for (const segment of segments) {
    if (/^[a-f0-9]{24}$/i.test(segment)) return segment;
  }
  return null;
}

module.exports = { describeAction, auditPath, extractResourceId, ACTION_LABELS };
