import "./styles/KPICard.css";

export default function KPICard({ title, value, color }) {
  return (
    <div className="kpi-card" style={{ borderTop: `4px solid ${color}` }}>
      <h3>{title}</h3>
      <p>{value}</p>
    </div>
  );
}
