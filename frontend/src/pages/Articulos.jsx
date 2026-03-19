import React, { useEffect, useMemo, useState, useRef } from "react";
import api from "../api/axiosConfig";
import "./../styles/articulos.css";
import CatalogoModal from "../components/CatalogoModal";

import ArticuloCrearModal from "../components/ArticuloCrearModal";
import ArticuloEditarModal from "../components/ArticuloEditarModal";
import ArticuloEliminarModal from "../components/ArticuloEliminarModal";

const STORAGE_KEY = "articulos_col_widths_v1";
const CAMPOS_OCULTOS = ["almacen", "cantidad", "traspasa", "ubicacion"];

// ✅ columnas base fijas (las del artículo)
const BASE_COLS = [
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

  const [openProv, setOpenProv] = useState(false);
  const [openFolio, setOpenFolio] = useState(false);
  const [openTipo, setOpenTipo] = useState(false);

  // ================= PAGINADO PRO =================
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [goTo, setGoTo] = useState("");
  const [filtros, setFiltros] = useState({});

  const [openCrear, setOpenCrear] = useState(false);
  const [openEditar, setOpenEditar] = useState(false);
  const [rowEditar, setRowEditar] = useState(null);

  const limpiarFiltros = () => {
    setFiltros({});
    setFiltered(articulos || []);
    setCurrentPage(1);
    setGoTo("");
  };

  const [colWidths, setColWidths] = useState(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  });
  const resizingRef = useRef(null);

  const startResize = (e, colKey) => {
    e.preventDefault();
    e.stopPropagation();

    const startX = e.clientX;
    const startWidth = colWidths[colKey] || 160;

    resizingRef.current = {
      colKey,
      startX,
      startWidth,
    };

    const onMouseMove = (ev) => {
      if (!resizingRef.current) return;

      const diff = ev.clientX - resizingRef.current.startX;
      const newWidth = Math.max(20, resizingRef.current.startWidth + diff);

      setColWidths((prev) => ({
        ...prev,
        [colKey]: newWidth,
      }));
    };

    const onMouseUp = () => {
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
      resizingRef.current = null;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };

    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";

    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
  };

  // ✅ clasificaciones activas (definen columnas dinámicas)
  const [clasifActivas, setClasifActivas] = useState([]); // [{id_clasificacion,nombre,...}]

  useEffect(() => {
    fetchArticulos();
    fetchClasifActivas();
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(colWidths));
    } catch (err) {
      console.error("No se pudo guardar el ancho de columnas:", err);
    }
  }, [colWidths]);

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

  useEffect(() => {
    setColWidths((prev) => {
      const next = { ...prev };

      columnas.forEach((col) => {
        if (next[col] == null) {
          if (String(col).toLowerCase() === "descripcion") {
            next[col] = 280;
          } else {
            next[col] = 160;
          }
        }
      });

      if (next["ACCIONES"] == null) {
        next["ACCIONES"] = 170;
      }

      Object.keys(next).forEach((k) => {
        if (![...columnas, "ACCIONES"].includes(k)) {
          delete next[k];
        }
      });

      return next;
    });
  }, [columnas]);

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
    const nuevosFiltros = { ...filtros, [key]: val };

    setFiltros(nuevosFiltros);

    setFiltered(
      (articulos || []).filter((a) => {
        return Object.keys(nuevosFiltros).every((k) => {
          const v = getCellValue(a, k);
          return String(v ?? "").toLowerCase().includes(nuevosFiltros[k]);
        });
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
      <div
        className="articulos-container"
        style={{
          width: "100%",
          maxWidth: "100%",
          minWidth: 0,
          margin: 0,
          boxSizing: "border-box",
          overflow: "hidden",
        }}
      >
      <h2 className="module-title">ARTÍCULOS</h2>
        <div>
          <button className="nuevo-btn" onClick={() => setOpenCrear(true)}>
            Crear nuevo artículo
          </button>

          <button className="nuevo-btn" onClick={limpiarFiltros}>
            Limpiar filtros
          </button>
        </div>

        <div style={{ marginBottom: 10 }}>

          <button className="nuevo-btn" onClick={() => setOpenProv(true)}>
            Administrar proveedores
          </button>

          <button className="nuevo-btn" onClick={() => setOpenFolio(true)}>
            Administrar folios
          </button>

          <button className="nuevo-btn" onClick={() => setOpenTipo(true)}>
            Administrar tipos
          </button>
        </div>

        <CatalogoModal
          isOpen={openProv}
          onClose={() => setOpenProv(false)}
          tipo="proveedores"
          titulo="Proveedores"
          singular="Proveedor"
          onSaved={() => {
            fetchArticulos();
          }}
        />

        <CatalogoModal
          isOpen={openFolio}
          onClose={() => setOpenFolio(false)}
          tipo="folios"
          titulo="Folios"
          singular="Folio"
          onSaved={() => {
            fetchArticulos();
          }}
        />

        <CatalogoModal
          isOpen={openTipo}
          onClose={() => setOpenTipo(false)}
          tipo="tipos"
          titulo="Tipos"
          singular="Tipo"
          onSaved={() => {
            fetchArticulos();
          }}
        />

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

      <div
        className="tabla-articulos-container"
        style={{
          width: "100%",
          maxWidth: "100%",
          minWidth: 0,
          overflowX: "auto",
          overflowY: "auto",
          boxSizing: "border-box",
        }}
      >
        <table
          className="tabla-articulos"
          style={{
            width: "max-content",
            minWidth: "100%",
            tableLayout: "fixed",
          }}
        >
          <colgroup>
            {columnas.map((col) => (
              <col key={col} style={{ width: `${colWidths[col] || 160}px` }} />
            ))}
            <col style={{ width: `${colWidths["ACCIONES"] || 170}px` }} />
          </colgroup>

          <thead>
            <tr>
              {columnas.map((col) => (
                <th
                  key={col}
                  style={{
                    position: "relative",
                    overflow: "hidden",
                    whiteSpace: "nowrap",
                    textOverflow: "ellipsis",
                    minWidth: 0,
                    width: `${colWidths[col] || 160}px`,
                    maxWidth: `${colWidths[col] || 160}px`,
                    boxSizing: "border-box",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      width: "100%",
                    }}
                  >
                    <span
                      style={{
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                        paddingRight: "10px",
                      }}
                      title={String(col).toUpperCase()}
                    >
                      {String(col).toUpperCase()}
                    </span>

                    <div
                      onMouseDown={(e) => startResize(e, col)}
                      style={{
                        position: "absolute",
                        top: 0,
                        right: 0,
                        width: "10px",
                        height: "100%",
                        cursor: "col-resize",
                        userSelect: "none",
                        zIndex: 2,
                      }}
                      title="Arrastrar para cambiar ancho"
                    />
                  </div>
                </th>
              ))}

              <th
                style={{
                  position: "relative",
                  overflow: "hidden",
                  whiteSpace: "nowrap",
                  textOverflow: "ellipsis",
                  minWidth: 0,
                  width: `${colWidths["ACCIONES"] || 170}px`,
                  maxWidth: `${colWidths["ACCIONES"] || 170}px`,
                  boxSizing: "border-box",
                }}
              >
                <span>ACCIONES</span>

                <div
                  onMouseDown={(e) => startResize(e, "ACCIONES")}
                  style={{
                    position: "absolute",
                    top: 0,
                    right: 0,
                    width: "10px",
                    height: "100%",
                    cursor: "col-resize",
                    userSelect: "none",
                    zIndex: 2,
                  }}
                  title="Arrastrar para cambiar ancho"
                />
              </th>
            </tr>

            <tr>
              {columnas.map((col) => (
                <th
                  key={col}
                  style={{
                    minWidth: 0,
                    width: `${colWidths[col] || 160}px`,
                    maxWidth: `${colWidths[col] || 160}px`,
                    boxSizing: "border-box",
                    overflow: "hidden",
                  }}
                >
                  <input
                    placeholder="Filtrar..."
                    value={filtros[col] ?? ""}
                    onChange={(e) => handleFilter(e, col)}
                    style={{
                      width: "100%",
                      maxWidth: "100%",
                      minWidth: 0,
                      boxSizing: "border-box",
                    }}
                  />
                </th>
              ))}
              <th
              style={{
                minWidth: 0,
                width: `${colWidths["ACCIONES"] || 170}px`,
                maxWidth: `${colWidths["ACCIONES"] || 170}px`,
                boxSizing: "border-box",
                overflow: "hidden",
              }}>
              </th>
            </tr>
          </thead>

          <tbody>
            {paginated.map((a, i) => (
              <tr key={a?.id_articulo ?? i}>
                {columnas.map((k) => (
                  <td
                    key={k}
                    title={String(getCellValue(a, k) ?? "")}
                    style={{
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                      minWidth: 0,
                      width: `${colWidths[k] || 160}px`,
                      maxWidth: `${colWidths[k] || 160}px`,
                      boxSizing: "border-box",
                    }}
                  >
                    {String(getCellValue(a, k) ?? "")}
                  </td>
                ))}

                <td
                  style={{
                    whiteSpace: "nowrap",
                    minWidth: 0,
                    width: `${colWidths["ACCIONES"] || 170}px`,
                    maxWidth: `${colWidths["ACCIONES"] || 170}px`,
                    overflow: "hidden",
                    boxSizing: "border-box",
                  }}
                >
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