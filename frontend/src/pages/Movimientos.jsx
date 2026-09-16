import React, { useEffect, useMemo, useState, useRef } from "react";
import api from "../api/axiosConfig";
import * as XLSX from "xlsx";
import "./../styles/transferencias.css";
import {
  useMovimientosSqlFilters as useExcelFilters,
  MovimientosSqlFilterButton as ExcelFilterButton,
} from "../components/MovimientosSqlFilter";

const STORAGE_KEY_MOVIMIENTOS = "movimientos_preferencias_v2";

const MOTIVOS_DROPBOX_OCULTOS = [
  "CONSUMO PRODUCCIÓN (DROPBOX)",
  "CONSUMO RECORTES (DROPBOX)",
];

const FILTROS_INICIALES_MOVIMIENTOS = {
  motivo: {
    mode: "notIn",
    values: [...MOTIVOS_DROPBOX_OCULTOS],
  },
};

function cargarPageSizeGuardado() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_MOVIMIENTOS);
    const parsed = raw ? JSON.parse(raw) : null;
    return Number(parsed?.pageSize) || 50;
  } catch {
    return 50;
  }
}

function Movimientos() {
  const [rows, setRows] = useState([]);

  const [showExportModal, setShowExportModal] = useState(false);

  const [exportFilters, setExportFilters] = useState({
    fechaDesde: "",
    fechaHasta: "",
    tipo_transaccion: [],
    motivo: [],
    codigo: "",
    referente: [],
    proveedor: [],
  });

  const [exportOptions, setExportOptions] = useState({
    tipo_transaccion: [],
    motivo: [],
    referente: [],
    proveedor: [],
  });

  const [loadingExportOptions, setLoadingExportOptions] = useState(false);
  const [exportingExcel, setExportingExcel] = useState(false);

  const codigoExportRef = useRef(null);

  const [currentPage, setCurrentPage] = useState(1);

  const [pageSize, setPageSize] = useState(() => cargarPageSizeGuardado());

  const [loading, setLoading] = useState(false);
  const [totalRows, setTotalRows] = useState(0);
  const [reloadToken, setReloadToken] = useState(0);

  const [showEdit, setShowEdit] = useState(false);
  const [movEdit, setMovEdit] = useState(null);
  const [referentes, setReferentes] = useState([]);

  const [showMasivo, setShowMasivo] = useState(false);
  const [numeroMasivo, setNumeroMasivo] = useState("");
  const [movsMasivo, setMovsMasivo] = useState([]);
  const [masivoEdit, setMasivoEdit] = useState(null);
  const [buscandoMasivo, setBuscandoMasivo] = useState(false);

  const tableWrapRef = useRef(null);
  const topScrollRef = useRef(null);
  const topScrollInnerRef = useRef(null);
  const tableRef = useRef(null);
  const queryVersionRef = useRef(0);
  const queryAbortRef = useRef(null);

  const formatFecha = (value) => {
    if (!value) return "";

    const d = new Date(value);

    if (Number.isNaN(d.getTime())) return "";

    return d.toLocaleDateString("es-AR");
  };

  const columnas = useMemo(
    () => [
      {
        key: "id_movimiento",
        label: "ID Movimiento",
        filterKind: "search",
        inputMode: "startsWith",
      },
      {
        key: "numero_transaccion",
        label: "Número de transacción",
        filterKind: "search",
        inputMode: "startsWith",
      },
      {
        key: "fecha",
        label: "Fecha",
        type: "date",
        filterKind: "date",
      },
      {
        key: "fecha_real",
        label: "Fecha Real",
        type: "date",
        filterKind: "date",
      },
      {
        key: "codigo",
        label: "Código",
        filterKind: "search",
        inputMode: "startsWith",
      },
      {
        key: "descripcion",
        label: "Descripción",
        filterKind: "search",
        inputMode: "contains",
      },
      {
        key: "cantidad",
        label: "Cantidad",
        type: "number",
        filterKind: "number",
      },
      {
        key: "deposito_origen",
        label: "Depósito Origen",
        filterKind: "list",
      },
      {
        key: "ubicacion_origen",
        label: "Ubicación Origen",
        filterKind: "list",
      },
      {
        key: "deposito_destino",
        label: "Depósito Destino",
        filterKind: "list",
      },
      {
        key: "ubicacion_destino",
        label: "Ubicación Destino",
        filterKind: "list",
      },
      {
        key: "tipo_transaccion",
        label: "Tipo de transacción",
        filterKind: "list",
      },
      {
        key: "motivo",
        label: "Motivo",
        filterKind: "list",
      },
      {
        key: "remito_referencia",
        label: "Remito/Referencia",
        filterKind: "search",
        inputMode: "startsWith",
      },
      {
        key: "obra",
        label: "Obra",
        filterKind: "search",
        inputMode: "startsWith",
      },
      {
        key: "version",
        label: "Versión",
        filterKind: "search",
        inputMode: "startsWith",
      },
      {
        key: "referente",
        label: "Actuante",
        filterKind: "list",
      },
      {
        key: "proveedor",
        label: "Proveedor",
        filterKind: "list",
      },
      {
        key: "ingreso_egreso",
        label: "E/I",
        filterKind: "list",
      },
      {
        key: "usuario",
        label: "Usuario",
        filterKind: "list",
      },
    ],
    [],
  );

  const excelColumns = useMemo(
    () =>
      columnas.map((col) => ({
        ...col,
        getValue: (row) => row?.[col.key] ?? "",
      })),
    [columnas],
  );

  const excel = useExcelFilters(rows, excelColumns, {
    initialFilters: FILTROS_INICIALES_MOVIMIENTOS,
    onChange: () => setCurrentPage(1),
  });

  const getQuickFilterValue = (col) => {
    const filter = excel.filters[col.key];
    if (!filter) return "";

    if (col.filterKind === "date") {
      if (
        filter.mode === "dateRange" &&
        filter.from &&
        filter.from === filter.to
      ) {
        return filter.from;
      }
      return "";
    }

    if (col.filterKind === "number") {
      return filter.mode === "numberEq" ? String(filter.value ?? "") : "";
    }

    if (filter.mode === "contains" || filter.mode === "startsWith") {
      return String(filter.value ?? "");
    }

    return "";
  };

  const cambiarFiltroRapido = (col, value) => {
    const text = String(value ?? "");

    if (!text.trim()) {
      excel.clearColumnFilter(col.key);
      return;
    }

    if (col.filterKind === "date") {
      excel.setColumnFilter(col.key, {
        mode: "dateRange",
        from: text,
        to: text,
      });
      return;
    }

    if (col.filterKind === "number") {
      excel.setColumnFilter(col.key, {
        mode: "numberEq",
        value: text,
      });
      return;
    }

    excel.setColumnFilter(col.key, {
      mode: col.inputMode === "contains" ? "contains" : "startsWith",
      value: text,
    });
  };

  /* Consulta únicamente la página visible directamente en SQL Server. */
  const cargarMovimientos = async ({ silent = false } = {}) => {
    const queryVersion = ++queryVersionRef.current;

    queryAbortRef.current?.abort();
    const controller = new AbortController();
    queryAbortRef.current = controller;

    try {
      if (!silent) {
        setLoading(true);
      }

      const response = await api.get("/movimientos", {
        params: {
          page: currentPage,
          pageSize,
          filters: JSON.stringify(excel.filters),
          sortKey: excel.sort?.key || "",
          sortDir: excel.sort?.dir || "",
        },
        signal: controller.signal,
        timeout: 120000,
      });

      if (queryVersion !== queryVersionRef.current) {
        return;
      }

      const resultado = response.data || {};
      const data = Array.isArray(resultado?.data) ? resultado.data : [];
      const totalProvisorio = Number(resultado?.total || 0);
      const pagesProvisorias = Math.max(Number(resultado?.totalPages || 1), 1);

      if (currentPage > pagesProvisorias) {
        setCurrentPage(pagesProvisorias);
        return;
      }

      setRows(data);
      setTotalRows(totalProvisorio);
    } catch (err) {
      if (
        controller.signal.aborted ||
        err?.code === "ERR_CANCELED" ||
        err?.name === "CanceledError"
      ) {
        return;
      }

      if (queryVersion !== queryVersionRef.current) {
        return;
      }

      console.error("Error cargando movimientos desde SQL Server:", err);

      setRows([]);
      setTotalRows(0);

      alert(
        err.response?.data?.error ||
          err.response?.data?.detalle ||
          err.message ||
          "Error cargando movimientos.",
      );
    } finally {
      if (queryAbortRef.current === controller) {
        queryAbortRef.current = null;
      }

      if (queryVersion === queryVersionRef.current && !silent) {
        setLoading(false);
      }
    }
  };

  const actualizarMovimientos = () => {
    excel.clearAllFilters();
    setCurrentPage(1);
    setReloadToken((value) => value + 1);
  };

  const cargarReferentes = async () => {
    try {
      const res = await api.get("/referentes");

      const data = Array.isArray(res.data) ? res.data : [];

      if (!Array.isArray(res.data)) {
        console.error("La respuesta de /referentes no es un array:", res.data);
      }

      setReferentes(data.filter((r) => r.activo));
    } catch (err) {
      console.error("Error cargando actuantes:", err);
      setReferentes([]);
      alert("No se pudieron cargar los actuantes.");
    }
  };

  useEffect(() => {
    try {
      localStorage.setItem(
        STORAGE_KEY_MOVIMIENTOS,
        JSON.stringify({ pageSize }),
      );
    } catch (err) {
      console.error("No se pudo guardar el tamaño de página:", err);
    }
  }, [pageSize]);

  /*
   * Consulta la API con debounce. Al cambiar filtros/orden/página se invalida
   * inmediatamente cualquier respuesta anterior y se vacía la grilla.
   * Así nunca quedan visibles filas de la consulta previa mientras entra la nueva.
   */
  useEffect(() => {
    queryVersionRef.current += 1;
    queryAbortRef.current?.abort();
    setRows([]);

    const timer = setTimeout(() => {
      cargarMovimientos();
    }, 350);

    return () => {
      clearTimeout(timer);
      queryAbortRef.current?.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    currentPage,
    pageSize,
    excel.filters,
    excel.sort,
    reloadToken,
  ]);

  const limpiarFiltros = () => {
    excel.clearAllFilters();
    setCurrentPage(1);
  };

  const abrirEdicion = (r) => {
    setMovEdit({
      id_movimiento: r.id_movimiento ?? "",
      numero_transaccion: r.numero_transaccion ?? "",
      tipo_transaccion: r.tipo_transaccion ?? "",
      remito_referencia: r.remito_referencia ?? "",
      obra: r.obra ?? "",
      version: r.version ?? "",
      referente: r.referente ?? "",
      id_referente: r.id_referente ?? "",
    });

    setShowEdit(true);
  };

  const guardarEdicion = async () => {
    if (!movEdit) return;

    try {
      await api.put("/movimientos", {
        tipo_transaccion: movEdit.tipo_transaccion,
        numero_transaccion: movEdit.numero_transaccion,
        remito_referencia: movEdit.remito_referencia || null,
        obra: movEdit.obra || null,
        version: movEdit.version || null,
        id_referente: movEdit.id_referente || null,
      });

      setShowEdit(false);
      setMovEdit(null);

      setReloadToken((value) => value + 1);
    } catch (err) {
      alert(
        err.response?.data?.error ||
          err.response?.data?.detalle ||
          "Error al actualizar movimiento",
      );
    }
  };

  const abrirMasivo = () => {
    setNumeroMasivo("");
    setMovsMasivo([]);
    setMasivoEdit(null);
    setShowMasivo(true);
  };

  const buscarTransaccionMasiva = async () => {
    const numero = String(numeroMasivo || "").trim();

    if (!numero) {
      alert("Ingresá un número de transacción.");
      return;
    }

    try {
      setBuscandoMasivo(true);

      const res = await api.get(
        `/movimientos/transaccion/${encodeURIComponent(numero)}`,
      );

      const data = Array.isArray(res.data) ? res.data : [];

      if (!Array.isArray(res.data)) {
        console.error("La respuesta no es un array:", res.data);
      }

      if (!data.length) {
        setMovsMasivo([]);
        setMasivoEdit(null);
        alert("No se encontraron movimientos editables para esa transacción.");
        return;
      }

      setMovsMasivo(data);

      const primero = data[0];

      setMasivoEdit({
        id_movimiento: primero.id_movimiento ?? "",
        numero_transaccion: primero.numero_transaccion ?? numero,
        tipo_transaccion: primero.tipo_transaccion ?? "",
        remito_referencia: primero.remito_referencia ?? "",
        obra: primero.obra ?? "",
        version: primero.version ?? "",
        id_referente: primero.id_referente ?? "",
      });
    } catch (err) {
      console.error("Error buscando transacción:", err);

      alert(
        err.response?.data?.error ||
          err.response?.data?.detalle ||
          "Error al buscar la transacción",
      );
    } finally {
      setBuscandoMasivo(false);
    }
  };

  const guardarEdicionMasiva = async () => {
    if (!masivoEdit) return;

    const confirmar = window.confirm(
      `Vas a modificar la transacción ${masivoEdit.numero_transaccion} completa. ` +
        `Esto afectará a todos los artículos involucrados. ¿Confirmás?`,
    );

    if (!confirmar) return;

    try {
      await api.put("/movimientos/masivo", {
        tipo_transaccion: masivoEdit.tipo_transaccion,
        numero_transaccion: masivoEdit.numero_transaccion,
        remito_referencia: masivoEdit.remito_referencia || null,
        obra: masivoEdit.obra || null,
        version: masivoEdit.version || null,
        id_referente: masivoEdit.id_referente || null,
      });

      setShowMasivo(false);
      setNumeroMasivo("");
      setMovsMasivo([]);
      setMasivoEdit(null);

      setReloadToken((value) => value + 1);

      alert("Transacción actualizada correctamente.");
    } catch (err) {
      alert(
        err.response?.data?.error ||
          err.response?.data?.detalle ||
          "Error al actualizar la transacción",
      );
    }
  };

  /* SQL Server ya devuelve la página filtrada. */
  const totalPages = Math.ceil(totalRows / pageSize) || 1;
  const paginated = rows;

  /*
   * Evita crear un array de miles de páginas en cada tecla escrita cuando el
   * historial completo ya está cargado. Solo se calculan los botones visibles.
   */
  const visiblePageNumbers = useMemo(() => {
    const candidates = [
      1,
      currentPage - 1,
      currentPage,
      currentPage + 1,
      totalPages,
    ];

    return Array.from(
      new Set(candidates.filter((page) => page >= 1 && page <= totalPages)),
    ).sort((a, b) => a - b);
  }, [currentPage, totalPages]);

  const irPagina = (p) => {
    const n = Number(p);

    if (!Number.isFinite(n)) return;
    if (n < 1 || n > totalPages) return;

    setCurrentPage(n);
  };

  const from = totalRows === 0 ? 0 : (currentPage - 1) * pageSize + 1;
  const to = Math.min(currentPage * pageSize, totalRows);

  const toggleExportArrayValue = (field, value) => {
    setExportFilters((prev) => {
      const actual = Array.isArray(prev[field]) ? prev[field] : [];
      const existe = actual.includes(value);

      return {
        ...prev,
        [field]: existe
          ? actual.filter((x) => x !== value)
          : [...actual, value],
      };
    });
  };

  const construirFiltrosExportacion = () => {
    const f = {};

    if (exportFilters.fechaDesde || exportFilters.fechaHasta) {
      f.fecha = {
        mode: "dateRange",
        from: exportFilters.fechaDesde || "",
        to: exportFilters.fechaHasta || "",
      };
    }

    if (exportFilters.tipo_transaccion.length > 0) {
      f.tipo_transaccion = {
        mode: "in",
        values: exportFilters.tipo_transaccion,
      };
    }

    if (exportFilters.motivo.length > 0) {
      f.motivo = {
        mode: "in",
        values: exportFilters.motivo,
      };
    } else {
      f.motivo = {
        mode: "notIn",
        values: [...MOTIVOS_DROPBOX_OCULTOS],
      };
    }

    if (exportFilters.codigo) {
      f.codigo = {
        mode: "contains",
        value: exportFilters.codigo.trim(),
      };
    }

    if (exportFilters.referente.length > 0) {
      f.referente = {
        mode: "in",
        values: exportFilters.referente,
      };
    }

    if (exportFilters.proveedor.length > 0) {
      f.proveedor = {
        mode: "in",
        values: exportFilters.proveedor,
      };
    }

    return f;
  };

  const cargarOpcionesExportacion = async () => {
    try {
      setLoadingExportOptions(true);

      const columnasExport = [
        "tipo_transaccion",
        "motivo",
        "referente",
        "proveedor",
      ];

      const resultados = await Promise.all(
        columnasExport.map((col) =>
          api.get("/movimientos/distinct", {
            params: {
              column: col,
              filters: JSON.stringify({}),
            },
            timeout: 120000,
          }),
        ),
      );

      const nuevasOpciones = {};

      columnasExport.forEach((col, index) => {
        const data = Array.isArray(resultados[index].data)
          ? resultados[index].data
          : [];

        nuevasOpciones[col] = data
          .map((x) => String(x.value ?? "").trim())
          .filter((x) => x !== "");
      });

      setExportOptions(nuevasOpciones);
    } catch (err) {
      console.error("Error cargando opciones de exportación:", err);

      alert(
        err.response?.data?.error ||
          err.response?.data?.detalle ||
          "No se pudieron cargar las opciones para exportar.",
      );
    } finally {
      setLoadingExportOptions(false);
    }
  };

  const abrirModalExportacion = async () => {
    setShowExportModal(true);
    await cargarOpcionesExportacion();
  };

  const limpiarFiltrosExportacion = () => {
    setExportFilters({
      fechaDesde: "",
      fechaHasta: "",
      tipo_transaccion: [],
      motivo: [],
      codigo: "",
      referente: [],
      proveedor: [],
    });
  };

  const validarCodigoExportacion = async () => {
    const codigo = String(exportFilters.codigo || "").trim();

    if (!codigo) return true;

    try {
      const res = await api.get("/movimientos/distinct", {
        params: {
          column: "codigo",
          search: codigo,
          filters: JSON.stringify({}),
        },
        timeout: 120000,
      });

      const data = Array.isArray(res.data) ? res.data : [];

      const existe = data.some(
        (x) =>
          String(x.value ?? "")
            .trim()
            .toUpperCase() === codigo.toUpperCase(),
      );

      if (!existe) {
        alert(
          `El código "${codigo}" no existe en movimientos. Corregilo antes de exportar.`,
        );

        setTimeout(() => {
          codigoExportRef.current?.focus();
          codigoExportRef.current?.select();
        }, 100);

        return false;
      }

      return true;
    } catch (err) {
      console.error("Error validando código:", err);

      alert(
        err.response?.data?.error ||
          err.response?.data?.detalle ||
          "No se pudo validar el código ingresado.",
      );

      return false;
    }
  };

  const exportarExcel = async () => {
    try {
      const codigoValido = await validarCodigoExportacion();

      if (!codigoValido) return;

      setExportingExcel(true);

      const filtrosParaExportar = construirFiltrosExportacion();

      const res = await api.get("/movimientos/export", {
        params: {
          filters: JSON.stringify(filtrosParaExportar),
          sortKey: excel.sort?.key || "",
          sortDir: excel.sort?.dir || "",
        },
        timeout: 180000,
      });

      const dataBase = Array.isArray(res.data) ? res.data : [];

      const data = dataBase.map((r) => ({
        "ID Movimiento": r.id_movimiento ?? "",
        "Número de transacción": r.numero_transaccion ?? "",
        Fecha: formatFecha(r.fecha),
        "Fecha Real": formatFecha(r.fecha_real),
        Código: r.codigo ?? "",
        Descripción: r.descripcion ?? "",
        Cantidad: r.cantidad ?? "",
        "Depósito Origen": r.deposito_origen ?? "",
        "Depósito Destino": r.deposito_destino ?? "",
        "Tipo de transacción": r.tipo_transaccion ?? "",
        Motivo: r.motivo ?? "",
        "Remito/Referencia": r.remito_referencia ?? "",
        Obra: r.obra ?? "",
        Versión: r.version ?? "",
        Actuante: r.referente ?? "",
        Proveedor: r.proveedor ?? "",
        "E/I": r.ingreso_egreso ?? "",
        Usuario: r.usuario ?? "",
      }));

      const ws = XLSX.utils.json_to_sheet(data);
      const wb = XLSX.utils.book_new();

      XLSX.utils.book_append_sheet(wb, ws, "Movimientos");
      XLSX.writeFile(wb, "movimientos_exportados.xlsx");

      setShowExportModal(false);
    } catch (err) {
      console.error("Error exportando movimientos:", err);

      alert(
        err.response?.data?.error ||
          err.response?.data?.detalle ||
          "No se pudo exportar movimientos.",
      );
    } finally {
      setExportingExcel(false);
    }
  };

  const renderExportCheckboxGroup = (
    title,
    field,
    options,
    defaultLabel = "Todos",
  ) => {
    const selected = Array.isArray(exportFilters[field])
      ? exportFilters[field]
      : [];

    return (
      <div className="export-group">
        <div className="export-group-title">{title}</div>

        <label className="export-option export-option-default">
          <input
            type="checkbox"
            checked={selected.length === 0}
            onChange={() =>
              setExportFilters((prev) => ({
                ...prev,
                [field]: [],
              }))
            }
          />
          <span>{defaultLabel}</span>
        </label>

        <div className="export-options-list">
          {options.map((x) => (
            <label className="export-option" key={x}>
              <input
                type="checkbox"
                checked={selected.includes(x)}
                onChange={() => toggleExportArrayValue(field, x)}
              />
              <span>{x}</span>
            </label>
          ))}
        </div>
      </div>
    );
  };

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
      <h2 className="module-title">Movimientos</h2>

      <div
        className="acciones"
        style={{
          marginBottom: 12,
          display: "flex",
          gap: 8,
          flexWrap: "wrap",
        }}
      >
        <button onClick={abrirModalExportacion}>Exportar a Excel</button>
        <button onClick={limpiarFiltros}>Limpiar filtros</button>
        <button onClick={actualizarMovimientos}>↻ Actualizar</button>

        <button className="btn-primary" onClick={abrirMasivo}>
          Editar transacción completa
        </button>

        {loading && (
          <span style={{ padding: "6px 10px" }}>
            Consultando movimientos...
          </span>
        )}
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
        <table ref={tableRef} className="tabla-movimientos">
          <thead>
            <tr>
              {columnas.map((col) => (
                <th key={col.key} style={{ overflow: "visible" }}>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: 6,
                    }}
                  >
                    <span>{col.label}</span>

                    <ExcelFilterButton
                      columnKey={col.key}
                      label={col.label}
                      excel={excel}
                    />
                  </div>
                </th>
              ))}

              <th>Acción</th>
            </tr>

            <tr>
              {columnas.map((col) => {
                const quickValue = getQuickFilterValue(col);
                const inputType =
                  col.filterKind === "date"
                    ? "date"
                    : col.filterKind === "number"
                      ? "number"
                      : "text";

                const placeholder =
                  col.filterKind === "number"
                    ? "="
                    : col.inputMode === "contains"
                      ? "Contiene..."
                      : "Empieza...";

                return (
                  <th key={`filtro-${col.key}`}>
                    <input
                      type={inputType}
                      value={quickValue}
                      placeholder={inputType === "date" ? "" : placeholder}
                      onChange={(event) =>
                        cambiarFiltroRapido(col, event.target.value)
                      }
                      style={{
                        width: "100%",
                        minWidth: 0,
                        boxSizing: "border-box",
                        padding: "5px 7px",
                      }}
                    />
                  </th>
                );
              })}

              <th />
            </tr>
          </thead>

          <tbody>
            {paginated.length === 0 ? (
              <tr>
                <td colSpan={21}>Sin movimientos.</td>
              </tr>
            ) : (
              paginated.map((r, i) => {
                const editable =
                  r.tipo_transaccion === "AJUSTE" ||
                  r.tipo_transaccion === "TRANSFERENCIA" ||
                  r.tipo_transaccion === "REMITO";

                return (
                  <tr
                    key={
                      r.id_movimiento ||
                      `${r.tipo_transaccion}-${r.numero_transaccion}-${r.codigo}-${i}`
                    }
                  >
                    <td>{r.id_movimiento ?? ""}</td>
                    <td>{r.numero_transaccion ?? ""}</td>
                    <td>{formatFecha(r.fecha)}</td>
                    <td>{formatFecha(r.fecha_real)}</td>
                    <td>{r.codigo ?? ""}</td>
                    <td>{r.descripcion ?? ""}</td>
                    <td style={{ textAlign: "right" }}>{r.cantidad ?? ""}</td>
                    <td>{r.deposito_origen ?? ""}</td>
                    <td>{r.ubicacion_origen ?? ""}</td>
                    <td>{r.deposito_destino ?? ""}</td>
                    <td>{r.ubicacion_destino ?? ""}</td>
                    <td>{r.tipo_transaccion ?? ""}</td>
                    <td>{r.motivo ?? ""}</td>
                    <td>{r.remito_referencia ?? ""}</td>
                    <td>{r.obra ?? ""}</td>
                    <td>{r.version ?? ""}</td>
                    <td>{r.referente ?? ""}</td>
                    <td>{r.proveedor ?? ""}</td>
                    <td>{r.ingreso_egreso ?? ""}</td>
                    <td>{r.usuario ?? ""}</td>
                    <td>
                      {editable ? (
                        <button
                          className="btn-light"
                          onClick={() => abrirEdicion(r)}
                        >
                          Editar
                        </button>
                      ) : (
                        ""
                      )}
                    </td>
                  </tr>
                );
              })
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
            <option value={25}>25</option>
            <option value={50}>50</option>
            <option value={100}>100</option>
            <option value={200}>200</option>
            <option value={500}>500</option>
          </select>
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

          {visiblePageNumbers.map((p, i, arr) => (
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
            title="Ir a la última página"
          >
            ⏭
          </button>
        </div>
      </div>

      {showExportModal && (
        <div className="modal">
          <div className="modal-content modal-export">
            <h3>Exportar movimientos a Excel</h3>

            <p className="export-help">
              Seleccioná los filtros que quieras aplicar. Si dejás un campo
              vacío, no se filtra por ese dato.
            </p>

            {loadingExportOptions ? (
              <div className="export-loading">Cargando opciones...</div>
            ) : (
              <>
                <div className="export-date-row">
                  <label>
                    Fecha desde
                    <input
                      type="date"
                      value={exportFilters.fechaDesde}
                      onChange={(e) =>
                        setExportFilters((prev) => ({
                          ...prev,
                          fechaDesde: e.target.value,
                        }))
                      }
                    />
                  </label>

                  <label>
                    Fecha hasta
                    <input
                      type="date"
                      value={exportFilters.fechaHasta}
                      onChange={(e) =>
                        setExportFilters((prev) => ({
                          ...prev,
                          fechaHasta: e.target.value,
                        }))
                      }
                    />
                  </label>
                </div>

                <div className="export-grid">
                  {renderExportCheckboxGroup(
                    "Tipo de transacción",
                    "tipo_transaccion",
                    exportOptions.tipo_transaccion,
                    "Todas",
                  )}

                  {renderExportCheckboxGroup(
                    "Motivo",
                    "motivo",
                    exportOptions.motivo,
                    "Todos excepto CONSUMO PRODUCCIÓN (DROPBOX) y CONSUMO RECORTES (DROPBOX)",
                  )}

                  {renderExportCheckboxGroup(
                    "Actuante",
                    "referente",
                    exportOptions.referente,
                    "Todos",
                  )}

                  {renderExportCheckboxGroup(
                    "Proveedor",
                    "proveedor",
                    exportOptions.proveedor,
                    "Todos",
                  )}
                </div>

                <div className="export-code-row">
                  <label>
                    Código
                    <input
                      ref={codigoExportRef}
                      value={exportFilters.codigo}
                      onChange={(e) =>
                        setExportFilters((prev) => ({
                          ...prev,
                          codigo: e.target.value,
                        }))
                      }
                      placeholder="Escribí un código existente"
                    />
                  </label>
                </div>
              </>
            )}

            <div className="modal-botones export-buttons">
              <button
                className="btn-primary"
                onClick={exportarExcel}
                disabled={loadingExportOptions || exportingExcel}
              >
                {exportingExcel ? "Exportando..." : "Exportar"}
              </button>

              <button
                className="btn-light"
                onClick={limpiarFiltrosExportacion}
                disabled={exportingExcel}
              >
                Limpiar filtros
              </button>

              <button
                className="btn-light"
                onClick={() => setShowExportModal(false)}
                disabled={exportingExcel}
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {showEdit && movEdit && (
        <div className="modal">
          <div className="modal-content modal-wide">
            <h3>Editar movimiento</h3>

            <div className="form-grid">
              <label>
                ID Movimiento
                <input value={movEdit.id_movimiento} disabled />
              </label>

              <label>
                Tipo
                <input value={movEdit.tipo_transaccion} disabled />
              </label>

              <label>
                Nro transacción
                <input value={movEdit.numero_transaccion} disabled />
              </label>

              <label>
                Remito / Referencia
                <input
                  value={movEdit.remito_referencia}
                  onChange={(e) =>
                    setMovEdit((prev) => ({
                      ...prev,
                      remito_referencia: e.target.value,
                    }))
                  }
                />
              </label>

              <label>
                Obra
                <input
                  value={movEdit.obra}
                  onChange={(e) =>
                    setMovEdit((prev) => ({
                      ...prev,
                      obra: e.target.value,
                    }))
                  }
                  disabled={movEdit.tipo_transaccion !== "AJUSTE"}
                />
              </label>

              <label>
                Versión
                <input
                  value={movEdit.version}
                  onChange={(e) =>
                    setMovEdit((prev) => ({
                      ...prev,
                      version: e.target.value,
                    }))
                  }
                  disabled={movEdit.tipo_transaccion !== "AJUSTE"}
                />
              </label>

              <label>
                Actuante
                <select
                  value={movEdit.id_referente || ""}
                  onChange={(e) =>
                    setMovEdit((prev) => ({
                      ...prev,
                      id_referente: e.target.value,
                    }))
                  }
                  disabled={movEdit.tipo_transaccion === "REMITO"}
                >
                  <option value="">Sin actuante</option>
                  {referentes.map((r) => (
                    <option key={r.id_referente} value={r.id_referente}>
                      {r.nombre}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            {movEdit.tipo_transaccion === "REMITO" && (
              <p style={{ marginTop: 10, fontSize: 13, opacity: 0.75 }}>
                En remitos, este formulario edita la observación mostrada como
                Remito / Referencia. No modifica artículos, cantidades ni stock.
              </p>
            )}

            <div className="modal-botones">
              <button className="btn-primary" onClick={guardarEdicion}>
                Guardar
              </button>

              <button
                className="btn-light"
                onClick={() => {
                  setShowEdit(false);
                  setMovEdit(null);
                }}
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {showMasivo && (
        <div className="modal">
          <div className="modal-content modal-wide">
            <h3>Editar transacción completa</h3>

            <div className="form-grid">
              <label>
                Número de transacción
                <input
                  value={numeroMasivo}
                  onChange={(e) => setNumeroMasivo(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") buscarTransaccionMasiva();
                  }}
                />
              </label>

              <div style={{ display: "flex", alignItems: "end", gap: 8 }}>
                <button
                  className="btn-primary"
                  onClick={buscarTransaccionMasiva}
                  disabled={buscandoMasivo}
                >
                  {buscandoMasivo ? "Buscando..." : "Buscar"}
                </button>
              </div>
            </div>

            {movsMasivo.length > 0 && masivoEdit && (
              <>
                <hr />

                <p>
                  Se encontraron <b>{movsMasivo.length}</b> movimientos para la
                  transacción <b>{masivoEdit.numero_transaccion}</b>.
                </p>

                <div className="form-grid">
                  <label>
                    Tipo
                    <input value={masivoEdit.tipo_transaccion} disabled />
                  </label>

                  <label>
                    Remito / Referencia
                    <input
                      value={masivoEdit.remito_referencia}
                      onChange={(e) =>
                        setMasivoEdit((prev) => ({
                          ...prev,
                          remito_referencia: e.target.value,
                        }))
                      }
                    />
                  </label>

                  <label>
                    Obra
                    <input
                      value={masivoEdit.obra}
                      onChange={(e) =>
                        setMasivoEdit((prev) => ({
                          ...prev,
                          obra: e.target.value,
                        }))
                      }
                      disabled={masivoEdit.tipo_transaccion !== "AJUSTE"}
                    />
                  </label>

                  <label>
                    Versión
                    <input
                      value={masivoEdit.version}
                      onChange={(e) =>
                        setMasivoEdit((prev) => ({
                          ...prev,
                          version: e.target.value,
                        }))
                      }
                      disabled={masivoEdit.tipo_transaccion !== "AJUSTE"}
                    />
                  </label>

                  <label>
                    Actuante
                    <select
                      value={masivoEdit.id_referente || ""}
                      onChange={(e) =>
                        setMasivoEdit((prev) => ({
                          ...prev,
                          id_referente: e.target.value,
                        }))
                      }
                      disabled={masivoEdit.tipo_transaccion === "REMITO"}
                    >
                      <option value="">Sin actuante</option>
                      {referentes.map((r) => (
                        <option key={r.id_referente} value={r.id_referente}>
                          {r.nombre}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>

                {masivoEdit.tipo_transaccion === "REMITO" && (
                  <p style={{ marginTop: 10, fontSize: 13, opacity: 0.75 }}>
                    En remitos, este formulario edita la observación mostrada
                    como Remito / Referencia. No modifica artículos, cantidades
                    ni stock.
                  </p>
                )}
              </>
            )}

            <div className="modal-botones">
              {movsMasivo.length > 0 && (
                <button className="btn-primary" onClick={guardarEdicionMasiva}>
                  Guardar transacción completa
                </button>
              )}

              <button
                className="btn-light"
                onClick={() => {
                  setShowMasivo(false);
                  setNumeroMasivo("");
                  setMovsMasivo([]);
                  setMasivoEdit(null);
                }}
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default Movimientos;