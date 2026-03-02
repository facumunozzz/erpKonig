import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../api/axiosConfig";
import "./../styles/transferencias.css";

export default function Ajustes() {
  const navigate = useNavigate();

  const [ajustes, setAjustes] = useState([]);
  const [filtro, setFiltro] = useState("");

  const consumirProduccion = async () => {
    try {
      const res = await api.post("/ajustes/consumir-produccion");
      alert(`Proceso finalizado. Ajustados: ${res.data.ajustados || 0}`);
    } catch (err) {
      alert(err.response?.data?.error || "Error al consumir producción");
    }
  };

  // Paginado
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [gotoPage, setGotoPage] = useState("");

  const fetchAjustes = () => {
    api.get("/ajustes")
      .then((res) => setAjustes(res.data || []))
      .catch((err) => console.error(err));
  };

  useEffect(() => {
    fetchAjustes();
  }, []);

  // =========================
  // Descargar plantilla Excel
  // =========================
  const descargarPlantilla = async () => {
    try {
      const res = await api.get("/ajustes/plantilla", { responseType: "blob" });
      const url = window.URL.createObjectURL(res.data);
      const a = document.createElement("a");
      a.href = url;
      a.download = "Plantilla_Ajustes.xlsx";
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error(err);
      alert("Error al descargar la plantilla");
    }
  };

  // =========================
  // Importar Excel
  // =========================
  const importarExcel = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const formData = new FormData();
    formData.append("file", file);

    try {
      await api.post("/ajustes/importar", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      fetchAjustes();
      alert("Ajustes importados correctamente");
    } catch (err) {
      console.error(err);
      alert("Error al importar ajustes");
    } finally {
      e.target.value = "";
    }
  };

  // =========================
  // Filtro
  // =========================
  const filtrados = ajustes.filter((a) =>
    Object.values(a).some((v) =>
      String(v ?? "").toLowerCase().includes(filtro.toLowerCase())
    )
  );

  // =========================
  // Paginado
  // =========================
  const totalPages = Math.ceil(filtrados.length / pageSize) || 1;

  const paginated = filtrados.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize
  );

  const irPagina = (p) => {
    if (p < 1 || p > totalPages) return;
    setCurrentPage(p);
  };

  const from = (currentPage - 1) * pageSize + 1;
  const to = Math.min(currentPage * pageSize, filtrados.length);

  return (
    <div className="transferencias-page">
      <h2 className="module-title">Ajustes</h2>

      <button className="btn-primary" onClick={consumirProduccion}>
        ⚙️Ajustar Registro de Producción
      </button>

      <div className="acciones">
        <button onClick={() => navigate("/ajustes/nuevo")}>
          Nuevo ajuste
        </button>

        <button onClick={descargarPlantilla}>
          📤 Descargar plantilla
        </button>

        <label style={{ cursor: "pointer" }}>
          📥 Importar Excel
          <input
            type="file"
            accept=".xlsx,.xls"
            onChange={importarExcel}
            style={{ display: "none" }}
          />
        </label>

        <input
          type="text"
          placeholder="Filtrar ajustes"
          value={filtro}
          onChange={(e) => { setFiltro(e.target.value); setCurrentPage(1); }}
        />
      </div>

      <table className="tabla-transferencias">
        <thead>
          <tr>
            <th>Fecha</th>
            <th>Depósito</th>
            <th>Motivo</th>
            <th>Nro Ajuste</th>
          </tr>
        </thead>
        <tbody>
          {paginated.map((a) => {
            const id = a.numero_ajuste ?? a.id;
            return (
              <tr
                key={id}
                style={{ cursor: "pointer" }}
                onClick={() => navigate(`/ajustes/${id}`)}
                title="Ver detalle"
              >
                <td>{a.fecha ? new Date(a.fecha).toLocaleString("es-AR") : ""}</td>
                <td>{a.deposito}</td>
                <td>{a.motivo}</td>
                <td>{id}</td>
              </tr>
            );
          })}

          {paginated.length === 0 && (
            <tr>
              <td colSpan={4}>Sin ajustes.</td>
            </tr>
          )}
        </tbody>
      </table>

      {/* =========================
           PAGINADO PRO
         ========================= */}
      <div className="paginado-pro">

        <div className="paginado-info">
          Mostrando {from}-{to} de {filtrados.length}
        </div>

        <div className="paginado-size">
          <select
            value={pageSize}
            onChange={e => { setPageSize(Number(e.target.value)); setCurrentPage(1); }}
          >
            <option value={10}>10</option>
            <option value={25}>25</option>
            <option value={50}>50</option>
            <option value={100}>100</option>
          </select>
        </div>

        <div className="paginado-goto">
          Ir a:
          <input
            type="number"
            min="1"
            max={totalPages}
            value={gotoPage}
            onChange={e => setGotoPage(e.target.value)}
            onKeyDown={e => {
              if (e.key === "Enter") {
                irPagina(Number(gotoPage));
                setGotoPage("");
              }
            }}
          />
        </div>

        <div className="paginado-botones">
          <button className="pg-btn" onClick={() => irPagina(1)} disabled={currentPage === 1}>⏮</button>
          <button className="pg-btn" onClick={() => irPagina(currentPage - 1)} disabled={currentPage === 1}>◀</button>

          {Array.from({ length: totalPages }, (_, i) => i + 1)
            .filter(p =>
              p === 1 ||
              p === totalPages ||
              Math.abs(p - currentPage) <= 1
            )
            .map((p, i, arr) => (
              <React.Fragment key={p}>
                {i > 0 && p - arr[i - 1] > 1 && <span className="pg-dots">…</span>}
                <button
                  className={`pg-btn ${currentPage === p ? "activo" : ""}`}
                  onClick={() => irPagina(p)}
                >
                  {p}
                </button>
              </React.Fragment>
            ))}

          <button className="pg-btn" onClick={() => irPagina(currentPage + 1)} disabled={currentPage === totalPages}>▶</button>
          <button className="pg-btn" onClick={() => irPagina(totalPages)} disabled={currentPage === totalPages}>⏭</button>
        </div>
      </div>
    </div>
  );
}
