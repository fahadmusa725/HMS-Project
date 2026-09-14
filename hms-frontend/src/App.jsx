import React, { useEffect } from 'react';
import { BrowserRouter } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'sonner';
import { queryClient } from '@/lib/queryClient';
import { useThemeStore } from '@/store/themeStore';
import { useAuthStore } from '@/store/authStore';
import { AppRoutes } from '@/routes';

function App() {
  const { theme } = useThemeStore();
  const { token, fetchMe } = useAuthStore();

  useEffect(() => {
    if (token) {
      fetchMe();
    }
  }, [token, fetchMe]);

  useEffect(() => {
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [theme]);

  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AppRoutes />
        <Toaster
          theme={theme}
          position="bottom-right"
          richColors={false}
          closeButton
          toastOptions={{
            duration: 4000,
            className:
              'font-sans rounded-xl border shadow-soft-xl px-4 py-3 text-sm flex items-center gap-3',
            style: {
              background: 'hsl(var(--card))',
              color: 'hsl(var(--card-foreground))',
              borderColor: 'hsl(var(--border))',
            },
          }}
        />
      </BrowserRouter>
    </QueryClientProvider>
  );
}

export default App;
