import React, { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import * as XLSX from "xlsx";
import api from "../api/axiosConfig";
import { useAuth } from "../context/AuthContext";
import ServerExcelFilterButton from "../components/ServerExcelFilterButton";
import "./../styles/transferencias.css";

const STORAGE_KEY_REMITOS = "remitos_filtros_v1";

const DEFAULT_SERVER_FILTERS = {};

const DEFAULT_SORT_STATE = {
  key: "",
  dir: "",
};

function cargarPreferenciasRemitos() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_REMITOS);

    if (!raw) {
      return {
        serverFilters: DEFAULT_SERVER_FILTERS,
        sortState: DEFAULT_SORT_STATE,
        pageSize: 25,
      };
    }

    const parsed = JSON.parse(raw);

    return {
      serverFilters:
        parsed?.serverFilters && typeof parsed.serverFilters === "object"
          ? parsed.serverFilters
          : DEFAULT_SERVER_FILTERS,

      sortState:
        parsed?.sortState && typeof parsed.sortState === "object"
          ? parsed.sortState
          : DEFAULT_SORT_STATE,

      pageSize: Number(parsed?.pageSize) || 25,
    };
  } catch {
    return {
      serverFilters: DEFAULT_SERVER_FILTERS,
      sortState: DEFAULT_SORT_STATE,
      pageSize: 25,
    };
  }
}

