import React, { useEffect, useMemo, useState } from "react";
import api from "../api/axiosConfig";
import "./../styles/ubicaciones.css";

export default function UbicacionesModal({ isOpen, onClose, onSaved }) {
  const [ubicaciones, setUbicaciones] = useState([]);
  const [depositoDefaultId, setDepositoDefaultId] = useState(null);

  const [nuevoNombre, setNuevoNombre] = useState("");

  const [editId, setEditId] = useState(null);
  const [editNombre, setEditNombre] = useState("");
  const [editActiva, setEditActiva] = useState(true);

  useEffect(() => {
    if (isOpen) {
      cargarDatos();
    }
  }, [isOpen]);

  const cargarDatos = async () => {
    try {
      const [resUbicaciones, resDepositos] = await Promise.all([
        api.get("/ubicaciones"),
        api.get("/depositos"),
      ]);

      setUbicaciones(resUbicaciones.data || []);

      const depositos = resDepositos.data || [];
      if (depositos.length) {
        setDepositoDefaultId(depositos[0].id_deposito);
      } else {
        setDepositoDefaultId(null);
      }
    } catch (err) {
      console.error("Error cargando ubicaciones:", err);
      alert("No se pudieron cargar las ubicaciones.");
    }
  };

  const ubicacionesOrdenadas = useMemo(() => {
    return [...(ubicaciones || [])].sort((a, b) =>
      String(a.nombre || "").localeCompare(String(b.nombre || ""))
    );
  }, [ubicaciones]);

  const existeUbicacion = (nombre) => {
    const buscado = String(nombre || "").trim().toUpperCase();

    return (ubicaciones || []).some(
      (u) => String(u.nombre || "").trim().toUpperCase() === buscado
    );
  };

  const crearUbicacion = async () => {
    const nombre = String(nuevoNombre || "").trim().toUpperCase();

    if (!nombre) {
      alert("El nombre de la ubicación no puede estar vacío.");
      return;
    }

    if (existeUbicacion(nombre)) {
      alert("La ubicación ya existe.");
      return;
    }

    if (!depositoDefaultId) {
      alert(
        "No hay depósitos cargados. Para crear ubicaciones, primero debe existir al menos un depósito."
      );
      return;
    }

    try {
      await api.post("/ubicaciones", {
        deposito_id: Number(depositoDefaultId),
        nombre,
      });

      setNuevoNombre("");
      await cargarDatos();

      if (onSaved) onSaved();
    } catch (err) {
      console.error("Error creando ubicación:", err);
      alert(
        err.response?.data?.error ||
          err.response?.data?.detalle ||
          "No se pudo crear la ubicación."
      );
    }
  };

  const iniciarEdicion = (u) => {
    setEditId(u.id_ubicacion);
    setEditNombre(u.nombre || "");
    setEditActiva(Boolean(u.activa));
  };

  const cancelarEdicion = () => {
    setEditId(null);
    setEditNombre("");
    setEditActiva(true);
  };

  const guardarEdicion = async (id) => {
    const nombre = String(editNombre || "").trim().toUpperCase();

    if (!nombre) {
      alert("El nombre no puede estar vacío.");
      return;
    }

    try {
      await api.put(`/ubicaciones/${id}`, {
        nombre,
        activa: editActiva ? 1 : 0,
      });

      cancelarEdicion();
      await cargarDatos();

      if (onSaved) onSaved();
    } catch (err) {
      console.error("Error editando ubicación:", err);
      alert(
        err.response?.data?.error ||
          err.response?.data?.detalle ||
          "No se pudo editar la ubicación."
      );
    }
  };

  const eliminarUbicacion = async (u) => {
    const ok = window.confirm(
      `Vas a eliminar la ubicación "${u.nombre}".\n\n¿Seguro que querés continuar?`
    );

    if (!ok) return;

    try {
      await api.delete(`/ubicaciones/${u.id_ubicacion}`, {
        timeout: 180000,
      });

      await cargarDatos();

      if (onSaved) onSaved();
    } catch (err) {
      console.error("Error eliminando ubicación:", err);
      alert(
        err.response?.data?.error ||
          err.response?.data?.detalle ||
          "No se pudo eliminar la ubicación."
      );
    }
  };

  if (!isOpen) return null;

  return (
    <div className="ubi-modal-overlay">
      <div className="ubi-modal">
        <div className="ubi-modal-header">
          <h3>Administrar ubicaciones</h3>

          <button className="ubi-close" onClick={onClose}>
            ×
          </button>
        </div>

        <div className="ubi-new-row-simple">
          <input
            value={nuevoNombre}
            onChange={(e) => setNuevoNombre(e.target.value.toUpperCase())}
            placeholder="Nueva ubicación"
            onKeyDown={(e) => {
              if (e.key === "Enter") crearUbicacion();
            }}
          />

          <button className="ubi-btn-primary" onClick={crearUbicacion}>
            Agregar
          </button>
        </div>

        <div className="ubi-table-wrap">
          <table className="ubi-table">
            <thead>
              <tr>
                <th>Ubicación</th>
                <th>Activa</th>
                <th>Acciones</th>
              </tr>
            </thead>

            <tbody>
              {ubicacionesOrdenadas.map((u) => (
                <tr key={u.id_ubicacion}>
                  <td>
                    {editId === u.id_ubicacion ? (
                      <input
                        value={editNombre}
                        onChange={(e) =>
                          setEditNombre(e.target.value.toUpperCase())
                        }
                        autoFocus
                      />
                    ) : (
                      u.nombre
                    )}
                  </td>

                  <td>
                    {editId === u.id_ubicacion ? (
                      <input
                        type="checkbox"
                        checked={editActiva}
                        onChange={(e) => setEditActiva(e.target.checked)}
                      />
                    ) : u.activa ? (
                      "Sí"
                    ) : (
                      "No"
                    )}
                  </td>

                  <td className="ubi-actions">
                    {editId === u.id_ubicacion ? (
                      <>
                        <button
                          className="ubi-btn-primary"
                          onClick={() => guardarEdicion(u.id_ubicacion)}
                        >
                          Guardar
                        </button>

                        <button onClick={cancelarEdicion}>Cancelar</button>
                      </>
                    ) : (
                      <>
                        <button onClick={() => iniciarEdicion(u)}>
                          Editar
                        </button>

                        <button
                          className="ubi-btn-danger"
                          onClick={() => eliminarUbicacion(u)}
                        >
                          Eliminar
                        </button>
                      </>
                    )}
                  </td>
                </tr>
              ))}

              {!ubicacionesOrdenadas.length && (
                <tr>
                  <td colSpan="3">No hay ubicaciones cargadas.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="ubi-footer">
          <button onClick={onClose}>Cerrar</button>
        </div>
      </div>
    </div>
  );
}