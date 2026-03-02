// frontend/src/components/ProtectedRoute.jsx
import React from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';

/** Decodifica un JWT sin validar firma (solo para leer exp) */
function decodeJwt(token) {
  try {
    const payload = token.split('.')[1];
    const json = atob(payload.replace(/-/g, '+').replace(/_/g, '/'));
    return JSON.parse(json);
  } catch {
    return null;
  }
}

function isTokenExpired(token) {
  const decoded = decodeJwt(token);
  if (!decoded || !decoded.exp) return true;
  const now = Math.floor(Date.now() / 1000);
  return decoded.exp <= now;
}

export default function ProtectedRoute({ requireAdmin = false }) {
  const location = useLocation();

  const token = localStorage.getItem('token');
  const rawUser = localStorage.getItem('user');
  let user = null;
  try { user = rawUser ? JSON.parse(rawUser) : null; } catch { user = null; }

  // 1) Sin token -> login
  if (!token) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  // 2) Token vencido -> limpiar y login
  if (isTokenExpired(token)) {
    localStorage.removeItem('token');
    // no borro user para poder mostrar nombre en login si querés, pero podés limpiarlo también
    return <Navigate to="/login" replace state={{ from: location.pathname, reason: 'expired' }} />;
  }

  // 3) Chequeo de rol ADMIN si corresponde
  if (requireAdmin) {
    // roles puede venir como array en user.roles (correcto) o legacy en localStorage.role
    const legacy = (localStorage.getItem('role') || '').toUpperCase();
    const roles = Array.isArray(user?.roles)
      ? user.roles.map(r => String(r).toUpperCase())
      : (legacy ? [legacy] : []);

    const isAdmin = roles.includes('ADMIN');
    if (!isAdmin) {
      // sin permiso -> redirigí a la última ruta o al home
      const ultima = localStorage.getItem('ultimaRuta') || '/';
      return <Navigate to={ultima} replace />;
    }
  }

  return <Outlet />;
}
