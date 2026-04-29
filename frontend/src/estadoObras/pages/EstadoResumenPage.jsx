import { useEffect, useMemo, useState } from "react";
import EstadoCargaModal from "./EstadoCargaModal";
import "./styles/EstadoResumenTable.css";

const ESTADOS = [
  "Obras finalizadas con faltantes de INSTALACIÓN",
  "Producción en proceso",
  "En espera por faltantes",
  "Reprocesos y especiales",
  "Para producción",
  "En planificación",
  "Revisión y análisis",
  "Enviado a producir comercial",
  "Acopios",
  "Obras cerradas",
  "Acopios especiales - Obras no cerradas",
];

export default function EstadoResumenTable() {
  const [estadoSeleccionado, setEstadoSeleccionado] = useState(null);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function cargarDatos() {
    try {
      setLoading(true);
      setError("");

      const res = await fetch("/api/estado-resumen");
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data?.error || "No se pudo cargar la tabla de seguimiento");
      }

      setRows(Array.isArray(data.rows) ? data.rows : []);
    } catch (err) {
      setError(err.message || "Error inesperado");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    cargarDatos();
  }, []);

  const agrupado = useMemo(() => {
    const map = new Map();

    for (const estado of ESTADOS) {
      map.set(estado, []);
    }

    for (const row of rows) {
      const estado = String(row.estado || "").trim();
      if (!map.has(estado)) {
        map.set(estado, []);
      }
      map.get(estado).push(row);
    }

    return map;
  }, [rows]);

  return (
    <div className="estado-resumen-page">
      <div className="estado-resumen-toolbar">
        <div>
          <h2>Resumen por Estado</h2>
          <p>Cargá información por estado desde el botón +.</p>
        </div>

        <button
          type="button"
          className="estado-resumen-refresh-btn"
          onClick={cargarDatos}
          disabled={loading}
        >
          {loading ? "Actualizando..." : "Actualizar"}
        </button>
      </div>

      {error && <p className="estado-resumen-error">{error}</p>}

      <div className="estado-resumen-wrap">
        <table className="estado-resumen-table">
          <thead>
            <tr>
              <th>Acción</th>
              <th>Estado</th>
              <th>Cantidad</th>
              <th>Última carga</th>
              <th>Comentario</th>
            </tr>
          </thead>
          <tbody>
            {ESTADOS.map((estado) => {
              const items = agrupado.get(estado) || [];
              const ultimo = items.length > 0 ? items[0] : null;

              return (
                <tr key={estado}>
                  <td>
                    <button
                      type="button"
                      className="btn-add"
                      onClick={() => setEstadoSeleccionado(estado)}
                      title={`Agregar registro a "${estado}"`}
                    >
                      +
                    </button>
                  </td>
                  <td>{estado}</td>
                  <td>{items.length}</td>
                  <td>{formatDateTime(ultimo?.created_at)}</td>
                  <td>{ultimo?.comentario || ""}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {estadoSeleccionado && (
        <EstadoCargaModal
          estado={estadoSeleccionado}
          onClose={() => setEstadoSeleccionado(null)}
          onSaved={() => {
            setEstadoSeleccionado(null);
            cargarDatos();
          }}
        />
      )}
    </div>
  );
}

function formatDateTime(value) {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);

  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = d.getFullYear();
  const hh = String(d.getHours()).padStart(2, "0");
  const mi = String(d.getMinutes()).padStart(2, "0");

  return `${dd}/${mm}/${yyyy} ${hh}:${mi}`;
}