import React, { useEffect, useMemo, useState } from "react";
import api from "../api/axiosConfig";
import "./../styles/articulos.css";

import ArticuloCrearModal from "../components/ArticuloCrearModal";
import ArticuloEditarModal from "../components/ArticuloEditarModal";
import ArticuloEliminarModal from "../components/ArticuloEliminarModal";

const CAMPOS_OCULTOS = ["almacen", "cantidad", "traspasa", "ubicacion"]; // traspasa fuera

export default function Articulos() {
  const [articulos, setArticulos] = useState([]);
  const [filtered, setFiltered] = useState([]);
  const [openEliminar, setOpenEliminar] = useState(false);
  const [rowEliminar, setRowEliminar] = useState(null);

  // ================= PAGINADO PRO (copiado de Stock) =================
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [goTo, setGoTo] = useState("");

  const [openCrear, setOpenCrear] = useState(false);
  const [openEditar, setOpenEditar] = useState(false);
  const [rowEditar, setRowEditar] = useState(null);

  useEffect(() => {
    fetchArticulos();
  }, []);

  const fetchArticulos = () => {
    api
      .get("/articulos")
      .then((res) => {
        setArticulos(res.data || []);
        setFiltered(res.data || []);
        setCurrentPage(1); // reset
      })
      .catch((err) => console.error(err));
  };

  // columnas: union de keys + "tipo" forzado
  const columnas = useMemo(() => {
    if (!articulos?.length) return [];
    const cols = Object.keys(articulos[0] || {})
      .filter((c) => !CAMPOS_OCULTOS.includes(String(c).toLowerCase()));

    // forzar "tipo"
    const tieneTipo = cols.some((c) => String(c).toLowerCase() === "tipo");
    if (!tieneTipo) {
      const idxDesc = cols.findIndex((c) => String(c).toLowerCase() === "descripcion");
      if (idxDesc >= 0) cols.splice(idxDesc + 1, 0, "tipo");
      else cols.push("tipo");
    }

    return cols;
  }, [articulos]);

  const handleFilter = (e, key) => {
    const val = e.target.value.toLowerCase();
    setFiltered(
      articulos.filter((a) => String(a[key] ?? "").toLowerCase().includes(val))
    );
    setCurrentPage(1);
  };

  // ================= PAGINADO PRO (copiado de Stock) =================
  const totalItems = filtered.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));

  const paginated = filtered.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize
  );

  const clampPage = (p) => {
    const n = Number(p);
    if (!Number.isFinite(n)) return 1;
    return Math.min(Math.max(1, n), totalPages);
  };

  const gotoPage = (p) => setCurrentPage(clampPage(p));

  const buildPageButtons = () => {
    const pages = [];
    const windowSize = 2;

    const start = Math.max(2, currentPage - windowSize);
    const end = Math.min(totalPages - 1, currentPage + windowSize);

    pages.push(1);
    if (start > 2) pages.push("…");

    for (let p = start; p <= end; p++) pages.push(p);

    if (end < totalPages - 1) pages.push("…");
    if (totalPages > 1) pages.push(totalPages);

    return pages;
  };

  const pageButtons = buildPageButtons();

  return (
    <div className="articulos-container">
      <h2 className="module-title">ARTÍCULOS</h2>

      <button className="nuevo-btn" onClick={() => setOpenCrear(true)}>
        Crear nuevo artículo
      </button>

      <ArticuloCrearModal
        isOpen={openCrear}
        onClose={() => setOpenCrear(false)}
        articulos={articulos}
        onSaved={fetchArticulos}
      />

      <ArticuloEditarModal
        isOpen={openEditar}
        onClose={() => setOpenEditar(false)}
        articuloRow={rowEditar}
        articulos={articulos}
        onSaved={fetchArticulos}
      />

      <ArticuloEliminarModal
        isOpen={openEliminar}
        onClose={() => setOpenEliminar(false)}
        articuloRow={rowEliminar}
        onDeleted={fetchArticulos}
      />

      <div className="tabla-articulos-container">
        <table className="tabla-articulos">
          <thead>
            <tr>
              {columnas.map((col) => (
                <th key={col}>{String(col).toUpperCase()}</th>
              ))}
              <th>ACCIONES</th>
            </tr>
            <tr>
              {columnas.map((col) => (
                <th key={col}>
                  <input
                    placeholder="Filtrar..."
                    onChange={(e) => handleFilter(e, col)}
                  />
                </th>
              ))}
              <th></th>
            </tr>
          </thead>

          <tbody>
            {paginated.map((a, i) => (
              <tr key={i}>
                {columnas.map((k) => (
                  <td key={k}>{String(a[k] ?? "")}</td>
                ))}
                <td>
                  <button
                    className="btn-editar"
                    onClick={() => {
                      setRowEditar(a);
                      setOpenEditar(true);
                    }}
                  >
                    Editar
                  </button>
                  <button
                    className="btn-eliminar"
                    onClick={() => {
                      setRowEliminar(a);
                      setOpenEliminar(true);
                    }}
                    style={{ marginLeft: 8 }}
                  >
                    Eliminar
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ================= PAGINADO PRO (copiado de Stock) ================= */}
      <div className="paginado-pro">
        <div className="paginado-info">
          Total <b>{totalItems}</b> registros
        </div>

        <div className="paginado-info">
          Pág. <b>{currentPage}</b>/<b>{totalPages}</b>
        </div>

        <div className="paginado-size">
          <select
            value={pageSize}
            onChange={(e) => {
              setPageSize(Number(e.target.value));
              setCurrentPage(1);
            }}
          >
            <option value={10}>10 / pág</option>
            <option value={25}>25 / pág</option>
            <option value={50}>50 / pág</option>
            <option value={100}>100 / pág</option>
          </select>
        </div>

        <div className="paginado-goto">
          <span>Ir a</span>
          <input
            value={goTo}
            onChange={(e) => setGoTo(e.target.value.replace(/[^\d]/g, ""))}
            onKeyDown={(e) => e.key === "Enter" && gotoPage(goTo)}
          />
        </div>

        <div className="paginado-botones">
          <button
            className="pg-btn"
            onClick={() => gotoPage(1)}
            disabled={currentPage === 1}
          >
            «
          </button>
          <button
            className="pg-btn"
            onClick={() => gotoPage(currentPage - 1)}
            disabled={currentPage === 1}
          >
            ‹
          </button>

          {pageButtons.map((p, idx) =>
            p === "…" ? (
              <span key={idx} className="pg-dots">…</span>
            ) : (
              <button
                key={p}
                className={`pg-btn ${currentPage === p ? "activo" : ""}`}
                onClick={() => gotoPage(p)}
              >
                {p}
              </button>
            )
          )}

          <button
            className="pg-btn"
            onClick={() => gotoPage(currentPage + 1)}
            disabled={currentPage === totalPages}
          >
            ›
          </button>
          <button
            className="pg-btn"
            onClick={() => gotoPage(totalPages)}
            disabled={currentPage === totalPages}
          >
            »
          </button>
        </div>
      </div>
    </div>
  );
}
