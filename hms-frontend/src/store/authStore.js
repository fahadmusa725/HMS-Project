import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import axios from 'axios';
import { rememberHospitalBrand } from '@/lib/hospitalBrand';
import { resetClientCache } from '@/lib/queryClient';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';

export const useAuthStore = create(
  persist(
    (set, get) => ({
      token: null,
      user: null,
      isAuthenticated: false,
      isLoading: false,
      error: null,

      login: async (email, password) => {
        set({ isLoading: true, error: null });
        try {
          const response = await axios.post(`${API_BASE_URL}/api/auth/login`, {
            email,
            password,
          });

          const { token, user } = response.data;
          rememberHospitalBrand({ name: user?.hospitalName, logoUrl: user?.hospitalLogoUrl });
          set({
            token,
            user,
            isAuthenticated: true,
            isLoading: false,
            error: null,
          });
          // The new session must not inherit a single cached response from whoever was signed in
          // before: the login form navigates client-side, so this cache outlives the old session.
          // Cleared after the identity is in place, so anything that refetches during the reset
          // does so as the user who just signed in.
          resetClientCache();
          return { success: true, user, token };
        } catch (err) {
          const errorMessage =
            err.response?.data?.message ||
            err.message ||
            'Authentication failed. Please check your credentials.';
          const retryAfter = err.response?.data?.retryAfter ?? null;
          set({
            token: null,
            user: null,
            isAuthenticated: false,
            isLoading: false,
            error: errorMessage,
          });
          // retryAfter is set only when the server locked the account (429), so the
          // login form can count down instead of letting the user keep hammering it.
          return { success: false, error: errorMessage, retryAfter };
        }
      },

      signupPatient: async (signupData) => {
        set({ isLoading: true, error: null });
        try {
          const response = await axios.post(`${API_BASE_URL}/api/public/patient-signup`, signupData);
          const { token, user, verificationRequired, recordLinked, message } = response.data;
          rememberHospitalBrand({ name: user?.hospitalName, logoUrl: user?.hospitalLogoUrl });
          set({
            token,
            user,
            isAuthenticated: true,
            isLoading: false,
            error: null,
          });
          resetClientCache();
          return { success: true, user, token, verificationRequired, recordLinked, message };
        } catch (err) {
          const errorMessage =
            err.response?.data?.message ||
            err.message ||
            'Registration failed. Please check your information.';
          set({
            token: null,
            user: null,
            isAuthenticated: false,
            isLoading: false,
            error: errorMessage,
          });
          return { success: false, error: errorMessage, status: err.response?.status };
        }
      },

      setAuthSession: (token, user) => {
        rememberHospitalBrand({ name: user?.hospitalName, logoUrl: user?.hospitalLogoUrl });
        set({
          token,
          user,
          isAuthenticated: true,
          isLoading: false,
          error: null,
        });
        resetClientCache();
      },

      fetchMe: async () => {
        const token = get().token;
        if (!token) return null;
        try {
          const response = await axios.get(`${API_BASE_URL}/api/auth/me`, {
            headers: {
              Authorization: `Bearer ${token}`,
            },
          });
          const user = response.data;
          // Keeps the header (and the login screen's remembered brand) in step with a rename or
          // a new logo, because this is what the app calls to re-hydrate identity.
          rememberHospitalBrand({ name: user?.hospitalName, logoUrl: user?.hospitalLogoUrl });
          set({ user, isAuthenticated: true });
          return user;
        } catch (err) {
          const status = err.response?.status;
          const code = err.response?.data?.code;
          const blocked = status === 403 && ['ACCOUNT_DISABLED', 'HOSPITAL_SUSPENDED', 'TRIAL_EXPIRED'].includes(code);
          if (blocked && err.response.data.message) {
            sessionStorage.setItem('careflow-auth-error', err.response.data.message);
          }
          if (status === 401 || blocked) {
            get().logout();
          }
          return null;
        }
      },

      logout: () => {
        // Every path out of a session lands here: the sign-out button, the 401 handler and the
        // blocked-account 403 handler in lib/api.js, and a revoked token found by fetchMe.
        set({
          token: null,
          user: null,
          isAuthenticated: false,
          error: null,
        });
        // After the token is gone, so a screen that re-renders on the way out cannot refetch
        // with the old session's credentials - its request would be unauthenticated and rejected.
        resetClientCache();
      },

      setUser: (user) => set({ user }),
      clearError: () => set({ error: null }),
    }),
    {
      name: 'careflow-auth',
      partialize: (state) => ({
        token: state.token,
        user: state.user,
        isAuthenticated: state.isAuthenticated,
      }),
    }
  )
);

