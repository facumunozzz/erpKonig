import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../api/axiosConfig";
import "./../styles/transferencias.css";
import ReferentesModal from "../components/ReferentesModal";
import RevertirMovimientosModal from "../components/RevertirMovimientosModal";
import {
  useExcelFilters,
  ExcelFilterButton,
} from "../components/ExcelColumnFilter";
import RevisionesDropboxModal from "../components/RevisionesDropboxModal";

const AJUSTE_COLUMNS = [
  ["estado", "Estado"],
  ["fecha", "Fecha"],
  ["fecha_real", "Fecha real"],
  ["deposito", "Depósito"],
  ["motivo", "Motivo"],
  ["referente", "Referente"],
  ["remito_referencia", "Remito / Ref."],
  ["numero_ajuste", "Nro Ajuste"],
];

const normalizarMotivo = (value) =>
  String(value ?? "")
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase();

const MOTIVOS_OCULTOS = new Set([
  "CONSUMO PRODUCCION (DROPBOX)",
  "IMPORTACION EXCEL",
  "CONSUMO RECORTES (DROPBOX)",
]);

const esMotivoOculto = (nombre) =>
  MOTIVOS_OCULTOS.has(normalizarMotivo(nombre));

export default function Ajustes() {
  const navigate = useNavigate();
  const [showRevisionesDropbox, setShowRevisionesDropbox] = useState(false);
  const [mostrarConsumosDropbox, setMostrarConsumosDropbox] = useState(false);
  const [cantidadRevisiones, setCantidadRevisiones] = useState(0);
  const [procesandoRecortes, setProcesandoRecortes] = useState(false);

  // LISTADO DE AJUSTES
  const [ajustes, setAjustes] = useState([]);
  const [loadingAjustes, setLoadingAjustes] = useState(false);

  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [gotoPage, setGotoPage] = useState("");
  const [filtrosColumnas, setFiltrosColumnas] = useState({});

  const [totalRows, setTotalRows] = useState(0);
  const [serverTotalPages, setServerTotalPages] = useState(1);
  const [paginacionServidor, setPaginacionServidor] = useState(false);

  // =====================================================
  // MOTIVOS
  // =====================================================

  const [showMotivos, setShowMotivos] = useState(false);
  const [motivos, setMotivos] = useState([]);
  const [nuevoMotivo, setNuevoMotivo] = useState("");
  const [nuevoTipoMovimiento, setNuevoTipoMovimiento] = useState("");
  const [motivosError, setMotivosError] = useState("");
  const [menuLateralAbierto, setMenuLateralAbierto] = useState(false);
  const [menuExcelAbierto, setMenuExcelAbierto] = useState(false);
  const [menuDropboxAbierto, setMenuDropboxAbierto] = useState(false);
  const [showReferentes, setShowReferentes] = useState(false);
  const [showReversion, setShowReversion] = useState(false);

  const fetchAjustes = async () => {
    try {
      setLoadingAjustes(true);

      const response = await api.get("/ajustes", {
        params: {
          page: currentPage,
          pageSize,
          incluirDropbox: mostrarConsumosDropbox ? 1 : 0,
        },
      });

      const payload = response.data;

      if (Array.isArray(payload)) {
        setPaginacionServidor(false);
        setAjustes(payload);
        setTotalRows(payload.length);
        setServerTotalPages(Math.ceil(payload.length / pageSize) || 1);

        return;
      }

      const data = Array.isArray(payload?.data) ? payload.data : [];

      setPaginacionServidor(true);
      setAjustes(data);
      setTotalRows(Number(payload?.total || 0));
      setServerTotalPages(Number(payload?.totalPages || 1));
    } catch (error) {
      console.error("Error cargando ajustes:", error);

      setAjustes([]);
      setTotalRows(0);
      setServerTotalPages(1);
    } finally {
      setLoadingAjustes(false);
    }
  };

  const fetchCantidadRevisiones = async () => {
    try {
      const response = await api.get("/ajustes/alertas-consumo/pendientes");
      const payload = response.data;
      const revisiones = Array.isArray(payload)
        ? payload
        : Array.isArray(payload?.data)
          ? payload.data
          : Array.isArray(payload?.alertas)
            ? payload.alertas
            : [];
      setCantidadRevisiones(revisiones.length);
    } catch (error) {
      console.error("Error cargando revisiones Dropbox:", error);
      setCantidadRevisiones(0);
    }
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchAjustes();
    }, 300);

    return () => clearTimeout(timer);
  }, [currentPage, pageSize, mostrarConsumosDropbox]);

  useEffect(() => {
    fetchCantidadRevisiones();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // CONSUMIR PRODUCCIÓN
  const consumirProduccion = async () => {
    try {
      const response = await api.post("/ajustes/consumir-produccion");

      alert(
        `Proceso finalizado.\n\nAjustados: ${
          response.data?.ajustados || 0
        }\nFallidos: ${response.data?.fallidos || 0}`,
      );

      await fetchAjustes();
      await fetchCantidadRevisiones();
    } catch (error) {
      alert(
        error.response?.data?.error ||
          error.response?.data?.detalle ||
          "Error al consumir producción",
      );
    }
  };

  // CONSUMIR RECORTES
  const consumirRecortes = async () => {
    if (procesandoRecortes) {
      return;
    }

    const confirmado = window.confirm(
      "¿Ejecutar el ajuste de stock de recortes desde Dropbox?\n\n" +
        "Se procesarán los valores de la columna Consumido, " +
        "se actualizará el stock y se modificará el archivo Excel.",
    );

    if (!confirmado) {
      return;
    }

    try {
      setProcesandoRecortes(true);

      const response = await api.post("/dropbox-recortes/consumir");

      const resultado = response.data || {};

      const movimientos = Array.isArray(resultado.movimientos)
        ? resultado.movimientos
        : [];

      const errores = Array.isArray(resultado.errores) ? resultado.errores : [];

      alert(
        `Proceso de recortes finalizado.\n\n` +
          `Procesados: ${resultado.procesados || 0}\n` +
          `Alertas: ${resultado.alertas || 0}\n` +
          `Ajuste generado: ${resultado.numero_ajuste || "No se generó"}\n` +
          `Movimientos: ${movimientos.length}\n` +
          `Errores: ${errores.length}`,
      );

      setMostrarConsumosDropbox(true);
      setCurrentPage(1);

      await fetchAjustes();
      await fetchCantidadRevisiones();
    } catch (error) {
      console.error("Error consumiendo recortes desde Dropbox:", error);

      alert(
        error.response?.data?.error ||
          error.response?.data?.detalle ||
          "Error al ajustar el stock de recortes",
      );
    } finally {
      setProcesandoRecortes(false);
    }
  };

  // =====================================================
  // DESCARGAR PLANTILLA
  // =====================================================

  const descargarPlantilla = async () => {
    try {
      const response = await api.get("/ajustes/plantilla", {
        responseType: "blob",
      });

      const url = window.URL.createObjectURL(response.data);
      const link = document.createElement("a");

      link.href = url;
      link.download = "Plantilla_Ajustes.xlsx";

      document.body.appendChild(link);

      link.click();
      link.remove();

      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error("Error descargando plantilla:", error);

      alert("Error al descargar la plantilla");
    }
  };

  // =====================================================
  // IMPORTAR EXCEL
  // =====================================================

  const importarExcel = async (event) => {
    const file = event.target.files?.[0];

    if (!file) {
      return;
    }

    const formData = new FormData();

    formData.append("file", file);

    try {
      await api.post("/ajustes/importar", formData, {
        headers: {
          "Content-Type": "multipart/form-data",
        },
      });

      await fetchAjustes();

      alert("Ajustes importados correctamente");
    } catch (error) {
      console.error("Error importando ajustes:", error);

      const mensaje =
        error.response?.data?.error ||
        error.response?.data?.detalle ||
        (error.response?.data?.errores
          ? "Hay errores en el archivo Excel"
          : null) ||
        "Error al importar ajustes";

      alert(mensaje);
    } finally {
      event.target.value = "";
    }
  };

  // =====================================================
  // MOTIVOS
  // =====================================================

  const fetchMotivos = async () => {
    const response = await api.get("/ajustes/motivos");

    const lista = Array.isArray(response.data) ? response.data : [];

    setMotivos(lista.filter((motivo) => !esMotivoOculto(motivo.nombre)));
  };

  const abrirMotivos = async () => {
    setShowMotivos(true);
    setMotivosError("");
    setMotivos([]);
    setNuevoMotivo("");
    setNuevoTipoMovimiento("");

    try {
      await fetchMotivos();
    } catch (error) {
      console.error("Error cargando motivos:", error);

      setMotivosError(
        error.response?.data?.error ||
          error.response?.data?.detalle ||
          error.message ||
          "No se pudieron cargar los motivos.",
      );
    }
  };

  const crearMotivo = async () => {
    const nombre = String(nuevoMotivo || "").trim();

    if (!nombre) {
      return;
    }

    try {
      await api.post("/ajustes/motivos", {
        nombre,
        tipo_movimiento: nuevoTipoMovimiento || null,
      });

      setNuevoMotivo("");
      setNuevoTipoMovimiento("");
      setMotivosError("");

      await fetchMotivos();
    } catch (error) {
      alert(error.response?.data?.error || "Error al crear motivo");
    }
  };

  const editarMotivo = async (id, actual) => {
    const nuevo = window.prompt("Editar motivo:", actual);

    if (nuevo == null) {
      return;
    }

    const nombre = String(nuevo || "").trim();

    if (!nombre) {
      return;
    }

    try {
      await api.put(`/ajustes/motivos/${id}`, {
        nombre,
      });

      setMotivosError("");

      await fetchMotivos();
    } catch (error) {
      alert(error.response?.data?.error || "Error al editar motivo");
    }
  };

  const toggleMotivo = async (id, activo) => {
    try {
      await api.put(`/ajustes/motivos/${id}`, {
        activo: !activo,
      });

      setMotivosError("");

      await fetchMotivos();
    } catch (error) {
      alert(error.response?.data?.error || "Error al cambiar estado");
    }
  };

  const cambiarTipoMovimientoMotivo = async (id, tipoMovimiento) => {
    try {
      await api.put(`/ajustes/motivos/${id}`, {
        tipo_movimiento: tipoMovimiento || null,
      });

      setMotivosError("");

      await fetchMotivos();
    } catch (error) {
      alert(
        error.response?.data?.error || "Error al cambiar el tipo de movimiento",
      );
    }
  };

  const borrarMotivo = async (id) => {
    const confirmado = window.confirm(
      "¿Borrar motivo? Solo se podrá borrar si nunca fue utilizado.",
    );

    if (!confirmado) {
      return;
    }

    try {
      await api.delete(`/ajustes/motivos/${id}`);

      setMotivosError("");

      await fetchMotivos();
    } catch (error) {
      alert(error.response?.data?.error || "Error al borrar motivo");
    }
  };

  // =====================================================
  // FILTROS DE LA TABLA
  // =====================================================

  const getAjusteValue = (ajuste, key) => {
    if (key === "fecha") {
      return ajuste.fecha ? new Date(ajuste.fecha).toLocaleString("es-AR") : "";
    }

    if (key === "fecha_real") {
      return ajuste.fecha_real
        ? new Date(ajuste.fecha_real).toLocaleDateString("es-AR")
        : "";
    }

    if (key === "numero_ajuste") {
      return ajuste.numero_ajuste ?? ajuste.id ?? "";
    }

    return ajuste?.[key] ?? "";
  };

  const excelColumns = useMemo(
    () =>
      AJUSTE_COLUMNS.map(([key, label]) => ({
        key,
        label,
        getValue: (row) => getAjusteValue(row, key),
      })),
    [],
  );

  const excel = useExcelFilters(ajustes, excelColumns, {
    onChange: () => setCurrentPage(1),
  });

  const filtrados = useMemo(() => {
    return excel.rows.filter((ajuste) =>
      AJUSTE_COLUMNS.every(([key]) => {
        const filtro = String(filtrosColumnas[key] ?? "")
          .trim()
          .toLowerCase();

        if (!filtro) {
          return true;
        }

        return String(getAjusteValue(ajuste, key) ?? "")
          .toLowerCase()
          .includes(filtro);
      }),
    );
  }, [excel.rows, filtrosColumnas]);

  // PAGINADO DE AJUSTES
  const totalPages = paginacionServidor
    ? serverTotalPages || 1
    : Math.ceil(filtrados.length / pageSize) || 1;

  const paginated = useMemo(() => {
    if (paginacionServidor) {
      return filtrados;
    }

    const inicio = (currentPage - 1) * pageSize;
    const fin = currentPage * pageSize;

    return filtrados.slice(inicio, fin);
  }, [paginacionServidor, filtrados, currentPage, pageSize]);

  const irPagina = (pagina) => {
    const numero = Number(pagina);

    if (!Number.isFinite(numero) || numero < 1 || numero > totalPages) {
      return;
    }

    setCurrentPage(numero);
  };

  const cantidadTotalMostrada = paginacionServidor
    ? totalRows
    : filtrados.length;

  const from =
    cantidadTotalMostrada === 0 ? 0 : (currentPage - 1) * pageSize + 1;

  const to = Math.min(currentPage * pageSize, cantidadTotalMostrada);

  // =====================================================
  // RENDER
  // =====================================================

  return (
    <div className="transferencias-page">
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 16,
          marginBottom: 18,
        }}
      >
        <h2
          className="module-title"
          style={{
            margin: 0,
          }}
        >
          Ajustes
        </h2>

        <button
          type="button"
          onClick={() => {
            setMenuLateralAbierto((abierto) => !abierto);
          }}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
            padding: "9px 14px",
            fontWeight: 600,
          }}
        >
          ☰ Menú lateral
        </button>
      </div>

      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          gap: 18,
          position: "relative",
        }}
      >
        {/* ===============================================
      ACCIONES PRINCIPALES
  =============================================== */}

        <div
          className="acciones"
          style={{
            flex: 1,
            display: "flex",
            alignItems: "center",
            gap: 10,
            flexWrap: "wrap",
          }}
        >
          <button type="button" onClick={() => navigate("/ajustes/nuevo")}>
            Nuevo ajuste
          </button>

          <button type="button" onClick={() => setShowReversion(true)}>
            ↩ Revertir movimientos
          </button>

          <button type="button" onClick={abrirMotivos}>
            🧾 Motivos
          </button>

          <button type="button" onClick={() => setShowReferentes(true)}>
            👤 Actuantes
          </button>

          <button
            onClick={() => {
              setFiltrosColumnas({});
              excel.clearAllFilters();
              setCurrentPage(1);
            }}
          >
            Limpiar filtros
          </button>

          <button
            type="button"
            className={cantidadRevisiones > 0 ? "btn-con-revisiones" : ""}
            onClick={() => setShowRevisionesDropbox(true)}
          >
            ⚠ Revisiones Dropbox
            {cantidadRevisiones > 0 ? ` (${cantidadRevisiones})` : ""}
          </button>
        </div>

        {/* ===============================================
      MENÚ LATERAL
  =============================================== */}

        {menuLateralAbierto && (
          <aside
            style={{
              width: 290,
              minWidth: 290,
              background: "#ffffff",
              border: "1px solid #d7dce2",
              borderRadius: 8,
              boxShadow: "0 5px 18px rgba(0, 0, 0, 0.12)",
              overflow: "hidden",
              position: "relative",
              zIndex: 50,
            }}
          >
            {/* ENCABEZADO DEL MENÚ */}

            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "12px 14px",
                background: "#f4f6f8",
                borderBottom: "1px solid #d7dce2",
              }}
            >
              <strong>Menú lateral</strong>

              <button
                type="button"
                onClick={() => {
                  setMenuLateralAbierto(false);
                  setMenuExcelAbierto(false);
                  setMenuDropboxAbierto(false);
                }}
                style={{
                  border: "none",
                  background: "transparent",
                  cursor: "pointer",
                  fontSize: 18,
                  padding: 2,
                }}
                title="Cerrar menú"
              >
                ✕
              </button>
            </div>

            {/* =============================================
          MENÚ EXCEL
      ============================================= */}

            <div
              style={{
                borderBottom: "1px solid #e3e6e9",
              }}
            >
              <button
                type="button"
                onClick={() => {
                  setMenuExcelAbierto((abierto) => !abierto);
                }}
                style={{
                  width: "100%",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "12px 14px",
                  border: "none",
                  borderRadius: 0,
                  background: menuExcelAbierto ? "#edf4fb" : "#ffffff",
                  cursor: "pointer",
                  textAlign: "left",
                  fontWeight: 600,
                }}
              >
                <span>📊 Excel</span>

                <span>{menuExcelAbierto ? "▲" : "▼"}</span>
              </button>

              {menuExcelAbierto && (
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: 6,
                    padding: "8px 12px 12px 24px",
                    background: "#fafbfc",
                  }}
                >
                  <label
                    style={{
                      display: "block",
                      width: "100%",
                      cursor: "pointer",
                      padding: "9px 10px",
                      border: "1px solid #d7dce2",
                      borderRadius: 5,
                      background: "#ffffff",
                      boxSizing: "border-box",
                    }}
                  >
                    📥 Importar Excel
                    <input
                      type="file"
                      accept=".xlsx,.xls"
                      onChange={importarExcel}
                      style={{
                        display: "none",
                      }}
                    />
                  </label>

                  <button
                    type="button"
                    onClick={descargarPlantilla}
                    style={{
                      width: "100%",
                      textAlign: "left",
                    }}
                  >
                    📤 Descargar plantilla
                  </button>
                </div>
              )}
            </div>

            {/* =============================================
          MENÚ DROPBOX
      ============================================= */}

            <div>
              <button
                type="button"
                onClick={() => {
                  setMenuDropboxAbierto((abierto) => !abierto);
                }}
                style={{
                  width: "100%",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "12px 14px",
                  border: "none",
                  borderRadius: 0,
                  background: menuDropboxAbierto ? "#edf4fb" : "#ffffff",
                  cursor: "pointer",
                  textAlign: "left",
                  fontWeight: 600,
                }}
              >
                <span>☁️ Dropbox</span>

                <span>{menuDropboxAbierto ? "▲" : "▼"}</span>
              </button>

              {menuDropboxAbierto && (
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: 7,
                    padding: "8px 12px 14px 24px",
                    background: "#fafbfc",
                  }}
                >
                  <label
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      cursor: "pointer",
                      padding: "9px 10px",
                      border: "1px solid #d7dce2",
                      borderRadius: 5,
                      background: "#ffffff",
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={mostrarConsumosDropbox}
                      onChange={(event) => {
                        setMostrarConsumosDropbox(event.target.checked);

                        setCurrentPage(1);
                      }}
                    />
                    Mostrar consumos Dropbox
                  </label>

                  <button
                    type="button"
                    className="btn-primary btn-ajuste-produccion"
                    onClick={consumirProduccion}
                    style={{
                      width: "100%",
                      textAlign: "left",
                    }}
                  >
                    ⚙️ Ajustar registro de producción
                  </button>

                  <button
                    type="button"
                    className="btn-primary btn-ajuste-produccion"
                    onClick={consumirRecortes}
                    disabled={procesandoRecortes}
                    title="Procesar el archivo de stock de recortes de Dropbox"
                    style={{
                      width: "100%",
                      textAlign: "left",
                      opacity: procesandoRecortes ? 0.7 : 1,
                      cursor: procesandoRecortes ? "not-allowed" : "pointer",
                    }}
                  >
                    {procesandoRecortes
                      ? "⏳ Ajustando stock de recortes..."
                      : "✂️ Ajustar stock de recortes"}
                  </button>
                </div>
              )}
            </div>
          </aside>
        )}
      </div>

      {/* =================================================
          TABLA DE AJUSTES
      ================================================= */}

      <table className="tabla-transferencias">
        <thead>
          <tr>
            {AJUSTE_COLUMNS.map(([key, label]) => (
              <th
                key={key}
                style={{
                  overflow: "visible",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 6,
                  }}
                >
                  <span>{label}</span>

                  <ExcelFilterButton
                    columnKey={key}
                    label={label}
                    excel={excel}
                  />
                </div>
              </th>
            ))}
          </tr>
          <tr>
            {AJUSTE_COLUMNS.map(([key]) => (
              <th key={`filtro-${key}`}>
                <input
                  type="text"
                  value={filtrosColumnas[key] || ""}
                  placeholder="Filtrar..."
                  onChange={(e) => {
                    setFiltrosColumnas((prev) => ({
                      ...prev,
                      [key]: e.target.value,
                    }));

                    setCurrentPage(1);
                  }}
                  style={{
                    width: "100%",
                    boxSizing: "border-box",
                    padding: "5px 7px",
                  }}
                />
              </th>
            ))}
          </tr>
        </thead>

        <tbody>
          {paginated.map((ajuste) => {
            const id = ajuste.numero_ajuste ?? ajuste.id;

            return (
              <tr
                key={id}
                style={{
                  cursor: "pointer",
                }}
                onClick={() => {
                  if (ajuste.estado === "BORRADOR") {
                    navigate(`/ajustes/nuevo?borradorId=${ajuste.id_borrador}`);
                  } else {
                    navigate(`/ajustes/${id}`);
                  }
                }}
                title="Ver detalle"
              >
                <td>
                  {ajuste.estado === "BORRADOR" ? (
                    <span className="badge-borrador">BORRADOR</span>
                  ) : ajuste.estado === "REVISAR" ? (
                    <span className="badge-revisar">REVISAR</span>
                  ) : (
                    <span className="badge-confirmado">CONFIRMADO</span>
                  )}
                </td>

                <td>
                  {ajuste.fecha
                    ? new Date(ajuste.fecha).toLocaleString("es-AR")
                    : ""}
                </td>

                <td>
                  {ajuste.fecha_real
                    ? new Date(ajuste.fecha_real).toLocaleDateString("es-AR")
                    : ""}
                </td>

                <td>{ajuste.deposito || ""}</td>
                <td>{ajuste.motivo || ""}</td>
                <td>{ajuste.referente || ""}</td>
                <td>{ajuste.remito_referencia || ""}</td>
                <td>{id}</td>
              </tr>
            );
          })}

          {loadingAjustes && (
            <tr>
              <td colSpan={8}>Cargando ajustes...</td>
            </tr>
          )}

          {!loadingAjustes && paginated.length === 0 && (
            <tr>
              <td colSpan={8}>Sin ajustes.</td>
            </tr>
          )}
        </tbody>
      </table>

      {/* =================================================
          PAGINADO DE AJUSTES
      ================================================= */}

      <div className="paginado-pro">
        <div className="paginado-info">
          Mostrando {from}-{to} de {cantidadTotalMostrada}
        </div>

        <div className="paginado-size">
          <select
            value={pageSize}
            onChange={(event) => {
              setPageSize(Number(event.target.value));

              setCurrentPage(1);
            }}
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
            onChange={(event) => setGotoPage(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                irPagina(Number(gotoPage));
                setGotoPage("");
              }
            }}
          />
        </div>

        <div className="paginado-botones">
          <button
            type="button"
            className="pg-btn"
            onClick={() => irPagina(1)}
            disabled={currentPage === 1}
          >
            ⏮
          </button>

          <button
            type="button"
            className="pg-btn"
            onClick={() => irPagina(currentPage - 1)}
            disabled={currentPage === 1}
          >
            ◀
          </button>

          {Array.from(
            {
              length: totalPages,
            },
            (_, index) => index + 1,
          )
            .filter(
              (page) =>
                page === 1 ||
                page === totalPages ||
                Math.abs(page - currentPage) <= 1,
            )
            .map((page, index, array) => (
              <React.Fragment key={page}>
                {index > 0 && page - array[index - 1] > 1 && (
                  <span className="pg-dots">…</span>
                )}

                <button
                  type="button"
                  className={`pg-btn ${currentPage === page ? "activo" : ""}`}
                  onClick={() => irPagina(page)}
                >
                  {page}
                </button>
              </React.Fragment>
            ))}

          <button
            type="button"
            className="pg-btn"
            onClick={() => irPagina(currentPage + 1)}
            disabled={currentPage === totalPages}
          >
            ▶
          </button>

          <button
            type="button"
            className="pg-btn"
            onClick={() => irPagina(totalPages)}
            disabled={currentPage === totalPages}
          >
            ⏭
          </button>
        </div>
      </div>

      {/* =================================================
          MODAL DE MOTIVOS
      ================================================= */}

      {showMotivos && (
        <div
          className="modal-backdrop"
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 999999,
          }}
          onMouseDown={(event) => {
            if (event.target.classList.contains("modal-backdrop")) {
              setShowMotivos(false);
            }
          }}
        >
          <div
            className="modal-card"
            style={{
              position: "relative",
              zIndex: 1000000,
            }}
          >
            <div className="modal-head">
              <h3>Motivos de ajuste</h3>

              <button type="button" onClick={() => setShowMotivos(false)}>
                ✕
              </button>
            </div>

            {motivosError && (
              <div
                className="nt-error"
                style={{
                  marginTop: 10,
                }}
              >
                {motivosError}
              </div>
            )}

            <div className="modal-row">
              <input
                value={nuevoMotivo}
                onChange={(event) => setNuevoMotivo(event.target.value)}
                placeholder="Nuevo motivo…"
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    crearMotivo();
                  }
                }}
              />

              <select
                value={nuevoTipoMovimiento}
                onChange={(event) => setNuevoTipoMovimiento(event.target.value)}
                title="Tipo de movimiento sugerido"
              >
                <option value="">Ingreso / Egreso</option>

                <option value="INGRESO">Ingreso</option>

                <option value="EGRESO">Egreso</option>
              </select>

              <button
                type="button"
                className="btn-primary"
                onClick={crearMotivo}
              >
                Agregar
              </button>

              <button type="button" onClick={fetchMotivos}>
                ↻ Recargar
              </button>
            </div>

            <div
              style={{
                maxHeight: 420,
                overflow: "auto",
                marginTop: 10,
              }}
            >
              <table className="tabla-transferencias">
                <thead>
                  <tr>
                    <th>Nombre</th>
                    <th>Tipo</th>
                    <th>Activo</th>
                    <th>Acciones</th>
                  </tr>
                </thead>

                <tbody>
                  {motivos.map((motivo) => (
                    <tr key={motivo.id_motivo}>
                      <td>{motivo.nombre}</td>

                      <td>
                        <select
                          value={motivo.tipo_movimiento || ""}
                          onChange={(event) =>
                            cambiarTipoMovimientoMotivo(
                              motivo.id_motivo,
                              event.target.value,
                            )
                          }
                        >
                          <option value="">Ingreso / Egreso</option>

                          <option value="INGRESO">Ingreso</option>

                          <option value="EGRESO">Egreso</option>
                        </select>
                      </td>

                      <td>{motivo.activo ? "SI" : "NO"}</td>

                      <td
                        style={{
                          display: "flex",
                          gap: 8,
                          flexWrap: "wrap",
                        }}
                      >
                        <button
                          type="button"
                          className="btn-light"
                          onClick={() =>
                            editarMotivo(motivo.id_motivo, motivo.nombre)
                          }
                        >
                          Editar
                        </button>

                        <button
                          type="button"
                          className="btn-light"
                          onClick={() =>
                            toggleMotivo(motivo.id_motivo, motivo.activo)
                          }
                        >
                          {motivo.activo ? "Desactivar" : "Activar"}
                        </button>

                        <button
                          type="button"
                          className="borrar-btn"
                          onClick={() => borrarMotivo(motivo.id_motivo)}
                        >
                          Eliminar
                        </button>
                      </td>
                    </tr>
                  ))}

                  {motivos.length === 0 && (
                    <tr>
                      <td colSpan={4}>Sin motivos.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className="modal-foot">
              <button type="button" onClick={() => setShowMotivos(false)}>
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}

      <RevertirMovimientosModal
        abierto={showReversion}
        onClose={() => setShowReversion(false)}
        onChanged={() => {
          fetchAjustes();
        }}
      />

      <ReferentesModal
        abierto={showReferentes}
        onClose={() => setShowReferentes(false)}
        onChanged={() => {
          fetchAjustes();
        }}
      />

      <RevisionesDropboxModal
        abierto={showRevisionesDropbox}
        onClose={() => setShowRevisionesDropbox(false)}
        onChanged={async () => {
          await fetchAjustes();
          await fetchCantidadRevisiones();
        }}
      />
    </div>
  );
}