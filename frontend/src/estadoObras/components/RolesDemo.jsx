import { useState } from "react";
import "./RolesDemo.css";

export default function RolesDemo({ obras = [] }) {
  const [rol, setRol] = useState("Direccion");

  const obrasEnRiesgo = obras.filter(
    (o) => new Date(o.fecha_compromiso) < new Date()
  );

  const obrasProduccion = obras.filter((o) =>
    ["En Producción", "Planificada", "Comprometida"].includes(o.estado)
  );
  const obrasCompras = obras.filter((o) => o.estado === "En Compras");
  const obrasInstalacion = obras.filter((o) =>
    ["Lista p/Logística", "En Instalación"].includes(o.estado)
  );

  const renderContenido = () => {
    switch (rol) {
      case "Direccion":
        return (
          <div className="rol-view">
            <h2>📊 Dirección</h2>
            <div className="stats">
              <div className="card">
                <h3>Obras Totales</h3>
                <p>{obras.length}</p>
              </div>
              <div className="card alert">
                <h3>Obras en Riesgo</h3>
                <p>{obrasEnRiesgo.length}</p>
              </div>
              <div className="card">
                <h3>Promedio de cumplimiento</h3>
                <p>
                  {(
                    obras.reduce((a, b) => a + b.progreso, 0) / obras.length
                  ).toFixed(1)}
                  %
                </p>
              </div>
            </div>
            <p className="hint">
              🔹 Vista global consolidada para la toma de decisiones.
            </p>
          </div>
        );

      case "Produccion":
        return (
          <div className="rol-view">
            <h2>⚙️ Producción</h2>
            {obrasProduccion.slice(0, 5).map((o) => (
              <div key={o.id} className="obra-item">
                <strong>{o.cliente}</strong> — {o.estado} ({o.progreso}%)
                <div className="barra">
                  <div
                    className="barra-interna"
                    style={{
                      width: `${o.progreso}%`,
                      background: o.progreso > 80 ? "#4ade80" : "#facc15",
                    }}
                  ></div>
                </div>
              </div>
            ))}
            <p className="hint">🔹 Seguimiento diario de fabricación y avances.</p>
          </div>
        );

      case "Compras":
        return (
          <div className="rol-view">
            <h2>🧾 Compras</h2>
            {obrasCompras.length > 0 ? (
              obrasCompras.map((o) => (
                <div key={o.id} className="obra-item">
                  <strong>{o.cliente}</strong> — {o.estado}
                  <p>
                    Fecha compromiso:{" "}
                    <span className="fecha">{o.fecha_compromiso}</span>
                  </p>
                </div>
              ))
            ) : (
              <p>No hay obras pendientes en compras.</p>
            )}
            <p className="hint">
              🔹 Control de órdenes de compra y recepción de materiales.
            </p>
          </div>
        );

      case "Instalacion":
        return (
          <div className="rol-view">
            <h2>🧱 Instalación</h2>
            {obrasInstalacion.length > 0 ? (
              obrasInstalacion.map((o) => (
                <div key={o.id} className="obra-item">
                  <strong>{o.cliente}</strong> — {o.estado}
                  <p>
                    Dirección: <span className="dir">{o.direccion}</span>
                  </p>
                </div>
              ))
            ) : (
              <p>No hay obras en instalación actualmente.</p>
            )}
            <p className="hint">
              🔹 Control de montaje, incidencias y cierre de obra.
            </p>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div className="roles-demo">
      <h1>Roles y Permisos – Demo</h1>
      <div className="selector-rol">
        <label>Seleccionar Rol: </label>
        <select value={rol} onChange={(e) => setRol(e.target.value)}>
          <option value="Direccion">Dirección</option>
          <option value="Produccion">Producción</option>
          <option value="Compras">Compras</option>
          <option value="Instalacion">Instalación</option>
        </select>
      </div>
      {renderContenido()}
    </div>
  );
}
