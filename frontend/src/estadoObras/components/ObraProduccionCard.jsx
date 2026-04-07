import "./styles/ObraProduccionCard.css";

export default function ObraProduccionCard({ obra }) {
  const operaciones = Array.isArray(obra?.operaciones) ? obra.operaciones : [];

  const todasOk =
    operaciones.length > 0 &&
    operaciones.every((op) => Number(op.fabricado || 0) >= Number(op.pedido || 0));

  return (
    <div className="obra-prod-card">
      <div className="header">
        <h2>OBRA: {obra?.obra || "-"}</h2>
        {todasOk && <span className="badge-ok">OBRA COMPLETADA</span>}
      </div>

      <table>
        <thead>
          <tr>
            <th>OPERACIÓN</th>
            <th>PEDIDO</th>
            <th>FABRICADO</th>
          </tr>
        </thead>
        <tbody>
          {operaciones.length === 0 ? (
            <tr>
              <td colSpan={3}>Sin operaciones</td>
            </tr>
          ) : (
            operaciones.map((op, i) => {
              const ok = Number(op.fabricado || 0) >= Number(op.pedido || 0);

              return (
                <tr key={i} className={ok ? "ok" : ""}>
                  <td>{op.operacion || "-"}</td>
                  <td>{op.pedido ?? 0}</td>
                  <td>{op.fabricado ?? 0}</td>
                </tr>
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );
}