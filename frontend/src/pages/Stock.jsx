import React, { useEffect, useMemo, useState } from "react";
import api from "../api/axiosConfig";
import * as XLSX from "xlsx";
import "./../styles/stock.css";

function Stock() {
  const [stock, setStock] = useState([]);
  const [filtered, setFiltered] = useState([]);

  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [goTo, setGoTo] = useState("");

  // =========================
  // MODAL CREAR DEPÓSITO
  // =========================
  const [mostrarModal, setMostrarModal] = useState(false);
  const [nuevoDeposito, setNuevoDeposito] = useState("");

  // =========================
  // MODAL CREAR UBICACIÓN
  // =========================
  const [mostrarModalUbic, setMostrarModalUbic] = useState(false);
  const [depositosList, setDepositosList] = useState([]);
  const [depSel, setDepSel] = useState(""); // id_deposito seleccionado
  const [nuevaUbic, setNuevaUbic] = useState(""); // nombre ubicación

  // =========================
  // PANEL LATERAL (detalle)
  // =========================
  const [panelOpen, setPanelOpen] = useState(false);
  const [panelCodigo, setPanelCodigo] = useState("");
  const [panelDesc, setPanelDesc] = useState("");
  const [panelData, setPanelData] = useState([]);
  const [panelLoading, setPanelLoading] = useState(false);
  const [panelError, setPanelError] = useState("");

  // cache por código para no pegarle siempre al backend
  const [detalleCache, setDetalleCache] = useState({}); // { [codigo]: rows[] }

  useEffect(() => {
    fetchStock();
  }, []);

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

  const handleFilter = (e, key) => {
    const value = String(e.target.value ?? "").toLowerCase();

    setFiltered(
      stock.filter((item) => {
        if (key === "cantidad_total") {
          return String(item.cantidad_total ?? 0)
            .toLowerCase()
            .includes(value);
        }
        if (key === "almacen") {
          const label = String(item.almacen_label ?? "").toLowerCase();
          return label.includes(value);
        }
        return String(item[key] ?? "").toLowerCase().includes(value);
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
      fetchStock();
    } catch (err) {
      alert("Error al crear el depósito.");
      console.error(err);
    }
  };

  // =========================
  // CREAR UBICACIÓN
  // =========================
  const cargarDepositos = async () => {
    const res = await api.get("/depositos");
    const arr = res.data || [];
    setDepositosList(arr);

    // Si no hay selección previa, seteo el primero
    if (arr.length && !depSel) setDepSel(String(arr[0].id_deposito));
  };

  const abrirModalUbic = async () => {
    try {
      await cargarDepositos();
      setNuevaUbic("");
      setMostrarModalUbic(true);
    } catch (err) {
      alert("No se pudieron cargar los depósitos.");
      console.error(err);
    }
  };

  const handleCrearUbicacion = async () => {
    const deposito_id = Number(depSel);
    const nombre = String(nuevaUbic || "").trim();

    if (!Number.isFinite(deposito_id) || deposito_id <= 0) {
      alert("Elegí un depósito válido.");
      return;
    }
    if (!nombre) {
      alert("El nombre de la ubicación no puede estar vacío.");
      return;
    }

    // Validación rápida en frontend (opcional): evitar duplicado por lista
    // (igual el backend lo vuelve a validar y devuelve 409)
    try {
      const resUb = await api.get("/ubicaciones", {
        params: { deposito_id },
      });
      const existe = (resUb.data || []).some(
        (u) =>
          String(u.nombre || "").trim().toLowerCase() ===
          nombre.toLowerCase()
      );
      if (existe) {
        alert("Esa ubicación ya existe dentro del depósito seleccionado.");
        return;
      }
    } catch {
      // si falla el GET, seguimos igual (el backend bloquea duplicados)
    }

    try {
      await api.post("/ubicaciones", { deposito_id, nombre });
      alert("Ubicación creada correctamente.");
      setMostrarModalUbic(false);
      setNuevaUbic("");

      // Si tenés panel abierto y querés ver cambios en el futuro,
      // esto no afecta cantidades, por eso no refresco stock.
      // Si preferís, podés dejarlo:
      // fetchStock();
    } catch (err) {
      if (err.response?.status === 409) {
        alert("Esa ubicación ya existe dentro del depósito seleccionado.");
        return;
      }
      alert("Error al crear la ubicación.");
      console.error(err);
    }
  };

  // =========================
  // EXPORTAR EXCEL
  // =========================
  // =========================
// EXPORTAR EXCEL (dinámico por depósitos)
// =========================
const exportarExcel = () => {
  // depósitos existentes según lo que haya en la grilla filtrada
  const almacenes = Array.from(
    new Set(
      (filtered || []).flatMap((it) =>
        (it.depositos || []).map((d) => String(d.almacen || "").trim()).filter(Boolean)
      )
    )
  ).sort((a, b) => a.localeCompare(b));

  const headers = [
    "Código",
    "Descripción",
    "Folio",
    "Proveedor",
    "Punto Ped",
    "Tipo",
    "Cant. Total",
    ...almacenes.flatMap((alm) => [`Cant. ${alm}`, `Ubicaciones ${alm}`]),
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
      it.punto_pedido ?? "",
      it.tipo ?? "",
      Number(it.cantidad_total ?? 0),
    ];

    almacenes.forEach((alm) => {
      const d = depMap.get(alm);
      row.push(d ? Number(d.cantidad ?? 0) : 0);
      row.push(d ? String(d.ubicaciones ?? "") : "");
    });

    aoa.push(row);
  });

  const ws = XLSX.utils.aoa_to_sheet(aoa);

  // (Opcional) ancho de columnas razonable
  ws["!cols"] = headers.map((h) => ({ wch: Math.min(Math.max(h.length + 2, 12), 40) }));

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
  // Accordion: agrupa panelData por depósito (almacen)
  // =========================
  const agrupado = useMemo(() => {
    const map = new Map();
    for (const r of panelData || []) {
      const almacen = r.almacen || "SIN ALMACEN";
      if (!map.has(almacen)) map.set(almacen, []);
      map.get(almacen).push({
        ubicacion: r.ubicacion || "GENERAL",
        cantidad: Number(r.cantidad || 0),
      });
    }

    const out = [];
    for (const [almacen, items] of map.entries()) {
      items.sort((a, b) =>
        String(a.ubicacion).localeCompare(String(b.ubicacion))
      );
      const total = items.reduce(
        (acc, it) => acc + (Number(it.cantidad) || 0),
        0
      );
      out.push({ almacen, total, items });
    }

    out.sort((a, b) => String(a.almacen).localeCompare(String(b.almacen)));
    return out;
  }, [panelData]);

  const [openAcc, setOpenAcc] = useState({}); // { [almacen]: true/false }

  useEffect(() => {
    setOpenAcc({});
  }, [panelCodigo]);

  const toggleAcc = (almacen) => {
    setOpenAcc((prev) => ({ ...prev, [almacen]: !prev[almacen] }));
  };

  return (
    <div className="stock-container">
      <h2 className="module-title">Stock en Depósitos</h2>

      <div className="acciones">
        <button onClick={() => setMostrarModal(true)}>Crear depósito</button>
        <button onClick={abrirModalUbic}>Crear ubicación</button>
        <button onClick={exportarExcel}>Exportar a Excel</button>
      </div>

      {/* =========================
          MODAL CREAR DEPÓSITO
         ========================= */}
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

      {/* =========================
          MODAL CREAR UBICACIÓN
         ========================= */}
      {mostrarModalUbic && (
        <div className="modal">
          <div className="modal-content">
            <h3>Crear Ubicación</h3>

            <label style={{ display: "block", marginBottom: 6 }}>
              Almacén:
            </label>
            <select
              value={depSel}
              onChange={(e) => setDepSel(e.target.value)}
              style={{ width: "100%", marginBottom: 10 }}
            >
              {depositosList.map((d) => (
                <option key={d.id_deposito} value={d.id_deposito}>
                  {d.nombre}
                </option>
              ))}
            </select>

            <label style={{ display: "block", marginBottom: 6 }}>
              Nombre de la ubicación:
            </label>
            <input
              type="text"
              placeholder="Ej: A - 12"
              value={nuevaUbic}
              onChange={(e) => setNuevaUbic(e.target.value)}
            />

            <div className="modal-botones">
              <button onClick={handleCrearUbicacion}>Confirmar</button>
              <button onClick={() => setMostrarModalUbic(false)}>
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="tabla-stock-container">
        <table className="tabla-stock">
          <thead>
            <tr>
              <th>
                Código
                <br />
                <input onChange={(e) => handleFilter(e, "codigo")} />
              </th>
              <th>
                Descripción
                <br />
                <input onChange={(e) => handleFilter(e, "descripcion")} />
              </th>
              <th>
                Folio
                <br />
                <input onChange={(e) => handleFilter(e, "folio")} />
              </th>
              <th>
                Proveedor
                <br />
                <input onChange={(e) => handleFilter(e, "proveedor")} />
              </th>
              <th>
                Cantidad
                <br />
                <input onChange={(e) => handleFilter(e, "cantidad_total")} />
              </th>
              <th>
                Punto ped
                <br />
                <input onChange={(e) => handleFilter(e, "punto_pedido")} />
              </th>
              <th>
                Tipo
                <br />
                <input onChange={(e) => handleFilter(e, "tipo")} />
              </th>
              <th>
                Almacén
                <br />
                <input onChange={(e) => handleFilter(e, "almacen")} />
              </th>
            </tr>
          </thead>

          <tbody>
            {paginated.map((item) => {
              const codKey = String(item.codigo || "").trim().toUpperCase();
              return (
                <tr key={codKey}>
                  <td>{item.codigo}</td>
                  <td>{item.descripcion}</td>
                  <td>{item.folio}</td>
                  <td>{item.proveedor}</td>
                  <td className="num">{item.cantidad_total ?? 0}</td>
                  <td className="num">{item.punto_pedido ?? ""}</td>
                  <td>{item.tipo ?? ""}</td>

                  {/* ✅ Solo texto + triangulito (▶). Nada de dropdown. */}
                  <td className="almacen-cell">
                    <span title={item.almacen_label || ""}>
                      {item.almacen_label || ""}
                    </span>
                    <button
                      className="btn-detalle-stock"
                      title="Ver depósitos y ubicaciones"
                      onClick={() => abrirDetalle(item.codigo, item.descripcion)}
                    >
                      ▶
                    </button>
                  </td>
                </tr>
              );
            })}
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

      {/* =========================
          PANEL LATERAL
         ========================= */}
      {panelOpen && (
        <>
          <div className="stock-panel-overlay" onClick={cerrarPanel} />

          <div className="stock-panel">
            <div className="stock-panel-header">
              <div>
                <div className="stock-panel-title">Depósitos / Ubicaciones</div>
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
            {panelError && (
              <div className="stock-panel-error">{panelError}</div>
            )}

            {!panelLoading && !panelError && (
              <div className="stock-panel-body">
                {agrupado.length === 0 ? (
                  <div className="stock-panel-info">Sin detalle para mostrar.</div>
                ) : (
                  <div className="stock-acc">
                    <div className="stock-acc-head">
                      <div>Depósito</div>
                      <div className="num">Total</div>
                    </div>

                    {agrupado.map((dep) => {
                      const abierto = !!openAcc[dep.almacen];
                      return (
                        <div key={dep.almacen} className="stock-acc-item">
                          <button
                            className={`stock-acc-row ${abierto ? "open" : ""}`}
                            onClick={() => toggleAcc(dep.almacen)}
                          >
                            <div className="stock-acc-left">
                              <span className="caret">
                                {abierto ? "▼" : "▶"}
                              </span>
                              <span className="label">{dep.almacen}</span>
                            </div>
                            <div className="num">{dep.total}</div>
                          </button>

                          {abierto && (
                            <div className="stock-acc-detail">
                              <div className="stock-acc-detail-head">
                                <div>Ubicación</div>
                                <div className="num">Cantidad</div>
                              </div>
                              {dep.items.map((u, i) => (
                                <div key={i} className="stock-acc-detail-row">
                                  <div>{u.ubicacion}</div>
                                  <div className="num">{u.cantidad}</div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
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
