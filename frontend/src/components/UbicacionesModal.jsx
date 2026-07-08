import React, { useEffect, useMemo, useState } from "react";
import api from "../api/axiosConfig";
import "./../styles/ubicaciones.css";

export default function UbicacionesModal({ isOpen, onClose, onSaved }) {
  const [depositos, setDepositos] = useState([]);
  const [depositoId, setDepositoId] = useState("");

  const [ubicaciones, setUbicaciones] = useState([]);

  const [crearOpen, setCrearOpen] = useState(false);
  const [nuevoNombre, setNuevoNombre] = useState("");

  const [editId, setEditId] = useState(null);
  const [editNombre, setEditNombre] = useState("");
  const [editActiva, setEditActiva] = useState(true);

  useEffect(() => {
    if (isOpen) cargarDepositos();
  }, [isOpen]);

  useEffect(() => {
    if (depositoId) {
      cargarUbicaciones(depositoId);
    } else {
      setUbicaciones([]);
    }
  }, [depositoId]);

  const cargarDepositos = async () => {
    try {
      const res = await api.get("/depositos");
      const lista = Array.isArray(res.data) ? res.data : [];

      setDepositos(lista);

      if (lista.length) {
        setDepositoId(String(lista[0].id_deposito));
      } else {
        setDepositoId("");
      }
    } catch (err) {
      console.error("Error cargando depósitos:", err);
      alert("No se pudieron cargar los depósitos.");
    }
  };

  const cargarUbicaciones = async (idDep) => {
    try {
      const res = await api.get("/ubicaciones", {
        params: { deposito_id: Number(idDep) },
      });

      setUbicaciones(Array.isArray(res.data) ? res.data : []);
    } catch (err) {
      console.error("Error cargando ubicaciones:", err);
      alert("No se pudieron cargar las ubicaciones.");
    }
  };

  const depositoSeleccionado = useMemo(() => {
    return depositos.find((d) => Number(d.id_deposito) === Number(depositoId));
  }, [depositos, depositoId]);

  const ubicacionesOrdenadas = useMemo(() => {
    return [...ubicaciones].sort((a, b) => {
      const aNombre = String(a.nombre || "")
        .trim()
        .toUpperCase();
      const bNombre = String(b.nombre || "")
        .trim()
        .toUpperCase();

      if (aNombre === "GENERAL" && bNombre !== "GENERAL") return -1;
      if (bNombre === "GENERAL" && aNombre !== "GENERAL") return 1;

      return aNombre.localeCompare(bNombre, "es", {
        numeric: true,
        sensitivity: "base",
      });
    });
  }, [ubicaciones]);

  const existeUbicacion = (nombre) => {
    const buscado = String(nombre || "")
      .trim()
      .toUpperCase();

    return ubicaciones.some(
      (u) =>
        String(u.nombre || "")
          .trim()
          .toUpperCase() === buscado,
    );
  };

  const abrirCrear = () => {
    if (!depositoId) {
      alert("Primero seleccioná un depósito.");
      return;
    }

    setNuevoNombre("");
    setCrearOpen(true);
  };

  const crearUbicacion = async () => {
    const nombre = String(nuevoNombre || "")
      .trim()
      .toUpperCase();

    if (!depositoId) {
      alert("Debe seleccionar un depósito.");
      return;
    }

    if (!nombre) {
      alert("El nombre de la ubicación no puede estar vacío.");
      return;
    }

    if (existeUbicacion(nombre)) {
      alert("La ubicación ya existe dentro de este depósito.");
      return;
    }

    try {
      await api.post("/ubicaciones", {
        deposito_id: Number(depositoId),
        nombre,
      });

      setNuevoNombre("");
      setCrearOpen(false);

      await cargarUbicaciones(depositoId);

      if (onSaved) onSaved();
    } catch (err) {
      console.error("Error creando ubicación:", err);
      alert(
        err.response?.data?.error ||
          err.response?.data?.detalle ||
          "No se pudo crear la ubicación.",
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
    const nombre = String(editNombre || "")
      .trim()
      .toUpperCase();

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
      await cargarUbicaciones(depositoId);

      if (onSaved) onSaved();
    } catch (err) {
      console.error("Error editando ubicación:", err);
      alert(
        err.response?.data?.error ||
          err.response?.data?.detalle ||
          "No se pudo editar la ubicación.",
      );
    }
  };

  const eliminarUbicacion = async (u) => {
    const ok = window.confirm(
      `Vas a eliminar la ubicación "${u.nombre}" del depósito "${depositoSeleccionado?.nombre || ""}".\n\n¿Seguro que querés continuar?`,
    );

    if (!ok) return;

    try {
      await api.delete(`/ubicaciones/${u.id_ubicacion}`, {
        timeout: 180000,
      });

      await cargarUbicaciones(depositoId);

      if (onSaved) onSaved();
    } catch (err) {
      console.error("Error eliminando ubicación:", err);
      alert(
        err.response?.data?.error ||
          err.response?.data?.detalle ||
          "No se pudo eliminar la ubicación.",
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
          <select
            value={depositoId}
            onChange={(e) => {
              setDepositoId(e.target.value);
              cancelarEdicion();
            }}
          >
            <option value="">Seleccionar depósito</option>

            {depositos.map((dep) => (
              <option key={dep.id_deposito} value={dep.id_deposito}>
                {dep.nombre}
              </option>
            ))}
          </select>

          <button className="ubi-btn-primary" onClick={abrirCrear}>
            Nueva ubicación
          </button>
        </div>

        {depositoSeleccionado && (
          <div style={{ marginBottom: "10px", fontWeight: "600" }}>
            Depósito seleccionado: {depositoSeleccionado.nombre}
          </div>
        )}

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

              {!depositoId && (
                <tr>
                  <td colSpan="3">Seleccioná un depósito.</td>
                </tr>
              )}

              {depositoId && !ubicacionesOrdenadas.length && (
                <tr>
                  <td colSpan="3">
                    No hay ubicaciones cargadas en este depósito.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="ubi-footer">
          <button onClick={onClose}>Cerrar</button>
        </div>
      </div>

      {crearOpen && (
        <div className="ubi-modal-overlay">
          <div className="ubi-modal" style={{ maxWidth: "420px" }}>
            <div className="ubi-modal-header">
              <h3>Nueva ubicación</h3>

              <button className="ubi-close" onClick={() => setCrearOpen(false)}>
                ×
              </button>
            </div>

            <div style={{ marginBottom: "10px" }}>
              Depósito: <b>{depositoSeleccionado?.nombre}</b>
            </div>

            <div className="ubi-new-row-simple">
              <input
                value={nuevoNombre}
                onChange={(e) => setNuevoNombre(e.target.value.toUpperCase())}
                placeholder="Nombre de la ubicación"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === "Enter") crearUbicacion();
                }}
              />
            </div>

            <div className="ubi-footer">
              <button className="ubi-btn-primary" onClick={crearUbicacion}>
                Crear
              </button>

              <button onClick={() => setCrearOpen(false)}>Cancelar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
