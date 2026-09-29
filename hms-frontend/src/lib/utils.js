import { clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs) {
  return twMerge(clsx(inputs))
}

export function formatCurrency(amount) {
  const num = Number(amount) || 0;
  return `PKR ${num.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

/** "14:30" -> "2:30 PM". Legacy free-text times (e.g. "09:00 AM") pass through unchanged. */
export function formatSlotTime(time) {
  const match = /^(\d{2}):(\d{2})$/.exec(time || '');
  if (!match) return time || '—';
  const h = Number(match[1]);
  return `${h % 12 || 12}:${match[2]} ${h < 12 ? 'AM' : 'PM'}`;
}

/** "Kamran Ahmed" -> "Dr. Kamran Ahmed", but leaves "Dr. Kamran Ahmed" alone (staff often enter the title themselves). */
export function doctorName(name, fallback = '—') {
  const n = (name || '').trim();
  if (!n) return fallback;
  return /^dr\.?\s/i.test(n) ? n : `Dr. ${n}`;
}

/** Today's date in the user's LOCAL timezone as "YYYY-MM-DD" (toISOString() would give the UTC date). */
export function localDateStr(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

