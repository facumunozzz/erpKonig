import React, { useEffect, useMemo, useState } from "react";
import api from "../api/axiosConfig";
import "./../styles/articulos.css";

import ArticuloCrearModal from "../components/ArticuloCrearModal";
import ArticuloEditarModal from "../components/ArticuloEditarModal";
import ArticuloEliminarModal from "../components/ArticuloEliminarModal";

const CAMPOS_OCULTOS = ["almacen", "cantidad", "traspasa", "ubicacion"];

// ✅ columnas base fijas (las del artículo)
const BASE_COLS = [
  "id_articulo",
  "codigo",
  "descripcion",
  "folio",
  "proveedor",
  "punto_pedido",
  "tipo",
];

export default function Articulos() {
  const [articulos, setArticulos] = useState([]);
  const [filtered, setFiltered] = useState([]);

  const [openEliminar, setOpenEliminar] = useState(false);
  const [rowEliminar, setRowEliminar] = useState(null);

  // ================= PAGINADO PRO =================
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [goTo, setGoTo] = useState("");

  const [openCrear, setOpenCrear] = useState(false);
  const [openEditar, setOpenEditar] = useState(false);
  const [rowEditar, setRowEditar] = useState(null);

  // ✅ clasificaciones activas (definen columnas dinámicas)
  const [clasifActivas, setClasifActivas] = useState([]); // [{id_clasificacion,nombre,...}]

  useEffect(() => {
    fetchArticulos();
    fetchClasifActivas();
  }, []);

  const fetchArticulos = async () => {
    try {
      const res = await api.get("/articulos");
      const rows = res.data || [];
      setArticulos(rows);
      setFiltered(rows);
      setCurrentPage(1);
    } catch (err) {
      console.error(err);
    }
  };

  const fetchClasifActivas = async () => {
    try {
      // ⚠️ Asegurate que exista: GET /clasificaciones/activas
      const res = await api.get("/clasificaciones/activas");
      setClasifActivas(res.data || []);
    } catch (err) {
      console.error("No se pudieron cargar clasificaciones activas:", err);
      setClasifActivas([]);
    }
  };

  // ✅ columnas = base + dinámicas (clasificaciones activas)
  const columnas = useMemo(() => {
    // base: usar las que existan en la data (por si el backend no manda todas)
    const baseSet = new Set(BASE_COLS.map((x) => String(x).toLowerCase()));

    // si el backend trae más keys, agregarlas (excepto ocultas y "clasificaciones")
    const extraBase =
      articulos?.length
        ? Object.keys(articulos[0] || {})
            .filter((k) => {
              const kk = String(k).toLowerCase();
              if (kk === "clasificaciones") return false;
              if (CAMPOS_OCULTOS.includes(kk)) return false;
              return !baseSet.has(kk);
            })
        : [];

    const base = [...BASE_COLS, ...extraBase].filter((k) => {
      const kk = String(k).toLowerCase();
      if (kk === "clasificaciones") return false;
      return !CAMPOS_OCULTOS.includes(kk);
    });

    // dinámicas: nombres de clasificaciones activas
    const dyn = (clasifActivas || [])
      .map((c) => String(c?.nombre ?? "").trim())
      .filter(Boolean);

    // evitar duplicados si una clasificación se llama igual que una base
    const baseNames = new Set(base.map((b) => String(b).toLowerCase()));
    const dynClean = dyn.filter((d) => !baseNames.has(String(d).toLowerCase()));

    return [...base, ...dynClean];
  }, [articulos, clasifActivas]);

  const isBaseCol = (k) => {
    const kk = String(k).toLowerCase();
    // si existe como propiedad directa del objeto artículo => base
    // (esto permite que extraBase también funcione)
    return articulos?.length ? Object.prototype.hasOwnProperty.call(articulos[0] || {}, k) : BASE_COLS.includes(kk);
  };

  const getCellValue = (a, k) => {
  if (Object.prototype.hasOwnProperty.call(a || {}, k)) return a?.[k];

  const obj = a?.clasificaciones || {};
  const key = String(k ?? "").trim();

  if (Object.prototype.hasOwnProperty.call(obj, key)) return obj[key];

  // fallback por mayúsculas (por si quedó data vieja guardada en UPPER)
  const up = key.toUpperCase();
  if (Object.prototype.hasOwnProperty.call(obj, up)) return obj[up];

  // fallback por búsqueda case-insensitive (último recurso)
  const found = Object.keys(obj).find((x) => String(x).trim().toLowerCase() === key.toLowerCase());
  if (found) return obj[found];

  return "";
};

  const handleFilter = (e, key) => {
    const val = String(e.target.value ?? "").toLowerCase();

    setFiltered(
      (articulos || []).filter((a) => {
        const v = getCellValue(a, key);
        return String(v ?? "").toLowerCase().includes(val);
      })
    );

    setCurrentPage(1);
  };

  // ================= PAGINADO PRO =================
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
        onSaved={() => {
          fetchArticulos();
          fetchClasifActivas(); // por si cambió algo
        }}
      />

      <ArticuloEditarModal
        isOpen={openEditar}
        onClose={() => setOpenEditar(false)}
        articuloRow={rowEditar}
        articulos={articulos}
        onSaved={() => {
          fetchArticulos();
          fetchClasifActivas();
        }}
      />

      <ArticuloEliminarModal
        isOpen={openEliminar}
        onClose={() => setOpenEliminar(false)}
        articuloRow={rowEliminar}
        onDeleted={() => {
          fetchArticulos();
          fetchClasifActivas();
        }}
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
              <tr key={a?.id_articulo ?? i}>
                {columnas.map((k) => (
                  <td key={k}>{String(getCellValue(a, k) ?? "")}</td>
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

      {/* ================= PAGINADO PRO ================= */}
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
              <span key={idx} className="pg-dots">
                …
              </span>
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