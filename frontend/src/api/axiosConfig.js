// frontend/src/api/axiosConfig.js
import axios from "axios";

// 1) Vite: import.meta.env.VITE_API_BASE
// 2) window.__API_BASE__
// 3) localStorage.API_BASE (pero si es localhost, lo ignoramos)
// 4) fallback: mismo origen (ideal cuando servís el front desde Express)
const fromVite =
  (typeof import.meta !== "undefined" &&
    import.meta.env &&
    import.meta.env.VITE_API_BASE) ||
  null;

const fromWindow = (typeof window !== "undefined" && window.__API_BASE__) || null;

let fromLS =
  (typeof window !== "undefined" && window.localStorage.getItem("API_BASE")) || null;

// ✅ Si quedó guardado "http://localhost:3000" y estás entrando desde otra PC, rompe.
// Lo ignoramos para que use window.location.origin.
if (fromLS && /localhost/i.test(fromLS)) {
  fromLS = null;
}

const fallback =
  typeof window !== "undefined" ? window.location.origin : "http://localhost:3000";

const API_BASE = fromVite || fromWindow || fromLS || fallback;

const api = axios.create({
  baseURL: API_BASE,
  timeout: 20000,
});

// ===== Interceptor: Authorization =====
api.interceptors.request.use((config) => {
  const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// ===== Interceptor: 401 global =====
let isRefreshing = false;
api.interceptors.response.use(
  (res) => res,
  async (err) => {
    const status = err?.response?.status;
    if (status === 401) {
      if (!isRefreshing) {
        isRefreshing = true;
        try {
          if (typeof window !== "undefined") {
            localStorage.removeItem("token");
            localStorage.removeItem("user");
            localStorage.removeItem("role");
            setTimeout(() => {
              isRefreshing = false;
              if (window.location.pathname !== "/login") {
                window.location.href = "/login";
              }
            }, 50);
          }
        } finally {
          isRefreshing = false;
        }
      }
    }
    return Promise.reject(err);
  }
);

export default api;