export default function Remitos() {
  const navigate = useNavigate();
  const fileInputRef = useRef(null);
  const { displayName } = useAuth();

  const [remitos, setRemitos] = useState([]);
  const [importando, setImportando] = useState(false);
  const [loading, setLoading] = useState(false);

  const preferenciasIniciales = useMemo(() => cargarPreferenciasRemitos(), []);

  const [serverFilters, setServerFilters] = useState(
    preferenciasIniciales.serverFilters
  );

  const [sortState, setSortState] = useState(preferenciasIniciales.sortState);

  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(preferenciasIniciales.pageSize);
  const [gotoPage, setGotoPage] = useState("");

  const [totalRows, setTotalRows] = useState(0);
  const [serverTotalPages, setServerTotalPages] = useState(1);

  const tableWrapRef = useRef(null);
  const topScrollRef = useRef(null);
  const topScrollInnerRef = useRef(null);
  const tableRef = useRef(null);

  const columnas = useMemo(
    () => [
      {
        key: "numero_transaccion",
        label: "ID",
      },
      {
        key: "fecha",
        label: "Fecha",
      },
      {
        key: "deposito",
        label: "Depósito",
      },
      {
        key: "tipo",
        label: "Tipo",
      },
      {
        key: "numero_remito",
        label: "Nro remito",
      },
      {
        key: "nro_entrega",
        label: "N° Entrega",
      },
      {
        key: "pedido",
        label: "Pedido",
      },
      {
        key: "proveedor",
        label: "Proveedor",
      },
      {
        key: "usuario",
        label: "Usuario",
      },
    ],
    []
  );

  const formatFecha = (value) => {
    if (!value) return "";

    const d = new Date(value);

    if (Number.isNaN(d.getTime())) return "";

    return d.toLocaleString("es-AR");
  };

  const fetchRemitos = async () => {
    try {
      setLoading(true);

      const res = await api.get("/remitos", {
        params: {
          page: currentPage,
          pageSize,
          filters: JSON.stringify(serverFilters),
          sortKey: sortState.key || "",
          sortDir: sortState.dir || "",
        },
        timeout: 120000,
      });

      const payload = res.data || {};

      const data = Array.isArray(payload.data)
        ? payload.data
        : Array.isArray(payload)
          ? payload
          : [];

      setRemitos(data);
      setTotalRows(Number(payload.total || data.length || 0));
      setServerTotalPages(Number(payload.totalPages || 1));
    } catch (err) {
      console.error("Error cargando remitos:", err);

      setRemitos([]);
      setTotalRows(0);
      setServerTotalPages(1);

      alert(
        err.response?.data?.error ||
          err.response?.data?.detalle ||
          "Error cargando remitos."
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    try {
      localStorage.setItem(
        STORAGE_KEY_REMITOS,
        JSON.stringify({
          serverFilters,
          sortState,
          pageSize,
        })
      );
    } catch (err) {
      console.error("No se pudieron guardar los filtros de remitos:", err);
    }
  }, [serverFilters, sortState, pageSize]);

  useEffect(() => {
    fetchRemitos();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPage, pageSize, serverFilters, sortState]);

  const limpiarFiltros = () => {
    setServerFilters(DEFAULT_SERVER_FILTERS);
    setSortState(DEFAULT_SORT_STATE);
    setCurrentPage(1);
    setGotoPage("");

    try {
      localStorage.setItem(
        STORAGE_KEY_REMITOS,
        JSON.stringify({
          serverFilters: DEFAULT_SERVER_FILTERS,
          sortState: DEFAULT_SORT_STATE,
          pageSize,
        })
      );
    } catch (err) {
      console.error("No se pudieron limpiar los filtros guardados:", err);
    }
  };

  const handleClickImportar = () => {
    fileInputRef.current?.click();
  };

  const descargarPlanilla = () => {
    const encabezados = [
      "N° Remito",
      "N° Entrega",
      "Pedido",
      "Proveedor",
      "Artículo",
      "Cantidad",
    ];

    const data = [encabezados];

    const ws = XLSX.utils.aoa_to_sheet(data);

    ws["!cols"] = [
      { wch: 16 },
      { wch: 16 },
      { wch: 16 },
      { wch: 30 },
      { wch: 18 },
      { wch: 12 },
    ];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Remitos");

    XLSX.writeFile(wb, "Plantilla_Importacion_Remitos.xlsx");
  };

  const handleImportarArchivo = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";

    if (!file) return;

    try {
      setImportando(true);

      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: "array" });
      const sheetName = workbook.SheetNames[0];

      if (!sheetName) {
        alert("El archivo no tiene hojas.");
        return;
      }

      const sheet = workbook.Sheets[sheetName];

      const rows = XLSX.utils.sheet_to_json(sheet, {
        defval: "",
      });

      if (!rows.length) {
        alert("La planilla no tiene datos para importar.");
        return;
      }

      const confirmar = window.confirm(
        `Se van a importar ${rows.length} filas desde la hoja "${sheetName}".\n\n` +
          "Si algún artículo o proveedor no existe, no se importará nada.\n\n" +
          "¿Continuar?"
      );

      if (!confirmar) return;

      await api.post("/remitos/importar-planilla", {
        rows,
        usuario: displayName || null,
      });

      alert("Planilla importada correctamente.");
      setCurrentPage(1);
      fetchRemitos();
    } catch (err) {
      console.error(err);

      const data = err.response?.data;
      let msg = data?.error || data?.detalle || "Error al importar la planilla.";

      if (Array.isArray(data?.detalle)) {
        msg += "\n\n" + data.detalle.join("\n");
      } else if (data?.detalle) {
        msg += "\n\n" + String(data.detalle);
      }

      alert(msg);
    } finally {
      setImportando(false);
    }
  };

  const totalPages = serverTotalPages || 1;
  const paginated = remitos;

  const irPagina = (p) => {
    const n = Number(p);

    if (!Number.isFinite(n)) return;
    if (n < 1 || n > totalPages) return;

    setCurrentPage(n);
  };

  const from = totalRows === 0 ? 0 : (currentPage - 1) * pageSize + 1;
  const to = Math.min(currentPage * pageSize, totalRows);

  useEffect(() => {
    const wrap = tableWrapRef.current;
    const top = topScrollRef.current;
    const inner = topScrollInnerRef.current;
    const table = tableRef.current;

    if (!wrap || !top || !inner || !table) return;

    const syncWidth = () => {
      inner.style.width = `${table.scrollWidth}px`;
    };

    const syncFromTop = () => {
      wrap.scrollLeft = top.scrollLeft;
    };

    const syncFromTable = () => {
      top.scrollLeft = wrap.scrollLeft;
    };

    syncWidth();

    top.addEventListener("scroll", syncFromTop);
    wrap.addEventListener("scroll", syncFromTable);

    const ro = new ResizeObserver(syncWidth);
    ro.observe(table);

    window.addEventListener("resize", syncWidth);

    return () => {
      top.removeEventListener("scroll", syncFromTop);
      wrap.removeEventListener("scroll", syncFromTable);
      ro.disconnect();
      window.removeEventListener("resize", syncWidth);
    };
  }, [paginated]);

  return (
    <div className="transferencias-page">
      <h2 className="module-title">Remitos</h2>

      <div
        className="acciones"
        style={{
          marginBottom: 12,
          display: "flex",
          gap: 8,
          flexWrap: "wrap",
        }}
      >
        <button onClick={() => navigate("/remitos/nuevo")}>
          Ingreso manual
        </button>

        <button onClick={handleClickImportar} disabled={importando}>
          {importando ? "Importando..." : "Importar planilla"}
        </button>

        <input
          ref={fileInputRef}
          type="file"
          accept=".xlsx,.xls"
          style={{ display: "none" }}
          onChange={handleImportarArchivo}
        />

        <button onClick={descargarPlanilla}>Descargar planilla</button>

        <button onClick={limpiarFiltros}>Limpiar filtros</button>

        <button onClick={fetchRemitos}>↻ Actualizar</button>

        {loading && <span style={{ padding: "6px 10px" }}>Cargando...</span>}
      </div>

      <div className="tabla-scroll-top" ref={topScrollRef}>
        <div ref={topScrollInnerRef} />
      </div>

      <div
        className="tabla-articulos-container"
        ref={tableWrapRef}
        style={{
          overflowX: "hidden",
          overflowY: "auto",
        }}
      >
        <table ref={tableRef} className="tabla-transferencias">
          <thead>
            <tr>
              {columnas.map((col) => (
                <th key={col.key}>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: 6,
                    }}
                  >
                    <span>{col.label}</span>

                    <ServerExcelFilterButton
                      columnKey={col.key}
                      label={col.label}
                      filters={serverFilters}
                      setFilters={setServerFilters}
                      sortState={sortState}
                      setSortState={setSortState}
                      distinctEndpoint="/remitos/distinct"
                      onApply={() => {
                        setCurrentPage(1);
                      }}
                    />
                  </div>
                </th>
              ))}
            </tr>
          </thead>

          <tbody>
            {paginated.map((r, i) => {
              const id = r.numero_remito ?? r.id;

              return (
                <tr
                  key={id || i}
                  style={{ cursor: "pointer" }}
                  onClick={() => navigate(`/remitos/${id}`)}
                  title="Ver detalle"
                >
                  <td>{r.numero_transaccion ?? ""}</td>
                  <td>{formatFecha(r.fecha)}</td>
                  <td>{r.deposito ?? ""}</td>
                  <td>{r.tipo ?? ""}</td>
                  <td>{r.numero_remito ?? r.id ?? ""}</td>
                  <td>{r.nro_entrega ?? ""}</td>
                  <td>{r.pedido ?? ""}</td>
                  <td>{r.proveedor ?? ""}</td>
                  <td>{r.usuario ?? ""}</td>
                </tr>
              );
            })}

            {paginated.length === 0 && (
              <tr>
                <td colSpan={9}>Sin remitos para mostrar</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="paginado-pro">
        <div className="paginado-info">
          Mostrando {from}-{to} de {totalRows}
        </div>

        <div className="paginado-size">
          <select
            value={pageSize}
            onChange={(e) => {
              setPageSize(Number(e.target.value));
              setCurrentPage(1);
            }}
          >
            <option value={10}>10</option>
            <option value={25}>25</option>
            <option value={50}>50</option>
            <option value={100}>100</option>
            <option value={200}>200</option>
            <option value={500}>500</option>
          </select>
        </div>

        <div className="paginado-goto">
          Ir a:
          <input
            type="number"
            min="1"
            max={totalPages}
            value={gotoPage}
            onChange={(e) => setGotoPage(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                irPagina(Number(gotoPage));
                setGotoPage("");
              }
            }}
          />
        </div>

        <div className="paginado-botones">
          <button
            className="pg-btn"
            onClick={() => irPagina(1)}
            disabled={currentPage === 1}
          >
            ⏮
          </button>

          <button
            className="pg-btn"
            onClick={() => irPagina(currentPage - 1)}
            disabled={currentPage === 1}
          >
            ◀
          </button>

          {Array.from({ length: totalPages }, (_, i) => i + 1)
            .filter(
              (p) =>
                p === 1 || p === totalPages || Math.abs(p - currentPage) <= 1
            )
            .map((p, i, arr) => (
              <React.Fragment key={p}>
                {i > 0 && p - arr[i - 1] > 1 && (
                  <span className="pg-dots">…</span>
                )}

                <button
                  className={`pg-btn ${currentPage === p ? "activo" : ""}`}
                  onClick={() => irPagina(p)}
                >
                  {p}
                </button>
              </React.Fragment>
            ))}

          <button
            className="pg-btn"
            onClick={() => irPagina(currentPage + 1)}
            disabled={currentPage === totalPages}
          >
            ▶
          </button>

          <button
            className="pg-btn"
            onClick={() => irPagina(totalPages)}
            disabled={currentPage === totalPages}
          >
            ⏭
          </button>
        </div>
      </div>
    </div>
  );
}