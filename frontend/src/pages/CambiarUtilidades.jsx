import React, { useEffect, useState } from "react";
import api from "../api/axiosConfig";
import { toast } from "react-toastify";

export default function CambiarUtilidades() {
  const [usuarios, setUsuarios] = useState([]);
  const [selectedUser, setSelectedUser] = useState(null);
  const [utilidades, setUtilidades] = useState([]);
  const [loading, setLoading] = useState(false);

  const ALL_UTILIDADES = [
    {
      key: "Ajustes",
      label: "Ajustes",
    },
    {
      key: "Transferencias",
      label: "Transferencias",
    },
    {
      key: "PlanificacionProduccion",
      label: "Planificación de Producción",
    },
    {
      key: "Observaciones",
      label: "Observaciones",
    },
    {
      key: "Artículos",
      label: "Artículos",
    },
    {
      key: "Stock",
      label: "Stock",
    },
    {
      key: "AdministracionStock",
      label: "Administración de Stock",
    },
    {
      key: "Movimientos",
      label: "Movimientos",
    },
    {
      key: "Administración",
      label: "Administración",
    },
    {
      key: "EstadoObras",
      label: "Estado de Obras",
    },
  ];

  // ==========================================
  // CARGAR TODOS LOS USUARIOS
  // ==========================================

  const loadUsuarios = async () => {
    try {
      const res = await api.get("/utilidades");

      setUsuarios(
        Array.isArray(res.data)
          ? res.data
          : [],
      );
    } catch (err) {
      console.error(
        "Error cargando usuarios:",
        err,
      );

      toast.error(
        "Error al cargar usuarios",
      );

      setUsuarios([]);
    }
  };

  useEffect(() => {
    loadUsuarios();
  }, []);

  // ==========================================
  // SELECCIONAR USUARIO Y TRAER UTILIDADES
  // ==========================================

  const handleSelectUser = async (id) => {
    setSelectedUser(id);
    setLoading(true);

    try {
      const res = await api.get(
        `/utilidades/${id}`,
      );

      setUtilidades(
        Array.isArray(res.data)
          ? res.data
          : [],
      );
    } catch (err) {
      console.error(
        "Error obteniendo utilidades:",
        err,
      );

      toast.error(
        "Error al obtener utilidades del usuario",
      );

      setUtilidades([]);
    } finally {
      setLoading(false);
    }
  };

  // ==========================================
  // MARCAR / DESMARCAR UTILIDAD
  // ==========================================

  const toggleUtilidad = (nombre) => {
    setUtilidades((prev) => {
      if (prev.includes(nombre)) {
        return prev.filter(
          (u) => u !== nombre,
        );
      }

      return [
        ...prev,
        nombre,
      ];
    });
  };

  // ==========================================
  // GUARDAR CAMBIOS
  // ==========================================

  const saveChanges = async () => {
    if (!selectedUser) {
      return;
    }

    setLoading(true);

    try {
      const res = await api.post(
        `/utilidades/${selectedUser}`,
        {
          utilidades,
        },
      );

      toast.success(
        "✅ Utilidades actualizadas",
      );

      // Actualizar cantidad de utilidades
      // en la lista principal
      setUsuarios((prev) =>
        prev.map((u) =>
          u.id_usuario === selectedUser
            ? {
                ...u,
                utilidades:
                  res.data?.total ??
                  res.data?.utilidades?.length ??
                  utilidades.length,
              }
            : u,
        ),
      );

      // Volver a la lista
      setSelectedUser(null);
      setUtilidades([]);
    } catch (err) {
      console.error(
        "Error guardando utilidades:",
        err,
      );

      toast.error(
        err.response?.data?.error ||
          "Error al guardar cambios",
      );
    } finally {
      setLoading(false);
    }
  };

  // ==========================================
  // VOLVER
  // ==========================================

  const volverAUsuarios = () => {
    setSelectedUser(null);
    setUtilidades([]);
  };

  return (
    <div className="articulos-container">
      <h2 className="module-title">
        Utilidades por Usuario
      </h2>

      {/* ====================================== */}
      {/* LISTA DE USUARIOS */}
      {/* ====================================== */}

      {!selectedUser && (
        <div className="nt-card">
          <h4>
            Seleccione un usuario:
          </h4>

          {usuarios.length === 0 ? (
            <p>
              No hay usuarios para mostrar.
            </p>
          ) : (
            <ul>
              {usuarios.map((u) => (
                <li
                  key={u.id_usuario}
                >
                  <button
                    type="button"
                    className="btn-secundario"
                    onClick={() =>
                      handleSelectUser(
                        u.id_usuario,
                      )
                    }
                  >
                    {u.username} —{" "}
                    {u.nombre ||
                      "Sin nombre"}{" "}
                    (
                    {u.utilidades ?? 0}{" "}
                    utilidades)
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* ====================================== */}
      {/* EDICIÓN DE UTILIDADES */}
      {/* ====================================== */}

      {selectedUser && (
        <div className="nt-card">
          <h4>
            Editar utilidades de usuario
          </h4>

          {loading && (
            <p>Cargando...</p>
          )}

          {!loading && (
            <>
              <ul>
                {ALL_UTILIDADES.map(
                  (item) => (
                    <li
                      key={item.key}
                    >
                      <label>
                        <input
                          type="checkbox"
                          checked={
                            utilidades.includes(
                              item.key,
                            )
                          }
                          onChange={() =>
                            toggleUtilidad(
                              item.key,
                            )
                          }
                        />

                        {" "}
                        {item.label}
                      </label>
                    </li>
                  ),
                )}
              </ul>

              <div
                style={{
                  marginTop: 10,
                }}
              >
                <button
                  type="button"
                  className="btn-primario"
                  onClick={
                    saveChanges
                  }
                  disabled={loading}
                >
                  Guardar cambios
                </button>

                <button
                  type="button"
                  className="btn-secundario"
                  style={{
                    marginLeft: 10,
                  }}
                  onClick={
                    volverAUsuarios
                  }
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