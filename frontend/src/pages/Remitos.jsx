import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../api/axiosConfig";
import "./../styles/transferencias.css";

export default function Remitos() {

  const navigate = useNavigate();
  const [remitos, setRemitos] = useState([]);
  const [filtro, setFiltro] = useState("");

  // paginado PRO
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [gotoPage, setGotoPage] = useState("");

  const fetchRemitos = () => {
    api.get("/remitos")
      .then(res => setRemitos(res.data || []))
      .catch(err => console.error(err));
  };

  useEffect(() => { fetchRemitos(); }, []);

  const filtrados = remitos.filter(r =>
    Object.values(r).some(v =>
      String(v ?? "").toLowerCase().includes(filtro.toLowerCase())
    )
  );

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
      <h2 className="module-title">Remitos</h2>

      <div className="acciones">
        <button onClick={() => navigate("/remitos/nuevo")}>
          Ingreso manual
        </button>

        <button disabled title="Se habilita más adelante">
          Importar planilla
        </button>

        <button disabled title="Se habilita más adelante">
          Descargar planilla
        </button>

        <input
          type="text"
          placeholder="Filtrar remitos"
          value={filtro}
          onChange={(e) => { setFiltro(e.target.value); setCurrentPage(1); }}
        />
      </div>

      <table className="tabla-transferencias">
        <thead>
          <tr>
            <th>Fecha</th>
            <th>Depósito</th>
            <th>Tipo</th>
            <th>Nro remito</th>
            <th>Usuario</th>
          </tr>
        </thead>
        <tbody>
          {paginated.map((r) => {
            const id = r.numero_remito ?? r.id;
            return (
              <tr
                key={id}
                style={{ cursor: "pointer" }}
                onClick={() => navigate(`/remitos/${id}`)}
                title="Ver detalle"
              >
                <td>{r.fecha ? new Date(r.fecha).toLocaleString("es-AR") : ""}</td>
                <td>{r.deposito}</td>
                <td>{r.tipo}</td>
                <td>{id}</td>
                <td>{r.usuario ?? ""}</td>
              </tr>
            );
          })}
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
