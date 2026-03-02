import React from 'react';
import { useNavigate } from 'react-router-dom';
import './../styles/transferencias.css';
import { useAuth } from '../context/AuthContext';
import RoleGate from '../components/RoleGate';

export default function Administracion() {
  const navigate = useNavigate();
  const { user } = useAuth();

  return (
    <RoleGate roles={['ADMIN']} fallback={<p>No tiene permiso para acceder a esta sección.</p>}>
      <div className="articulos-container">
        <h2 className="module-title">Panel de Administración</h2>

        <div className="nt-card" style={{ padding: 24, textAlign: 'center' }}>
          <p>Bienvenido, <strong>{user?.username}</strong>. Seleccione una de las opciones administrativas:</p>

          <div className="nt-row" style={{ justifyContent: 'center', marginTop: 24 }}>
            <button
              className="btn-primario"
              style={{ margin: '0 8px', minWidth: 220 }}
              onClick={() => navigate('/admin/usuarios')}
            >
              👤 Administrar Usuarios
            </button>

            <button
              className="btn-primario"
              style={{ margin: '0 8px', minWidth: 220 }}
              onClick={() => navigate('/admin/articulos')}
            >
              🧾 Definir información de artículos
            </button>

            <button
              className="btn-primario"
              style={{ margin: '0 8px', minWidth: 220 }}
              onClick={() => navigate('/admin/utilidades')}
            >
              💰 Cambiar utilidades según usuario
            </button>
          </div>
        </div>
      </div>
    </RoleGate>
  );
}
