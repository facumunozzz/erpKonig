import React, { useEffect, useState } from "react";
import api from "../api/axiosConfig";
import "./../styles/transferencias.css";

export default function ReferentesModal({ abierto, onClose, onChanged }) {
  const [referentes, setReferentes] = useState([]);
  const [nuevoReferente, setNuevoReferente] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const [loading, setLoading] = useState(false);

  const fetchReferentes = async () => {
    try {
      setLoading(true);
      setErrorMsg("");

      const res = await api.get("/referentes");
      setReferentes(res.data || []);
    } catch (err) {
      console.error("fetchReferentes:", err);
      setErrorMsg(
        err.response?.data?.error ||
          err.message ||
          "No se pudieron cargar los referentes."
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (abierto) {
      setNuevoReferente("");
      fetchReferentes();
    }
  }, [abierto]);

  const crearReferente = async () => {
    const nombre = String(nuevoReferente || "").trim();

    if (!nombre) return;

    try {
      await api.post("/referentes", { nombre });
      setNuevoReferente("");
      await fetchReferentes();

      if (onChanged) onChanged();
    } catch (err) {
      alert(err.response?.data?.error || "Error al crear referente");
    }
  };

  const editarReferente = async (id, actual) => {
    const nuevo = prompt("Editar referente:", actual);

    if (nuevo == null) return;

    const nombre = String(nuevo || "").trim();

    if (!nombre) return;

    try {
      await api.put(`/referentes/${id}`, { nombre });
      await fetchReferentes();

      if (onChanged) onChanged();
    } catch (err) {
      alert(err.response?.data?.error || "Error al editar referente");
    }
  };

  const toggleReferente = async (id, activo) => {
    try {
      await api.put(`/referentes/${id}`, { activo: !activo });
      await fetchReferentes();

      if (onChanged) onChanged();
    } catch (err) {
      alert(err.response?.data?.error || "Error al cambiar estado del referente");
    }
  };

  const borrarReferente = async (id) => {
    if (!confirm("¿Borrar referente? Solo se podrá borrar si nunca fue usado.")) {
      return;
    }

    try {
      await api.delete(`/referentes/${id}`);
      await fetchReferentes();

      if (onChanged) onChanged();
    } catch (err) {
      alert(err.response?.data?.error || "Error al borrar referente");
    }
  };

  if (!abierto) return null;

  return (
    <div
      className="modal-backdrop"
      style={{ position: "fixed", inset: 0, zIndex: 999999 }}
      onMouseDown={(e) => {
        if (e.target.classList.contains("modal-backdrop")) {
          onClose();
        }
      }}
    >
      <div className="modal-card" style={{ position: "relative", zIndex: 999999 }}>
        <div className="modal-head">
          <h3>Referentes</h3>
          <button onClick={onClose}>✕</button>
        </div>

        {errorMsg && (
          <div className="nt-error" style={{ marginTop: 10 }}>
            {errorMsg}
          </div>
        )}

        <div className="modal-row">
          <input
            value={nuevoReferente}
            onChange={(e) => setNuevoReferente(e.target.value)}
            placeholder="Nuevo referente…"
            onKeyDown={(e) => {
              if (e.key === "Enter") crearReferente();
            }}
          />

          <button className="btn-primary" onClick={crearReferente}>
            Agregar
          </button>

          <button onClick={fetchReferentes} disabled={loading}>
            ↻ Recargar
          </button>
        </div>

        <div style={{ maxHeight: 420, overflow: "auto", marginTop: 10 }}>
          <table className="tabla-transferencias">
            <thead>
              <tr>
                <th>Nombre</th>
                <th>Activo</th>
                <th>Acciones</th>
              </tr>
            </thead>

            <tbody>
              {referentes.map((r) => (
                <tr key={r.id_referente}>
                  <td>{r.nombre}</td>

                  <td>{r.activo ? "SI" : "NO"}</td>

                  <td style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <button
                      className="btn-light"
                      onClick={() => editarReferente(r.id_referente, r.nombre)}
                    >
                      Editar
                    </button>

                    <button
                      className="btn-light"
                      onClick={() => toggleReferente(r.id_referente, r.activo)}
                    >
                      {r.activo ? "Desactivar" : "Activar"}
                    </button>

                    <button
                      className="borrar-btn"
                      onClick={() => borrarReferente(r.id_referente)}
                    >
                      Eliminar
                    </button>
                  </td>
                </tr>
              ))}

              {!loading && referentes.length === 0 && (
                <tr>
                  <td colSpan={3}>Sin referentes.</td>
                </tr>
              )}

              {loading && (
                <tr>
                  <td colSpan={3}>Cargando referentes...</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="modal-foot">
          <button onClick={onClose}>Cerrar</button>
        </div>
      </div>
    </div>
  );
}