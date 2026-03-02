import React, { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import api from "../api/axiosConfig";
import "./../styles/transferencias.css";

export default function DetalleRemito() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [cabecera, setCabecera] = useState(null);
  const [detalle, setDetalle] = useState([]);
  const [error, setError] = useState("");

  useEffect(() => {
    const fetchDetalle = async () => {
      try {
        const res = await api.get(`/remitos/${id}`);
        setCabecera(res.data?.cabecera || null);
        setDetalle(res.data?.detalle || []);
      } catch (err) {
        console.error(err);
        setError(
          err.response?.data?.error ||
            "No se pudo cargar el detalle del remito"
        );
      }
    };

    fetchDetalle();
  }, [id]);

  if (error) {
    return (
      <div className="transferencias-page">
        <div className="nt-header">
          <h2 className="module-title">Detalle de Remito</h2>
          <button className="nt-volver" onClick={() => navigate("/remitos")}>
            ← Volver
          </button>
        </div>
        <div className="nt-error">{error}</div>
      </div>
    );
  }

  if (!cabecera) {
    return (
      <div className="transferencias-page">
        <h2 className="module-title">Detalle de Remito</h2>
        <p>Cargando…</p>
      </div>
    );
  }

  return (
    <div className="transferencias-page">
      <div className="nt-header">
        <h2 className="module-title">
          Remito Nº {cabecera.numero_remito}
        </h2>
        <button className="nt-volver" onClick={() => navigate("/remitos")}>
          ← Volver
        </button>
      </div>

      {/* Cabecera */}
      <div className="nt-card">
        <div className="nt-row">
          <div className="nt-field">
            <label>Fecha</label>
            <input
              type="text"
              readOnly
              value={
                cabecera.fecha
                  ? new Date(cabecera.fecha).toLocaleString("es-AR")
                  : ""
              }
            />
          </div>

          <div className="nt-field">
            <label>Depósito</label>
            <input type="text" readOnly value={cabecera.deposito} />
          </div>

          <div className="nt-field small">
            <label>Tipo</label>
            <input type="text" readOnly value={cabecera.tipo} />
          </div>

          <div className="nt-field">
            <label>Usuario</label>
            <input type="text" readOnly value={cabecera.usuario || ""} />
          </div>
        </div>

        <div className="nt-row">
          <div className="nt-field" style={{ flex: 1 }}>
            <label>Observación</label>
            <input
              type="text"
              readOnly
              value={cabecera.observacion || ""}
            />
          </div>
        </div>
      </div>

      {/* Detalle */}
      <div className="nt-card">
        <h4>Detalle del remito</h4>
        <div className="tabla-articulos-container">
          <table className="tabla-articulos">
            <thead>
              <tr>
                <th>Código</th>
                <th>Descripción</th>
                <th style={{ textAlign: "right" }}>Cantidad</th>
              </tr>
            </thead>
            <tbody>
              {detalle.length === 0 ? (
                <tr>
                  <td colSpan="3">No hay líneas para este remito.</td>
                </tr>
              ) : (
                detalle.map((d, i) => (
                  <tr key={i}>
                    <td>{d.cod_articulo}</td>
                    <td>{d.descripcion}</td>
                    <td style={{ textAlign: "right" }}>
                      {d.cantidad}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
