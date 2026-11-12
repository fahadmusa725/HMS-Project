import { create } from 'zustand';
import { applyTheme, getInitialTheme, persistTheme } from '@/lib/theme';

export const useThemeStore = create((set, get) => {
  const initialTheme = getInitialTheme();
  // index.html already resolved this before paint; re-applying keeps the DOM and the
  // store in step when the module loads.
  applyTheme(initialTheme);

  const commit = (theme) => {
    persistTheme(theme);
    applyTheme(theme);
    set({ theme });
  };

  return {
    theme: initialTheme,
    toggleTheme: () => commit(get().theme === 'dark' ? 'light' : 'dark'),
    setTheme: (theme) => commit(theme),
  };
});
