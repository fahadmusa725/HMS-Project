/**
 * The single source of truth for the colour theme. `index.html` has an inline copy of the
 * resolution logic because it has to run before the first paint; everything after that goes
 * through this module.
 */
export const THEME_STORAGE_KEY = 'careflow-theme';

const THEME_COLOR_META = {
  light: '#F0EEE9',
  dark: '#0E1A19',
};

export function getStoredTheme() {
  try {
    const saved = localStorage.getItem(THEME_STORAGE_KEY);
    if (saved === 'light' || saved === 'dark') return saved;
  } catch {
    // localStorage can be unavailable (private mode, blocked cookies)
  }
  return null;
}

export function getSystemTheme() {
  if (typeof window === 'undefined' || !window.matchMedia) return 'light';
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function getInitialTheme() {
  return getStoredTheme() || getSystemTheme();
}

export function applyTheme(theme) {
  const root = document.documentElement;
  root.classList.toggle('dark', theme === 'dark');
  root.style.colorScheme = theme;

  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', THEME_COLOR_META[theme] || THEME_COLOR_META.light);
}

export function persistTheme(theme) {
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // storage is best-effort; the class on <html> still applies for this session
  }
}
