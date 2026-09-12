import { create } from 'zustand';

// Safely retrieve stored theme preference or default to light
const getInitialTheme = () => {
  try {
    const saved = localStorage.getItem('careflow-theme');
    if (saved === 'dark' || saved === 'light') return saved;
  } catch (e) {
    // fallback if localStorage not accessible
  }
  return 'light';
};

export const useThemeStore = create((set) => ({
  theme: getInitialTheme(),
  toggleTheme: () =>
    set((state) => {
      const nextTheme = state.theme === 'light' ? 'dark' : 'light';
      try {
        localStorage.setItem('careflow-theme', nextTheme);
      } catch (e) {}

      if (nextTheme === 'dark') {
        document.documentElement.classList.add('dark');
      } else {
        document.documentElement.classList.remove('dark');
      }
      return { theme: nextTheme };
    }),
  setTheme: (theme) => {
    try {
      localStorage.setItem('careflow-theme', theme);
    } catch (e) {}

    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
    set({ theme });
  },
}));
