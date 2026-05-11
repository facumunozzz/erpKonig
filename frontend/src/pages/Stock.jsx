import React, { useEffect, useMemo, useRef, useState } from "react";
import api from "../api/axiosConfig";
import * as XLSX from "xlsx";
import "./../styles/stock.css";

const normalizeHeader = (txt) => {
  const clean = String(txt || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[.,/]/g, "")
    .trim();

  const parts = clean.split(/\s+/);
  return parts
    .map((p, i) =>
      i === 0
        ? p.toLowerCase()
        : p.charAt(0).toUpperCase() + p.slice(1).toLowerCase()
    )
    .join("");
};

const STOCK_WIDTHS_KEY = "stock_col_widths_v1";

const STOCK_COLS = [
  "codigo",
  "descripcion",
  "folio",
  "proveedor",
  "almacen",
  "ubicacion",
  "cantidad_total",
  "punto_pedido",
  "tipo",
  "categoriaRecuento",
  "proximaFechaRecuento",
  "recuentoSiNo",
];

const STOCK_HEADERS = [
  ["codigo", "Código"],
  ["descripcion", "Descripción"],
  ["folio", "Folio"],
  ["proveedor", "Proveedor"],
  ["almacen", "Almacén"],
  ["ubicacion", "Ubicación"],
  ["cantidad_total", "Cantidad"],
  ["punto_pedido", "Punto ped"],
  ["tipo", "Tipo"],
  ["categoriaRecuento", "Categoria recuento"],
  ["proximaFechaRecuento", "Proxima fecha recuento"],
  ["recuentoSiNo", "Recuento"],
];

