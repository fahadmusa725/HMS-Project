import api from '@/lib/api';

/**
 * Shared rules for the digital pre-check. They mirror the server (preCheckController /
 * middleware/upload) so the UI fails fast, but the server stays the authority: it re-checks
 * the size, the count and the real file type from the file's magic bytes.
 */
export const PRECHECK_MAX_FILES = 3;
export const PRECHECK_MAX_FILE_BYTES = 5 * 1024 * 1024;
export const PRECHECK_SYMPTOMS_MAX = 2000;
export const PRECHECK_FILE_ACCEPT = '.pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png';

const ALLOWED_MIME_TYPES = ['application/pdf', 'image/jpeg', 'image/png'];
const ALLOWED_EXTENSIONS = /\.(pdf|jpe?g|png)$/i;

/** iOS/Safari sometimes reports an empty or wrong MIME type, so the extension is a fallback. */
export function isAcceptableReport(file) {
  return ALLOWED_MIME_TYPES.includes(file.type) || ALLOWED_EXTENSIONS.test(file.name || '');
}

export function formatBytes(bytes) {
  const value = Number(bytes) || 0;
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${Math.round(value / 1024)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

/** The patient's four self-reported vitals, in the order they are shown everywhere. */
export const PRECHECK_VITALS = [
  { key: 'temperature', label: 'Temperature', placeholder: '98.6 F' },
  { key: 'bloodPressure', label: 'Blood pressure', placeholder: '120/80' },
  { key: 'pulse', label: 'Pulse', placeholder: '76 bpm' },
  { key: 'weight', label: 'Weight', placeholder: '70 kg' },
];

export const PRECHECK_DURATION_PICKS = ['Today', '2-3 days', 'About a week', 'More than a week'];

/** Loads the pre-check belonging to one appointment (patient or staff, server decides). */
export async function fetchPreCheck(appointmentId) {
  const res = await api.get(`/api/pre-checks/${appointmentId}`);
  return res.data;
}

/**
 * Status of every pre-check the patient owns, for the appointment cards. One request for the
 * whole page instead of one per card.
 */
export async function fetchMyPreCheckSummaries() {
  const res = await api.get('/api/pre-checks/mine');
  return res.data;
}

/**
 * Reports are private Cloudinary assets: the API hands back a signed URL that expires in
 * about two minutes, and only after it has checked that this viewer may see this file.
 */
export async function openPreCheckAttachment(appointmentId, attachmentId) {
  const res = await api.get(`/api/pre-checks/${appointmentId}/attachments/${attachmentId}/url`);
  window.open(res.data.url, '_blank', 'noopener');
  return res.data;
}
