import { useEffect, useState } from "react";
import Dashboard from "../components/Dashboard";

export default function DashboardPage() {
  const [obras, setObras] = useState([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    cargarDatos();
  }, []);

  async function cargarDatos() {
    try {
      setLoading(true);
      setError("");

      const res = await fetch("/api/dashboard-obras");
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data?.error || "No se pudo cargar el dashboard");
      }

      const rows = Array.isArray(data.rows) ? data.rows : [];
      setObras(rows);
    } catch (err) {
      setError(err.message || "Error inesperado");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="container">
      {loading && <p>Cargando dashboard...</p>}
      {error && <p style={{ color: "red" }}>{error}</p>}
      {!loading && !error && <Dashboard obras={obras} onRefresh={cargarDatos} />}
    </div>
  );
}