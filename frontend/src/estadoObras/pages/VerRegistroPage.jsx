import { useEffect, useState } from "react";

export default function VerRegistroPage() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function cargarRegistro() {
    try {
      setLoading(true);
      setError("");

      const res = await fetch("/api/dropbox/registro-ot");
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data?.error || "No se pudo cargar el registro");
      }

      setRows(Array.isArray(data.rows) ? data.rows : []);
    } catch (err) {
      setError(err.message || "Error inesperado");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    cargarRegistro();
  }, []);

  return (
    <div>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "16px",
          gap: "12px",
          flexWrap: "wrap",
        }}
      >
        <h2 style={{ margin: 0 }}>Registro OT</h2>

        <button onClick={cargarRegistro} disabled={loading}>
          {loading ? "Cargando..." : "Actualizar"}
        </button>
      </div>

      {error && (
        <div style={{ marginBottom: "12px", color: "red" }}>
          {error}
        </div>
      )}

      <div style={{ overflowX: "auto" }}>
        <table
          style={{
            width: "100%",
            borderCollapse: "collapse",
            minWidth: "1000px",
          }}
        >
          <thead>
            <tr>
              <th style={thStyle}>Máquina</th>
              <th style={thStyle}>Código</th>
              <th style={thStyle}>Pedido</th>
              <th style={thStyle}>Fabricado</th>
              <th style={thStyle}>Fecha</th>
              <th style={thStyle}>Hora de Inicio</th>
              <th style={thStyle}>Hora de Fin</th>
              <th style={thStyle}>Operador</th>
              <th style={thStyle}>Parada</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && !loading ? (
              <tr>
                <td style={tdStyle} colSpan={9}>
                  No hay datos para mostrar.
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr key={row.id}>
                  <td style={tdStyle}>{row.maquina}</td>
                  <td style={tdStyle}>{row.codigo}</td>
                  <td style={tdStyle}>{row.pedido}</td>
                  <td style={tdStyle}>{row.fabricado}</td>
                  <td style={tdStyle}>{row.fecha}</td>
                  <td style={tdStyle}>{row.horaInicio}</td>
                  <td style={tdStyle}>{row.horaFin}</td>
                  <td style={tdStyle}>{row.operador}</td>
                  <td style={tdStyle}>{row.parada}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const thStyle = {
  border: "1px solid #ccc",
  padding: "10px",
  textAlign: "left",
  background: "#f3f3f3",
};

const tdStyle = {
  border: "1px solid #ccc",
  padding: "10px",
  textAlign: "left",
};