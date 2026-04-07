export default function KPIDashboard({ obras }) {
  const total = obras.length;
  const onTime = obras.filter(o => o.riesgo === "Bajo").length;
  const enRiesgo = obras.filter(o => o.riesgo === "Moderado" || o.riesgo === "Alto").length;
  const promedio = Math.round(obras.reduce((acc, o) => acc + o.progreso, 0) / total);

  return (
    <div className="kpi-panel">
      <div className="kpi-item azul">
        <h3>{total}</h3>
        <p>Total Obras</p>
      </div>
      <div className="kpi-item verde">
        <h3>{onTime}</h3>
        <p>En plazo</p>
      </div>
      <div className="kpi-item rojo">
        <h3>{enRiesgo}</h3>
        <p>En riesgo</p>
      </div>
      <div className="kpi-item amarillo">
        <h3>{promedio}%</h3>
        <p>Avance promedio</p>
      </div>
    </div>
  );
}
