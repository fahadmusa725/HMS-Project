import axios from 'axios';
import { useAuthStore } from '../store/authStore';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

api.interceptors.request.use(
  (config) => {
    const token = useAuthStore.getState().token;
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

api.interceptors.response.use(
  (response) => {
    return response;
  },
  (error) => {
    if (error.response && error.response.status === 401) {
      useAuthStore.getState().logout();
      if (window.location.pathname !== '/login') {
        window.location.href = '/login';
      }
    }
    return Promise.reject(error);
  }
);

/**
 * Opens an authenticated PDF endpoint (token slip, prescription) in a new tab.
 * A plain <a href> can't carry the Bearer token, so we fetch it as a blob.
 * The tab is opened synchronously first so popup blockers don't eat it.
 */
export async function openPdf(path) {
  const win = window.open('', '_blank');
  try {
    const res = await api.get(path, { responseType: 'blob' });
    const url = URL.createObjectURL(new Blob([res.data], { type: 'application/pdf' }));
    if (win) win.location.href = url;
    else window.location.href = url;
    setTimeout(() => URL.revokeObjectURL(url), 60 * 1000);
  } catch (err) {
    if (win) win.close();
    throw err;
  }
}

/**
 * Downloads an authenticated endpoint's response as a file (a plain <a href> can't carry the
 * Bearer token). With responseType: 'blob', axios also delivers an error response body as a
 * Blob rather than parsed JSON, so on failure we read it back out as text and parse it, to still
 * surface the server's real error message instead of a generic one.
 */
export async function downloadFile(path, params, fallbackFilename) {
  try {
    const res = await api.get(path, { params, responseType: "blob" });

    const disposition = res.headers["content-disposition"] || "";
    const match = /filename="([^"]+)"/.exec(disposition);
    const filename = match ? match[1] : fallbackFilename;

    const url = URL.createObjectURL(res.data);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60 * 1000);
  } catch (err) {
    if (err.response?.data instanceof Blob) {
      try {
        const text = await err.response.data.text();
        err.response.data = JSON.parse(text);
      } catch {
        // Body wasn't JSON either - leave the original Blob, the caller falls back to a generic message.
      }
    }
    throw err;
  }
}

export default api;
