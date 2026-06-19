import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../api/axiosConfig";
import "./../styles/transferencias.css";
import ReferentesModal from "../components/ReferentesModal";
import {useExcelFilters, ExcelFilterButton} from "../components/ExcelColumnFilter";

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
]);

const esMotivoOculto = (nombre) =>
  MOTIVOS_OCULTOS.has(normalizarMotivo(nombre));

export default function Ajustes() {
  const navigate = useNavigate();

  const [ajustes, setAjustes] = useState([]);
  const [filtro, setFiltro] = useState("");

  // Motivos
  const [showMotivos, setShowMotivos] = useState(false);

  const [motivos, setMotivos] = useState([]);

  const [nuevoMotivo, setNuevoMotivo] = useState("");

  const [nuevoTipoMovimiento, setNuevoTipoMovimiento] = useState("");

  const [motivosError, setMotivosError] = useState("");

  // Referentes
  const [showReferentes, setShowReferentes] = useState(false);

  // Paginado
  const [currentPage, setCurrentPage] = useState(1);

  const [pageSize, setPageSize] = useState(25);

  const [gotoPage, setGotoPage] = useState("");

  // Reversión por referencia
  const [showReversion, setShowReversion] = useState(false);

  const [referenciaReversion, setReferenciaReversion] = useState("");

  const [motivoReversion, setMotivoReversion] = useState("");

  const [movimientosReversion, setMovimientosReversion] = useState([]);

  const [buscandoReversion, setBuscandoReversion] = useState(false);

  const [confirmandoReversion, setConfirmandoReversion] = useState(false);

  const [errorReversion, setErrorReversion] = useState("");

  const fetchAjustes = () => {
    api
      .get("/ajustes")
      .then((response) => {
        setAjustes(Array.isArray(response.data) ? response.data : []);
      })
      .catch((error) => {
        console.error("Error cargando ajustes:", error);
      });
  };

  useEffect(() => {
    fetchAjustes();
  }, []);

  const consumirProduccion = async () => {
    try {
      const response = await api.post("/ajustes/consumir-produccion");

      alert(
        `Proceso finalizado. Ajustados: ${
          response.data.ajustados || 0
        }\nFallidos: ${response.data.fallidos || 0}`,
      );

      fetchAjustes();
    } catch (error) {
      alert(error.response?.data?.error || "Error al consumir producción");
    }
  };

  // =========================
  // Descargar plantilla
  // =========================

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

  // =========================
  // Importar Excel
  // =========================

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

      fetchAjustes();

      alert("Ajustes importados correctamente");
    } catch (error) {
      console.error("Error importando ajustes:", error);

      const mensaje =
        error.response?.data?.error ||
        (error.response?.data?.errores ? "Hay errores en el Excel" : null) ||
        "Error al importar ajustes";

      alert(mensaje);
    } finally {
      event.target.value = "";
    }
  };

  // =========================
  // Motivos
  // =========================

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

      await fetchMotivos();

      setMotivosError("");
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

      await fetchMotivos();

      setMotivosError("");
    } catch (error) {
      alert(error.response?.data?.error || "Error al editar motivo");
    }
  };

  const toggleMotivo = async (id, activo) => {
    try {
      await api.put(`/ajustes/motivos/${id}`, {
        activo: !activo,
      });

      await fetchMotivos();

      setMotivosError("");
    } catch (error) {
      alert(error.response?.data?.error || "Error al cambiar estado");
    }
  };

  const cambiarTipoMovimientoMotivo = async (id, tipoMovimiento) => {
    try {
      await api.put(`/ajustes/motivos/${id}`, {
        tipo_movimiento: tipoMovimiento || null,
      });

      await fetchMotivos();

      setMotivosError("");
    } catch (error) {
      alert(
        error.response?.data?.error || "Error al cambiar tipo de movimiento",
      );
    }
  };

  const borrarMotivo = async (id) => {
    const confirmado = window.confirm(
      "¿Borrar motivo? Solo se podrá borrar si nunca fue usado.",
    );

    if (!confirmado) {
      return;
    }

    try {
      await api.delete(`/ajustes/motivos/${id}`);

      await fetchMotivos();

      setMotivosError("");
    } catch (error) {
      alert(error.response?.data?.error || "Error al borrar motivo");
    }
  };

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

  // =========================
  // Filtro
  // =========================

  const filtrados = excel.rows.filter(
    (ajuste) =>
      !filtro ||
      Object.values(ajuste).some((value) =>
        String(value ?? "")
          .toLowerCase()
          .includes(filtro.toLowerCase()),
      ),
  );

  // =========================
  // Paginado
  // =========================

  const totalPages = Math.ceil(filtrados.length / pageSize) || 1;

  const paginated = filtrados.slice(
    (currentPage - 1) * pageSize,

    currentPage * pageSize,
  );

  const irPagina = (pagina) => {
    const numero = Number(pagina);

    if (!Number.isFinite(numero) || numero < 1 || numero > totalPages) {
      return;
    }

    setCurrentPage(numero);
  };

  const from = filtrados.length === 0 ? 0 : (currentPage - 1) * pageSize + 1;

  const to = Math.min(currentPage * pageSize, filtrados.length);

  // =========================
  // Reversión por referencia
  // =========================

  const abrirReversion = () => {
    setReferenciaReversion("");
    setMotivoReversion("");
    setMovimientosReversion([]);
    setErrorReversion("");
    setShowReversion(true);
  };

  const cerrarReversion = () => {
    if (buscandoReversion || confirmandoReversion) {
      return;
    }

    setShowReversion(false);
    setReferenciaReversion("");
    setMotivoReversion("");
    setMovimientosReversion([]);
    setErrorReversion("");
  };

  const buscarMovimientosReversion = async () => {
    const referencia = String(referenciaReversion || "").trim();

    if (!referencia) {
      setErrorReversion("Ingresá una referencia.");

      return;
    }

    try {
      setBuscandoReversion(true);
      setErrorReversion("");
      setMovimientosReversion([]);

      const response = await api.get(
        `/ajustes/reversiones/referencia/${encodeURIComponent(referencia)}`,
      );

      const movimientos = Array.isArray(response.data?.movimientos)
        ? response.data.movimientos
        : [];

      if (!movimientos.length) {
        setErrorReversion("No se encontraron movimientos para esa referencia.");

        return;
      }

      setMovimientosReversion(movimientos);
    } catch (error) {
      console.error("Error buscando referencia:", error);

      const mensaje =
        error.response?.data?.error ||
        error.response?.data?.detalle ||
        "No se pudo buscar la referencia.";

      const reversion = error.response?.data?.reversion;

      if (error.response?.status === 409 && reversion) {
        setErrorReversion(
          `${mensaje}. Fecha: ${
            reversion.fecha_reversion
              ? new Date(reversion.fecha_reversion).toLocaleString("es-AR")
              : ""
          }`,
        );
      } else {
        setErrorReversion(mensaje);
      }
    } finally {
      setBuscandoReversion(false);
    }
  };

  const confirmarReversion = async () => {
    const referencia = String(referenciaReversion || "").trim();

    if (!referencia) {
      setErrorReversion("Ingresá una referencia.");

      return;
    }

    if (!movimientosReversion.length) {
      setErrorReversion("Primero buscá la referencia.");

      return;
    }

    const confirmado = window.confirm(
      `Se revertirán todos los movimientos de la referencia "${referencia}".\n\n` +
        "Se crearán ajustes inversos y se modificará el stock.\n\n" +
        "Esta operación no puede ejecutarse dos veces.\n\n" +
        "¿Confirmás la reversión?",
    );

    if (!confirmado) {
      return;
    }

    try {
      setConfirmandoReversion(true);

      setErrorReversion("");

      const response = await api.post(
        `/ajustes/reversiones/referencia/${encodeURIComponent(referencia)}`,
        {
          confirmar: true,

          motivo: motivoReversion.trim() || null,
        },
      );

      const ajustesGenerados = Array.isArray(response.data?.ajustes_generados)
        ? response.data.ajustes_generados
        : [];

      const detalle = ajustesGenerados
        .map((ajuste) => `Ajuste ${ajuste.numero_ajuste} - ${ajuste.deposito}`)
        .join("\n");

      alert(
        `Referencia revertida correctamente.${detalle ? `\n\n${detalle}` : ""}`,
      );

      setShowReversion(false);
      setReferenciaReversion("");
      setMotivoReversion("");
      setMovimientosReversion([]);
      setErrorReversion("");

      fetchAjustes();
    } catch (error) {
      console.error("Error revirtiendo referencia:", error);

      const mensaje =
        error.response?.data?.error ||
        error.response?.data?.detalle ||
        "No se pudo revertir la referencia.";

      const faltantes = error.response?.data?.faltantes;

      if (Array.isArray(faltantes) && faltantes.length) {
        const detalle = faltantes
          .map(
            (item) =>
              `${item.codigo} en ${item.deposito}: necesita ${item.requerido}, disponible ${item.disponible}`,
          )
          .join("\n");

        setErrorReversion(`${mensaje}\n${detalle}`);
      } else {
        setErrorReversion(mensaje);
      }
    } finally {
      setConfirmandoReversion(false);
    }
  };

  return (
    <div className="transferencias-page">
      <h2 className="module-title">Ajustes</h2>

      <div className="acciones">
        <button type="button" onClick={() => navigate("/ajustes/nuevo")}>
          Nuevo ajuste
        </button>

        <button type="button" onClick={abrirReversion}>
          ↩ Revertir referencia
        </button>

        <button type="button" onClick={abrirMotivos}>
          🧾 Motivos
        </button>

        <button type="button" onClick={() => setShowReferentes(true)}>
          👤 Actuantes
        </button>

        <button
          type="button"
          onClick={() => {
            setFiltro("");

            excel.clearAllFilters();

            setCurrentPage(1);
          }}
        >
          Limpiar filtros
        </button>

        <button type="button" onClick={descargarPlantilla}>
          📤 Descargar plantilla
        </button>

        <label
          style={{
            cursor: "pointer",
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

        <input
          type="text"
          placeholder="Filtrar ajustes"
          value={filtro}
          onChange={(event) => {
            setFiltro(event.target.value);

            setCurrentPage(1);
          }}
        />

        <button
          type="button"
          className="btn-primary btn-ajuste-produccion"
          onClick={consumirProduccion}
        >
          ⚙️ Ajustar Registro de Producción
        </button>
      </div>

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

                    gap: "6px",
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

                <td>{ajuste.deposito}</td>

                <td>{ajuste.motivo || ""}</td>

                <td>{ajuste.referente || ""}</td>

                <td>{ajuste.remito_referencia || ""}</td>

                <td>{id}</td>
              </tr>
            );
          })}

          {paginated.length === 0 && (
            <tr>
              <td colSpan={8}>Sin ajustes.</td>
            </tr>
          )}
        </tbody>
      </table>

      <div className="paginado-pro">
        <div className="paginado-info">
          Mostrando {from}-{to} de {filtrados.length}
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

      {/* =========================
          MODAL MOTIVOS
      ========================= */}

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
              zIndex: 999999,
            }}
          >
            <div className="modal-head">
              <h3>Motivos de Ajuste</h3>

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

      {/* =========================
          MODAL REVERSIÓN
      ========================= */}

      {showReversion && (
        <div
          className="modal-backdrop"
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 999999,
            background: "rgba(0,0,0,0.45)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 20,
          }}
          onMouseDown={(event) => {
            if (event.target.classList.contains("modal-backdrop")) {
              cerrarReversion();
            }
          }}
        >
          <div
            className="modal-card"
            style={{
              position: "relative",
              zIndex: 1000000,
              width: "min(1100px, 96vw)",
              maxHeight: "92vh",
              overflowY: "auto",
            }}
          >
            <div className="modal-head">
              <h3>Revertir movimientos por referencia</h3>

              <button
                type="button"
                onClick={cerrarReversion}
                disabled={buscandoReversion || confirmandoReversion}
              >
                ✕
              </button>
            </div>

            <div
              className="modal-row"
              style={{
                alignItems: "flex-end",

                marginTop: 15,
              }}
            >
              <label
                style={{
                  flex: "1 1 300px",
                }}
              >
                Número de referencia
                <input
                  type="text"
                  value={referenciaReversion}
                  onChange={(event) => {
                    setReferenciaReversion(event.target.value);

                    setMovimientosReversion([]);

                    setErrorReversion("");
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();

                      buscarMovimientosReversion();
                    }
                  }}
                  placeholder="Ingresá la referencia exacta"
                  style={{
                    width: "100%",

                    marginTop: 5,
                  }}
                />
              </label>

              <button
                type="button"
                className="btn-primary"
                onClick={buscarMovimientosReversion}
                disabled={buscandoReversion || confirmandoReversion}
              >
                {buscandoReversion ? "Buscando..." : "Buscar movimientos"}
              </button>
            </div>

            {errorReversion && (
              <div
                className="nt-error"
                style={{
                  marginTop: 15,

                  whiteSpace: "pre-line",
                }}
              >
                {errorReversion}
              </div>
            )}

            {movimientosReversion.length > 0 && (
              <>
                <div
                  style={{
                    marginTop: 20,

                    marginBottom: 10,
                  }}
                >
                  <strong>
                    Se encontraron {movimientosReversion.length} movimientos.
                  </strong>

                  <div
                    style={{
                      marginTop: 5,

                      fontSize: 13,
                    }}
                  >
                    La columna “Reversión” muestra el movimiento inverso que se
                    aplicará.
                  </div>
                </div>

                <div
                  style={{
                    overflowX: "auto",
                  }}
                >
                  <table className="tabla-transferencias">
                    <thead>
                      <tr>
                        <th>Tipo</th>

                        <th>Número</th>

                        <th>Fecha</th>

                        <th>Depósito</th>

                        <th>Código</th>

                        <th>Descripción</th>

                        <th>Original</th>

                        <th>Reversión</th>

                        <th>Actuante</th>
                      </tr>
                    </thead>

                    <tbody>
                      {movimientosReversion.map((movimiento, index) => (
                        <tr
                          key={`${movimiento.tipo_original}-${movimiento.numero_original}-${movimiento.deposito}-${movimiento.codigo}-${index}`}
                        >
                          <td>{movimiento.tipo_original}</td>

                          <td>{movimiento.numero_original}</td>

                          <td>
                            {movimiento.fecha_real
                              ? new Date(
                                  movimiento.fecha_real,
                                ).toLocaleDateString("es-AR")
                              : ""}
                          </td>

                          <td>{movimiento.deposito}</td>

                          <td>{movimiento.codigo}</td>

                          <td>{movimiento.descripcion}</td>

                          <td
                            style={{
                              textAlign: "right",
                            }}
                          >
                            {movimiento.cantidad_original}
                          </td>

                          <td
                            style={{
                              textAlign: "right",

                              fontWeight: "bold",
                            }}
                          >
                            {movimiento.cantidad_reversion}
                          </td>

                          <td>{movimiento.referente || ""}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div
                  style={{
                    marginTop: 20,
                  }}
                >
                </div>
              </>
            )}

            <div
              className="modal-foot"
              style={{
                marginTop: 20,
                display: "flex",
                justifyContent: "flex-end",
                gap: 10,
              }}
            >
              <button
                type="button"
                onClick={cerrarReversion}
                disabled={buscandoReversion || confirmandoReversion}
              >
                Cancelar
              </button>

              <button
                type="button"
                className="btn-primary"
                onClick={confirmarReversion}
                disabled={
                  confirmandoReversion ||
                  buscandoReversion ||
                  !movimientosReversion.length
                }
              >
                {confirmandoReversion
                  ? "Revirtiendo..."
                  : "Confirmar reversión"}
              </button>
            </div>
          </div>
        </div>
      )}

      <ReferentesModal
        abierto={showReferentes}
        onClose={() => setShowReferentes(false)}
        onChanged={() => {
          fetchAjustes();
        }}
      />
    </div>
  );
}
