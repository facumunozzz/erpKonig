// src/pages/Login.jsx
import React, { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import api from '../api/axiosConfig';
import { toast } from 'react-toastify';
import './../styles/transferencias.css';
import { useAuth } from '../context/AuthContext'; // 👈 importamos el contexto

export default function Login() {
  const navigate = useNavigate();
  const location = useLocation();
  const { login } = useAuth(); // 👈 traemos la función del contexto
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const from = (location.state && location.state.from) || localStorage.getItem('ultimaRuta') || '/';

  const submit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await api.post('/auth/login', { username, password });
      const { token, user } = res.data || {};

      if (!token) throw new Error('Respuesta inválida');
      login(user, token); // actualiza AuthContext

      toast.success(`Bienvenido ${user?.username || ''} 👋`);

      // 🧠 Siempre redirigir a /stock, salvo que el "from" sea una ruta válida diferente de /login
      const redirectTo =
        location.state?.from && location.state.from !== '/login'
          ? location.state.from
          : '/stock';

      navigate(redirectTo, { replace: true });
    } catch (err) {
      const msg = err?.response?.data?.error || 'Credenciales inválidas';
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };


  return (
    <div className="nueva-transferencia-page" style={{ maxWidth: 520 }}>
      <div className="nt-card">
        <h2 className="module-title">Ingresar</h2>
        <form onSubmit={submit} className="nt-form">
          <div className="nt-field">
            <label>Usuario</label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Usuario"
              autoFocus
            />
          </div>
          <div className="nt-field">
            <label>Contraseña</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
            />
          </div>
          <div className="nt-actions" style={{ marginTop: 12 }}>
            <button className="btn-primario" type="submit" disabled={loading}>
              {loading ? 'Ingresando…' : 'Ingresar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
