import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import axios from 'axios';

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
          set({
            token,
            user,
            isAuthenticated: true,
            isLoading: false,
            error: null,
          });
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
          set({
            token,
            user,
            isAuthenticated: true,
            isLoading: false,
            error: null,
          });
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
        set({
          token,
          user,
          isAuthenticated: true,
          isLoading: false,
          error: null,
        });
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
        set({
          token: null,
          user: null,
          isAuthenticated: false,
          error: null,
        });
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

