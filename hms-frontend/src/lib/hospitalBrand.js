/**
 * The hospital this browser last signed in to, so the login screen can show that hospital's own
 * brand mark - only when it is already known, which is after a previous session on this device.
 * Nothing but the display name and the public logo URL is kept, and it survives logout on
 * purpose: it is branding, not a session.
 *
 * It is the one per-user value logout keeps, so the rules are worth stating: no patient data ever
 * reaches this key, it is overwritten by the next successful sign-in, nothing reads it for
 * authorisation, and it is shown as "Last signed in" because on a shared workstation the next
 * person - possibly from another hospital - does see the tenant that was here before them.
 */
const STORAGE_KEY = 'careflow-hospital-brand';

export function rememberHospitalBrand({ name, logoUrl } = {}) {
  if (!name && !logoUrl) return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ name: name || '', logoUrl: logoUrl || '' }));
  } catch {
    // Private mode or storage disabled - the login screen simply keeps the platform mark.
  }
}

export function readHospitalBrand() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    const name = typeof parsed.name === 'string' ? parsed.name : '';
    const logoUrl = typeof parsed.logoUrl === 'string' ? parsed.logoUrl : '';
    return name || logoUrl ? { name, logoUrl } : null;
  } catch {
    return null;
  }
}
