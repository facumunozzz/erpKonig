// src/components/RoleGate.jsx
import React from 'react';

export default function RoleGate({ roles = [], fallback = null, children }) {
  let user = null;
  try { user = JSON.parse(localStorage.getItem('user') || 'null'); } catch {}

  const legacy = (localStorage.getItem('role') || '').toUpperCase();
  const userRoles = Array.isArray(user?.roles)
    ? user.roles.map(r => String(r).toUpperCase())
    : (legacy ? [legacy] : []);

  const needed = roles.map(r => String(r).toUpperCase());
  const ok = needed.every(r => userRoles.includes(r));

  return ok ? children : (fallback ?? null);
}
