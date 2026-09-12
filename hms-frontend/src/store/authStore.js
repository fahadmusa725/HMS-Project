import { create } from 'zustand';
import axios from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';

export const useAuthStore = create((set, get) => ({
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
      set({
        token: null,
        user: null,
        isAuthenticated: false,
        isLoading: false,
        error: errorMessage,
      });
      return { success: false, error: errorMessage };
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
}));
