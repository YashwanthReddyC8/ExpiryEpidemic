import axios from 'axios';
import { useAuthStore } from '../store/authStore';

const inferredTunnelApi =
  window.location.hostname.includes('-5173.inc1.devtunnels.ms')
    ? `https://${window.location.hostname.replace('-5173.', '-8000.')}`
    : null;

const baseURL =
  import.meta.env.VITE_API_URL ||
  inferredTunnelApi ||
  (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
    ? 'http://localhost:8000'
    : 'http://localhost:8000');

const api = axios.create({
  baseURL,
  headers: { 'Content-Type': 'application/json' },
});

// Attach access token to every request
api.interceptors.request.use((config) => {
  const token = useAuthStore.getState().accessToken;
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// On 401 → clear auth + redirect to /login
api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      useAuthStore.getState().logout();
      window.location.href = '/login';
    }
    return Promise.reject(err);
  }
);

export default api;
