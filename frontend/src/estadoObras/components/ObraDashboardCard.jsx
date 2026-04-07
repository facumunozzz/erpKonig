import { useMemo, useState } from "react";
import "./styles/ObraDashboardCard.css";

function getDotClass(op) {
  if ((op?.pedido || 0) <= 0 && (op?.fabricado || 0) <= 0) return "dot gray";
  if (op?.completa) return "dot green";
  if ((op?.fabricado || 0) > 0) return "dot yellow";
  return "dot gray";
}

export default function ObraDashboardCard({ obra, onHide }) {
  const [open, setOpen] = useState(false);

  const cumplimiento = Number(obra?.cumplimiento || 0);
  const finalizada = Boolean(obra?.finalizada);
  const operaciones = Array.isArray(obra?.operaciones) ? obra.operaciones : [];

  const barClass = useMemo(() => {
    if (cumplimiento >= 100) return "progress-fill green";
    if (cumplimiento >= 50) return "progress-fill yellow";
    return "progress-fill red";
  }, [cumplimiento]);

  return (
    <div className="obra-card-modern">
      <button
        type="button"
        className="card-click-area"
        onClick={() => setOpen((v) => !v)}
      >
        <div className="obra-card-top">
          <div>
            <h2>Obra: {obra?.obra || "-"}</h2>
          </div>

          {finalizada && <span className="status-badge green">Completada</span>}
        </div>

        <div className="operations-grid">
          {operaciones.map((op) => (
            <div key={op.nombre} className="op-item">
              <span className={getDotClass(op)} />
              <span className="op-label">{op.nombre}</span>
            </div>
          ))}
        </div>

        <div className="prediction">
          <p>
            Cumplimiento: <strong>{cumplimiento}%</strong>
          </p>
          <div className="progress-bar">
            <div className={barClass} style={{ width: `${cumplimiento}%` }} />
          </div>
        </div>
      </button>

      {open && (
        <div className="card-detail">
          <table>
            <thead>
              <tr>
                <th>Operación</th>
                <th>Pedido</th>
                <th>Fabricado</th>
                <th>%</th>
              </tr>
            </thead>
            <tbody>
              {operaciones.map((op) => (
                <tr key={op.nombre}>
                  <td>{op.nombre}</td>
                  <td>{op.pedido}</td>
                  <td>{op.fabricado}</td>
                  <td>{op.porcentaje}%</td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="card-actions">
            <button
              type="button"
              className="hide-btn"
              onClick={() => onHide?.(obra.obra)}
            >
              Ocultar obra
            </button>
          </div>
        </div>
      )}
    </div>
  );
}