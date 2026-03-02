import React, { useEffect, useState } from 'react';
import api from '../api/axiosConfig';
import { toast } from 'react-toastify';

export default function CambiarUtilidades() {
  const [usuarios, setUsuarios] = useState([]);
  const [selectedUser, setSelectedUser] = useState(null);
  const [utilidades, setUtilidades] = useState([]);
  const [loading, setLoading] = useState(false);

  const ALL_UTILIDADES = [
    'Ajustes', 'Transferencias', 'Producción', 'Fábrica',
    'Artículos', 'Stock', 'Movimientos', 'Administración'
  ];

  // 🔹 Cargar todos los usuarios
  const loadUsuarios = async () => {
    try {
      const res = await api.get('/utilidades');
      setUsuarios(res.data);
    } catch {
      toast.error('Error al cargar usuarios');
    }
  };

  useEffect(() => {
    loadUsuarios();
  }, []);

  // 🔹 Seleccionar un usuario y traer sus utilidades
  const handleSelectUser = async (id) => {
    setSelectedUser(id);
    setLoading(true);
    try {
      const res = await api.get(`/utilidades/${id}`);
      setUtilidades(res.data);
    } catch {
      toast.error('Error al obtener utilidades del usuario');
    } finally {
      setLoading(false);
    }
  };

  // 🔹 Marcar / desmarcar una utilidad
  const toggleUtilidad = (nombre) => {
    setUtilidades((prev) =>
      prev.includes(nombre)
        ? prev.filter((u) => u !== nombre)
        : [...prev, nombre]
    );
  };

  // 🔹 Guardar cambios
  const saveChanges = async () => {
    if (!selectedUser) return;
    setLoading(true);
    try {
      const res = await api.post(`/utilidades/${selectedUser}`, { utilidades });

      toast.success('✅ Utilidades actualizadas');

      // 🔹 Actualizar en la lista principal sin recargar
      setUsuarios((prev) =>
        prev.map((u) =>
          u.id_usuario === selectedUser
            ? { ...u, utilidades: res.data.utilidades.length }
            : u
        )
      );

      // 🔹 Volver a la lista automáticamente
      setSelectedUser(null);
    } catch (err) {
      console.error(err);
      toast.error('Error al guardar cambios');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="articulos-container">
      <h2 className="module-title">Utilidades por Usuario</h2>

      {/* 🔹 Lista de usuarios */}
      {!selectedUser && (
        <div className="nt-card">
          <h4>Seleccione un usuario:</h4>
          <ul>
            {usuarios.map((u) => (
              <li key={u.id_usuario}>
                <button
                  className="btn-secundario"
                  onClick={() => handleSelectUser(u.id_usuario)}
                >
                  {u.username} — {u.nombre || 'Sin nombre'} ({u.utilidades} utilidades)
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* 🔹 Edición de utilidades */}
      {selectedUser && (
        <div className="nt-card">
          <h4>Editar utilidades de usuario</h4>

          {loading && <p>Cargando...</p>}

          {!loading && (
            <>
              <ul>
                {ALL_UTILIDADES.map((u) => (
                  <li key={u}>
                    <label>
                      <input
                        type="checkbox"
                        checked={utilidades.includes(u)}
                        onChange={() => toggleUtilidad(u)}
                      />
                      {u}
                    </label>
                  </li>
                ))}
              </ul>

              <div style={{ marginTop: 10 }}>
                <button className="btn-primario" onClick={saveChanges} disabled={loading}>
                  Guardar cambios
                </button>
                <button
                  className="btn-secundario"
                  style={{ marginLeft: 10 }}
                  onClick={() => setSelectedUser(null)}
                  disabled={loading}
                >
                  Volver
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
