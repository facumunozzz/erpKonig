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
]);

const esMotivoOculto = (nombre) =>
  MOTIVOS_OCULTOS.has(normalizarMotivo(nombre));

export default function Ajustes() {
  const navigate = useNavigate();
  const [showRevisionesDropbox, setShowRevisionesDropbox] =
    useState(false);
  const [mostrarConsumosDropbox, setMostrarConsumosDropbox] =
    useState(false);
  const [cantidadRevisiones, setCantidadRevisiones] =
    useState(0);

  // LISTADO DE AJUSTES
  const [ajustes, setAjustes] = useState([]);
  const [loadingAjustes, setLoadingAjustes] = useState(false);

  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [gotoPage, setGotoPage] = useState("");

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

  // =====================================================
  // REFERENTES
  // =====================================================

  const [showReferentes, setShowReferentes] = useState(false);

  // =====================================================
  // REVERSIÓN
  // =====================================================

  const [showReversion, setShowReversion] = useState(false);

  // =====================================================
  // CARGAR AJUSTES
  // =====================================================

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

      /*
       * Compatibilidad con el backend anterior.
       *
       * Si devuelve un array, el paginado se hace
       * en el navegador.
       */
      if (Array.isArray(payload)) {
        setPaginacionServidor(false);
        setAjustes(payload);
        setTotalRows(payload.length);
        setServerTotalPages(Math.ceil(payload.length / pageSize) || 1);

        return;
      }

      /*
       * Si el backend devuelve:
       *
       * {
       *   data: [],
       *   total: 100,
       *   totalPages: 4
       * }
       *
       * utilizamos el paginado del servidor.
       */
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
      const response = await api.get(
        "/ajustes/alertas-consumo/pendientes",
      );
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
      console.error(
        "Error cargando revisiones Dropbox:",
        error,
      );
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
        error.response?.data?.error ||
          "Error al cambiar el tipo de movimiento",
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
      return ajuste.fecha
        ? new Date(ajuste.fecha).toLocaleString("es-AR")
        : "";
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
    return excel.rows;
  }, [excel.rows]);
  
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
  }, [
    paginacionServidor,
    filtrados,
    currentPage,
    pageSize,
  ]);

  const irPagina = (pagina) => {
    const numero = Number(pagina);

    if (
      !Number.isFinite(numero) ||
      numero < 1 ||
      numero > totalPages
    ) {
      return;
    }

    setCurrentPage(numero);
  };

  const cantidadTotalMostrada = paginacionServidor
    ? totalRows
    : filtrados.length;

  const from =
    cantidadTotalMostrada === 0
      ? 0
      : (currentPage - 1) * pageSize + 1;

  const to = Math.min(
    currentPage * pageSize,
    cantidadTotalMostrada,
  );

  // =====================================================
  // RENDER
  // =====================================================

  return (
    <div className="transferencias-page">
      <h2 className="module-title">Ajustes</h2>

      <div className="acciones">
        <button
          type="button"
          onClick={() => navigate("/ajustes/nuevo")}
        >
          Nuevo ajuste
        </button>

        <button
          type="button"
          onClick={() => setShowReversion(true)}
        >
          ↩ Revertir movimientos
        </button>

        <button type="button" className={
            cantidadRevisiones > 0
              ? "btn-con-revisiones"
              : ""
          }
          onClick={() =>
            setShowRevisionesDropbox(true)
          }
        >
          ⚠ Revisiones Dropbox
          {cantidadRevisiones > 0
            ? ` (${cantidadRevisiones})`
            : ""}
        </button>

        <button
          type="button"
          onClick={abrirMotivos}
        >
          🧾 Motivos
        </button>

        <button
          type="button"
          onClick={() => setShowReferentes(true)}
        >
          👤 Actuantes
        </button>

        <label style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            cursor: "pointer",
            padding: "6px 10px",
          }}
        >
          <input type="checkbox" checked={mostrarConsumosDropbox}
            onChange={(event) => {
              setMostrarConsumosDropbox(event.target.checked);
              setCurrentPage(1);
            }}
          />
          Mostrar consumos Dropbox
        </label>

        <button
          type="button"
          onClick={() => {
            excel.clearAllFilters();
            setCurrentPage(1);
          }}
        >
          Limpiar filtros
        </button>

        <button
          type="button"
          onClick={descargarPlantilla}
        >
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

        <button
          type="button"
          className="btn-primary btn-ajuste-produccion"
          onClick={consumirProduccion}
        >
          ⚙️ Ajustar Registro de Producción
        </button>
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
        </thead>

        <tbody>
          {paginated.map((ajuste) => {
            const id =
              ajuste.numero_ajuste ?? ajuste.id;

            return (
              <tr
                key={id}
                style={{
                  cursor: "pointer",
                }}
                onClick={() => {
                  if (
                    ajuste.estado === "BORRADOR"
                  ) {
                    navigate(
                      `/ajustes/nuevo?borradorId=${ajuste.id_borrador}`,
                    );
                  } else {
                    navigate(`/ajustes/${id}`);
                  }
                }}
                title="Ver detalle"
              >
                <td>
                  {ajuste.estado === "BORRADOR" ? (
                    <span className="badge-borrador">
                      BORRADOR
                    </span>
                  ) : ajuste.estado === "REVISAR" ? (
                    <span className="badge-revisar">
                      REVISAR
                    </span>
                  ) : (
                    <span className="badge-confirmado">
                      CONFIRMADO
                    </span>
                  )}
                </td>

                <td>
                  {ajuste.fecha
                    ? new Date(
                        ajuste.fecha,
                      ).toLocaleString("es-AR")
                    : ""}
                </td>

                <td>
                  {ajuste.fecha_real
                    ? new Date(
                        ajuste.fecha_real,
                      ).toLocaleDateString("es-AR")
                    : ""}
                </td>

                <td>{ajuste.deposito || ""}</td>
                <td>{ajuste.motivo || ""}</td>
                <td>{ajuste.referente || ""}</td>
                <td>
                  {ajuste.remito_referencia || ""}
                </td>
                <td>{id}</td>
              </tr>
            );
          })}

          {loadingAjustes && (
            <tr>
              <td colSpan={8}>
                Cargando ajustes...
              </td>
            </tr>
          )}

          {!loadingAjustes &&
            paginated.length === 0 && (
              <tr>
                <td colSpan={8}>
                  Sin ajustes.
                </td>
              </tr>
            )}
        </tbody>
      </table>

      {/* =================================================
          PAGINADO DE AJUSTES
      ================================================= */}

      <div className="paginado-pro">
        <div className="paginado-info">
          Mostrando {from}-{to} de{" "}
          {cantidadTotalMostrada}
        </div>

        <div className="paginado-size">
          <select
            value={pageSize}
            onChange={(event) => {
              setPageSize(
                Number(event.target.value),
              );

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
            onChange={(event) =>
              setGotoPage(event.target.value)
            }
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
            onClick={() =>
              irPagina(currentPage - 1)
            }
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
                Math.abs(
                  page - currentPage,
                ) <= 1,
            )
            .map((page, index, array) => (
              <React.Fragment key={page}>
                {index > 0 &&
                  page - array[index - 1] >
                    1 && (
                    <span className="pg-dots">
                      …
                    </span>
                  )}

                <button
                  type="button"
                  className={`pg-btn ${
                    currentPage === page
                      ? "activo"
                      : ""
                  }`}
                  onClick={() => irPagina(page)}
                >
                  {page}
                </button>
              </React.Fragment>
            ))}

          <button
            type="button"
            className="pg-btn"
            onClick={() =>
              irPagina(currentPage + 1)
            }
            disabled={
              currentPage === totalPages
            }
          >
            ▶
          </button>

          <button
            type="button"
            className="pg-btn"
            onClick={() =>
              irPagina(totalPages)
            }
            disabled={
              currentPage === totalPages
            }
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
            if (
              event.target.classList.contains(
                "modal-backdrop",
              )
            ) {
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

              <button
                type="button"
                onClick={() =>
                  setShowMotivos(false)
                }
              >
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
                onChange={(event) =>
                  setNuevoMotivo(
                    event.target.value,
                  )
                }
                placeholder="Nuevo motivo…"
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    crearMotivo();
                  }
                }}
              />

              <select
                value={nuevoTipoMovimiento}
                onChange={(event) =>
                  setNuevoTipoMovimiento(
                    event.target.value,
                  )
                }
                title="Tipo de movimiento sugerido"
              >
                <option value="">
                  Ingreso / Egreso
                </option>

                <option value="INGRESO">
                  Ingreso
                </option>

                <option value="EGRESO">
                  Egreso
                </option>
              </select>

              <button
                type="button"
                className="btn-primary"
                onClick={crearMotivo}
              >
                Agregar
              </button>

              <button
                type="button"
                onClick={fetchMotivos}
              >
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
                          value={
                            motivo.tipo_movimiento ||
                            ""
                          }
                          onChange={(event) =>
                            cambiarTipoMovimientoMotivo(
                              motivo.id_motivo,
                              event.target.value,
                            )
                          }
                        >
                          <option value="">
                            Ingreso / Egreso
                          </option>

                          <option value="INGRESO">
                            Ingreso
                          </option>

                          <option value="EGRESO">
                            Egreso
                          </option>
                        </select>
                      </td>

                      <td>
                        {motivo.activo
                          ? "SI"
                          : "NO"}
                      </td>

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
                            editarMotivo(
                              motivo.id_motivo,
                              motivo.nombre,
                            )
                          }
                        >
                          Editar
                        </button>

                        <button
                          type="button"
                          className="btn-light"
                          onClick={() =>
                            toggleMotivo(
                              motivo.id_motivo,
                              motivo.activo,
                            )
                          }
                        >
                          {motivo.activo
                            ? "Desactivar"
                            : "Activar"}
                        </button>

                        <button
                          type="button"
                          className="borrar-btn"
                          onClick={() =>
                            borrarMotivo(
                              motivo.id_motivo,
                            )
                          }
                        >
                          Eliminar
                        </button>
                      </td>
                    </tr>
                  ))}

                  {motivos.length === 0 && (
                    <tr>
                      <td colSpan={4}>
                        Sin motivos.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className="modal-foot">
              <button
                type="button"
                onClick={() =>
                  setShowMotivos(false)
                }
              >
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
        onClose={() =>
          setShowReferentes(false)
        }
        onChanged={() => {
          fetchAjustes();
        }}
      />

      <RevisionesDropboxModal
        abierto={showRevisionesDropbox}
        onClose={() =>
          setShowRevisionesDropbox(false)
        }
        onChanged={async () => {
          await fetchAjustes();
          await fetchCantidadRevisiones();
        }}
      />
    </div>
  );
}