function Stock() {
  const [stock, setStock] = useState([]);
  const [filtered, setFiltered] = useState([]);

  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [goTo, setGoTo] = useState("");

  const [filtros, setFiltros] = useState({
    codigo: "",
    descripcion: "",
    folio: "",
    proveedor: "",
    almacen: "",
    ubicacion: "",
    cantidad_total: "",
    punto_pedido: "",
    tipo: "",
    categoriaRecuento: "",
    proximaFechaRecuento: "",
    recuentoSiNo: "",
  });

  const [colWidths, setColWidths] = useState(() => {
    try {
      const saved = localStorage.getItem(STOCK_WIDTHS_KEY);
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  });

  const resizingRef = useRef(null);

  // =========================
  // MODAL CREAR DEPÓSITO
  // =========================
  const [mostrarModal, setMostrarModal] = useState(false);
  const [nuevoDeposito, setNuevoDeposito] = useState("");

  // =========================
  // MODAL VER DEPÓSITOS
  // =========================
  const [modalVerDepositos, setModalVerDepositos] = useState(false);
  const [depositosVer, setDepositosVer] = useState([]);
  const [depEditId, setDepEditId] = useState(null);
  const [depEditNombre, setDepEditNombre] = useState("");

  // =========================
  // PANEL LATERAL (detalle)
  // =========================
  const [panelOpen, setPanelOpen] = useState(false);
  const [panelCodigo, setPanelCodigo] = useState("");
  const [panelDesc, setPanelDesc] = useState("");
  const [panelData, setPanelData] = useState([]);
  const [panelLoading, setPanelLoading] = useState(false);
  const [panelError, setPanelError] = useState("");

  // cache por código
  const [detalleCache, setDetalleCache] = useState({});
  const [savingUbicacionId, setSavingUbicacionId] = useState(null);

  useEffect(() => {
    fetchStock();
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(STOCK_WIDTHS_KEY, JSON.stringify(colWidths));
    } catch (err) {
      console.error("No se pudo guardar el ancho de columnas de stock:", err);
    }
  }, [colWidths]);

  useEffect(() => {
    setColWidths((prev) => {
      const next = { ...prev };

      STOCK_COLS.forEach((col) => {
        if (next[col] == null) {
          if (col === "descripcion") next[col] = 260;
          else if (col === "almacen") next[col] = 220;
          else next[col] = 140;
        }
      });

      Object.keys(next).forEach((k) => {
        if (!STOCK_COLS.includes(k)) delete next[k];
      });

      return next;
    });
  }, []);

  const startResize = (e, colKey) => {
    e.preventDefault();
    e.stopPropagation();

    const startX = e.clientX;
    const startWidth = colWidths[colKey] || 140;

    resizingRef.current = {
      colKey,
      startX,
      startWidth,
    };

    const onMouseMove = (ev) => {
      if (!resizingRef.current) return;

      const diff = ev.clientX - resizingRef.current.startX;
      const newWidth = Math.max(40, resizingRef.current.startWidth + diff);

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

  const fetchStock = () => {
    api
      .get("/stock")
      .then((res) => {
        const rows = res.data || [];
        setStock(rows);
        setFiltered(rows);
      })
      .catch((err) => console.error(err));
  };

  const refreshAll = async () => {
    fetchStock();
    setDetalleCache({});
  };

  const handleFilter = (e, key) => {
    const value = String(e.target.value ?? "").toLowerCase();
    const nuevosFiltros = { ...filtros, [key]: value };

    setFiltros(nuevosFiltros);

    setFiltered(
      stock.filter((item) => {
        const valores = {
          codigo: String(item.codigo ?? ""),
          descripcion: String(item.descripcion ?? ""),
          folio: String(item.folio ?? ""),
          proveedor: String(item.proveedor ?? ""),
          ubicacion: String(item.ubicacion ?? ""),
          cantidad_total: String(item.cantidad_total ?? 0),
          punto_pedido: String(item.punto_pedido ?? ""),
          tipo: String(item.tipo ?? ""),
          categoriaRecuento: String(item.categoriaRecuento ?? ""),
          proximaFechaRecuento: item.proximaFechaRecuento
            ? String(item.proximaFechaRecuento)
            : "",
          recuentoSiNo: String(item.recuentoSiNo ?? ""),
          almacen: String(item.almacen_label ?? ""),
        };

        return Object.keys(nuevosFiltros).every((k) =>
          valores[k].toLowerCase().includes(nuevosFiltros[k])
        );
      })
    );

    setCurrentPage(1);
  };

  const limpiarFiltros = () => {
    const vacios = {
      codigo: "",
      descripcion: "",
      folio: "",
      proveedor: "",
      ubicacion: "",
      cantidad_total: "",
      punto_pedido: "",
      tipo: "",
      categoriaRecuento: "",
      proximaFechaRecuento: "",
      recuentoSiNo: "",
      almacen: "",
    };

    setFiltros(vacios);
    setFiltered(stock || []);
    setCurrentPage(1);
    setGoTo("");
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

  // =========================
  // CREAR DEPÓSITO
  // =========================
  const handleCrearDeposito = async () => {
    if (!nuevoDeposito.trim()) {
      alert("El nombre del depósito no puede estar vacío.");
      return;
    }

    try {
      const res = await api.get("/depositos");
      const existe = (res.data || []).some(
        (dep) =>
          dep.nombre.trim().toLowerCase() ===
          nuevoDeposito.trim().toLowerCase()
      );

      if (existe) {
        alert("Ya existe un depósito con ese nombre.");
        return;
      }

      await api.post("/depositos", { nombre: nuevoDeposito.trim() });
      alert("Depósito creado correctamente.");
      setNuevoDeposito("");
      setMostrarModal(false);
      await refreshAll();
    } catch (err) {
      alert("Error al crear el depósito.");
      console.error(err);
    }
  };

  // =========================
  // VER DEPÓSITOS (modal)
  // =========================
  const abrirVerDepositos = async () => {
    try {
      const r = await api.get("/depositos");
      setDepositosVer(r.data || []);
      setDepEditId(null);
      setDepEditNombre("");
      setModalVerDepositos(true);
    } catch (e) {
      alert("No se pudieron cargar los depósitos.");
      console.error(e);
    }
  };

  const iniciarEditarDeposito = (dep) => {
    setDepEditId(dep.id_deposito);
    setDepEditNombre(dep.nombre || "");
  };

  const cancelarEditarDeposito = () => {
    setDepEditId(null);
    setDepEditNombre("");
  };

  const guardarDeposito = async (id) => {
    const nombre = String(depEditNombre || "").trim();
    if (!nombre) return alert("El nombre no puede estar vacío.");

    try {
      await api.put(`/depositos/${id}`, { nombre });
      const r = await api.get("/depositos");
      setDepositosVer(r.data || []);
      cancelarEditarDeposito();
      await refreshAll();
    } catch (e) {
      if (e.response?.status === 409)
        return alert(e.response.data?.error || "Nombre duplicado.");
      alert("Error al editar depósito.");
      console.error(e);
    }
  };

  const eliminarDeposito = async (dep) => {
    const ok = window.confirm(
      `Vas a eliminar el depósito "${dep.nombre}".\n\nATENCIÓN: se borrará TODO el stock dentro de ese depósito (incluyendo ubicaciones).\n\n¿Seguro que querés continuar?`
    );
    if (!ok) return;

    try {
      await api.delete(`/depositos/${dep.id_deposito}`, { timeout: 180000 });
      const r = await api.get("/depositos");
      setDepositosVer(r.data || []);
      await refreshAll();
    } catch (e) {
      alert("Error al eliminar depósito.");
      console.error(e);
    }
  };

  const actualizarUbicacionLocal = (idArticulo, value) => {
  setStock((prev) =>
    (prev || []).map((item) =>
      Number(item.id_articulo) === Number(idArticulo)
        ? { ...item, ubicacion: value }
        : item
    )
  );

  setFiltered((prev) =>
    (prev || []).map((item) =>
      Number(item.id_articulo) === Number(idArticulo)
        ? { ...item, ubicacion: value }
        : item
    )
  );
};

const guardarUbicacion = async (item) => {
  try {
    const idArticulo = item?.id_articulo;

    if (!idArticulo) {
      alert("No se encontró el ID del artículo para guardar la ubicación.");
      return;
    }

    setSavingUbicacionId(idArticulo);

    await api.patch(`/articulos/${idArticulo}/ubicacion`, {
      ubicacion: item.ubicacion ?? "",
    });
  } catch (err) {
    console.error("Error guardando ubicación:", err);

    alert(
      err.response?.data?.error ||
        err.response?.data?.detalle ||
        "No se pudo guardar la ubicación."
    );

    await refreshAll();
  } finally {
    setSavingUbicacionId(null);
  }
};

const handleUbicacionKeyDown = (e, item) => {
  if (e.key === "Enter") {
    e.preventDefault();
    e.currentTarget.blur();
  }

  if (e.key === "Escape") {
    e.preventDefault();
    refreshAll();
  }
};

  // =========================
  // EXPORTAR EXCEL (dinámico por depósitos)
  // =========================
  const exportarExcel = () => {
    const almacenes = Array.from(
      new Set(
        (filtered || []).flatMap((it) =>
          (it.depositos || [])
            .map((d) => String(d.almacen || "").trim())
            .filter(Boolean)
        )
      )
    ).sort((a, b) => a.localeCompare(b));

    const headers = [
      normalizeHeader("Código"),
      normalizeHeader("Descripción"),
      normalizeHeader("Folio"),
      normalizeHeader("Proveedor"),
      normalizeHeader("Ubicación"),
      normalizeHeader("Punto ped"),
      normalizeHeader("Tipo"),
      normalizeHeader("Categoría recuento"),
      normalizeHeader("Próxima fecha recuento"),
      normalizeHeader("Recuento SI/NO"),
      normalizeHeader("Cant. Total"),
      ...almacenes.flatMap((alm) => [
        normalizeHeader(`Cant ${alm}`),
        normalizeHeader(`Ubicaciones ${alm}`),
      ]),
    ];

    const aoa = [headers];

    (filtered || []).forEach((it) => {
      const depMap = new Map(
        (it.depositos || []).map((d) => [String(d.almacen || "").trim(), d])
      );

      const row = [
        it.codigo ?? "",
        it.descripcion ?? "",
        it.folio ?? "",
        it.proveedor ?? "",
        it.ubicacion ?? "",
        it.punto_pedido ?? "",
        it.tipo ?? "",
        it.categoriaRecuento ?? "",
        it.proximaFechaRecuento ?? "",
        it.recuentoSiNo ?? "",
        Number(it.cantidad_total ?? 0),
      ];

      almacenes.forEach((alm) => {
        const d = depMap.get(alm);
        row.push(d ? Number(d.cantidad ?? 0) : 0);
      });

      aoa.push(row);
    });

    const ws = XLSX.utils.aoa_to_sheet(aoa);
    ws["!cols"] = headers.map((h) => ({
      wch: Math.min(Math.max(h.length + 2, 12), 40),
    }));

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Stock");
    XLSX.writeFile(wb, "stock.xlsx");
  };

  // =========================
  // Abrir panel detalle (▶)
  // =========================
  const abrirDetalle = async (codigo, descripcion) => {
    const c = String(codigo ?? "").trim().toUpperCase();
    if (!c) return;

    setPanelOpen(true);
    setPanelCodigo(c);
    setPanelDesc(descripcion || "");
    setPanelError("");

    if (detalleCache[c]) {
      setPanelData(detalleCache[c]);
      return;
    }

    try {
      setPanelLoading(true);
      const res = await api.get(`/stock/detalle`, { params: { codigo: c } });
      const rows = res.data || [];
      setPanelData(rows);
      setDetalleCache((prev) => ({ ...prev, [c]: rows }));
    } catch (err) {
      const msg =
        err.response?.data?.error ||
        err.response?.data?.detalle ||
        err.message ||
        "Error al traer detalle";
      setPanelError(msg);
      setPanelData([]);
    } finally {
      setPanelLoading(false);
    }
  };

  const cerrarPanel = () => {
    setPanelOpen(false);
    setPanelCodigo("");
    setPanelDesc("");
    setPanelData([]);
    setPanelError("");
    setPanelLoading(false);
  };

// =========================
// Panel: agrupa solo por depósito
// =========================
const agrupado = useMemo(() => {
  const map = new Map();

  for (const r of panelData || []) {
    const almacen = r.almacen || "SIN ALMACEN";

    if (!map.has(almacen)) {
      map.set(almacen, {
        id_deposito: r.id_deposito,
        almacen,
        total: 0,
      });
    }

    map.get(almacen).total += Number(r.cantidad || 0);
  }

  const out = Array.from(map.values());

  out.sort((a, b) => String(a.almacen).localeCompare(String(b.almacen)));

  return out;
}, [panelData]);

  return (
    <div
      className="stock-container"
      style={{
        width: "100%",
        maxWidth: "100%",
        minWidth: 0,
        boxSizing: "border-box",
        overflow: "hidden",
      }}
    >
      <h2 className="module-title">Stock en Depósitos</h2>

      <div className="acciones">
        <button onClick={() => setMostrarModal(true)}>Crear depósito</button>
        <button onClick={abrirVerDepositos}>Ver depósitos</button>
        <button onClick={exportarExcel}>Exportar a Excel</button>
        <button onClick={limpiarFiltros}>Limpiar filtros</button>
      </div>

      {mostrarModal && (
        <div className="modal">
          <div className="modal-content">
            <h3>Nuevo Depósito</h3>
            <input
              type="text"
              placeholder="Nombre del depósito"
              value={nuevoDeposito}
              onChange={(e) => setNuevoDeposito(e.target.value)}
            />
            <div className="modal-botones">
              <button onClick={handleCrearDeposito}>Crear</button>
              <button onClick={() => setMostrarModal(false)}>Cancelar</button>
            </div>
          </div>
        </div>
      )}

      {modalVerDepositos && (
        <div className="modal">
          <div className="modal-content modal-wide">
            <h3>VER DEPÓSITOS</h3>

            <div className="modal-scroll">
              <table className="mini-table">
                <tbody>
                  {depositosVer.map((dep) => (
                    <tr key={dep.id_deposito}>
                      <td className="mini-name">
                        {depEditId === dep.id_deposito ? (
                          <input
                            value={depEditNombre}
                            onChange={(e) => setDepEditNombre(e.target.value)}
                            className="mini-input"
                            autoFocus
                          />
                        ) : (
                          dep.nombre
                        )}
                      </td>

                      <td className="mini-actions">
                        {depEditId === dep.id_deposito ? (
                          <>
                            <button
                              className="btn-edit"
                              onClick={() => guardarDeposito(dep.id_deposito)}
                            >
                              Guardar
                            </button>
                            <button
                              className="btn-cancel"
                              onClick={cancelarEditarDeposito}
                            >
                              Cancelar
                            </button>
                          </>
                        ) : (
                          <>
                            <button
                              className="btn-edit"
                              onClick={() => iniciarEditarDeposito(dep)}
                            >
                              Editar
                            </button>
                            <button
                              className="btn-del"
                              onClick={() => eliminarDeposito(dep)}
                            >
                              Eliminar
                            </button>
                          </>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="modal-footer">
              <button onClick={() => setModalVerDepositos(false)}>Cerrar</button>
            </div>
          </div>
        </div>
      )}

      <div
        className="tabla-stock-container"
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
          className="tabla-stock"
          style={{
            width: "max-content",
            minWidth: "100%",
            tableLayout: "fixed",
          }}
        >
          <colgroup>
            {STOCK_COLS.map((col) => (
              <col key={col} style={{ width: `${colWidths[col] || 140}px` }} />
            ))}
          </colgroup>

          <thead>
            <tr>
              {STOCK_HEADERS.map(([key, label]) => (
                <th
                  key={key}
                  style={{
                    position: "relative",
                    overflow: "hidden",
                    whiteSpace: "nowrap",
                    textOverflow: "ellipsis",
                    minWidth: 0,
                    width: `${colWidths[key] || 140}px`,
                    maxWidth: `${colWidths[key] || 140}px`,
                    boxSizing: "border-box",
                  }}
                >
                  <div style={{ paddingRight: "10px" }}>
                    {label}
                    <br />
                    <input
                      value={filtros[key] ?? ""}
                      onChange={(e) => handleFilter(e, key)}
                      style={{
                        width: "100%",
                        maxWidth: "100%",
                        minWidth: 0,
                        boxSizing: "border-box",
                      }}
                    />
                  </div>

                  <div
                    onMouseDown={(e) => startResize(e, key)}
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
              ))}
            </tr>
          </thead>

          <tbody>
  {paginated.map((item) => {
    const codKey = String(item.codigo || "").trim().toUpperCase();

    return (
      <tr key={item.id_articulo ?? codKey}>
        {STOCK_COLS.map((key) => {
          const width = colWidths[key] || (key === "descripcion" ? 260 : key === "almacen" ? 220 : 140);

          if (key === "ubicacion") {
            return (
              <td
                key={key}
                style={{
                  minWidth: 0,
                  width: `${width}px`,
                  maxWidth: `${width}px`,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                  boxSizing: "border-box",
                }}
              >
                <input
                  value={item.ubicacion ?? ""}
                  disabled={savingUbicacionId === item.id_articulo}
                  onChange={(e) =>
                    actualizarUbicacionLocal(item.id_articulo, e.target.value)
                  }
                  onBlur={() => guardarUbicacion(item)}
                  onKeyDown={(e) => handleUbicacionKeyDown(e, item)}
                  placeholder="Ubicación"
                  style={{
                    width: "100%",
                    height: "28px",
                    boxSizing: "border-box",
                    border: "1px solid #d0d7de",
                    borderRadius: "6px",
                    padding: "3px 6px",
                    fontSize: "13px",
                    background:
                      savingUbicacionId === item.id_articulo
                        ? "#f3f4f6"
                        : "white",
                  }}
                />
              </td>
            );
          }

          if (key === "almacen") {
            return (
              <td
                key={key}
                className="almacen-cell"
                style={{
                  minWidth: 0,
                  width: `${width}px`,
                  maxWidth: `${width}px`,
                  overflow: "hidden",
                  boxSizing: "border-box",
                }}
              >
                <span title={item.almacen_label || ""}>
                  {item.almacen_label || ""}
                </span>

                <button
                  className="btn-detalle-stock"
                  title="Ver depósitos"
                  onClick={() => abrirDetalle(item.codigo, item.descripcion)}
                >
                  ▶
                </button>
              </td>
            );
          }

          const value =
            key === "cantidad_total"
              ? item.cantidad_total ?? 0
              : item[key] ?? "";

          return (
            <td
              key={key}
              className={key === "cantidad_total" || key === "punto_pedido" ? "num" : ""}
              style={{
                minWidth: 0,
                width: `${width}px`,
                maxWidth: `${width}px`,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
                boxSizing: "border-box",
              }}
              title={String(value ?? "")}
            >
              {value}
            </td>
          );
        })}
      </tr>
    );
  })}
</tbody>
        </table>
      </div>

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

          {pageButtons.map((p, i) =>
            p === "…" ? (
              <span key={i} className="pg-dots">
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

      {panelOpen && (
  <>
    <div className="stock-panel-overlay" onClick={cerrarPanel} />

    <div className="stock-panel" style={{width: "400px", maxWidth: "95vw"}}>
      <div className="stock-panel-header">
        <div>
          <div className="stock-panel-title">Depósitos</div>
          <div className="stock-panel-sub">
            <b>{panelCodigo}</b>
            {panelDesc ? ` — ${panelDesc}` : ""}
          </div>
        </div>

        <button className="stock-panel-close" onClick={cerrarPanel}>
          ✕
        </button>
      </div>

      {panelLoading && <div className="stock-panel-info">Cargando…</div>}

      {panelError && <div className="stock-panel-error">{panelError}</div>}

      {!panelLoading && !panelError && (
        <div className="stock-panel-body">
          {agrupado.length === 0 ? (
            <div className="stock-panel-info">Sin depósitos para mostrar.</div>
          ) : (
            <div className="stock-acc">
              <div
  className="stock-acc-head"
  style={{
    display: "grid",
    gridTemplateColumns: "1fr 90px",
    gap: "12px",
    alignItems: "center",
    width: "100%",
    boxSizing: "border-box",
  }}
>
  <div>Depósito</div>
  <div
    className="num"
    style={{
      textAlign: "right",
      paddingRight: "8px",
      boxSizing: "border-box",
    }}
  >
    Total
  </div>
</div>

{agrupado.map((dep) => (
  <div
    key={dep.id_deposito ?? dep.almacen}
    className="stock-acc-item"
    style={{
      width: "100%",
      boxSizing: "border-box",
    }}
  >
    <div
      className="stock-acc-row open"
      style={{
        display: "grid",
        gridTemplateColumns: "1fr 90px",
        gap: "12px",
        alignItems: "center",
        width: "100%",
        boxSizing: "border-box",
      }}
    >
      <div
        className="stock-acc-left"
        style={{
          overflow: "hidden",
          whiteSpace: "nowrap",
          textOverflow: "ellipsis",
        }}
      >
        <span className="label">{dep.almacen}</span>
      </div>

      <div
        className="num"
        style={{
          textAlign: "right",
          paddingRight: "8px",
          minWidth: "80px",
          overflow: "visible",
          boxSizing: "border-box",
        }}
      >
        {Number(dep.total || 0).toLocaleString("es-AR")}
      </div>
    </div>
  </div>
))}
            </div>
          )}
        </div>
      )}
    </div>
  </>
)}
    </div>
  );
}

export default Stock;