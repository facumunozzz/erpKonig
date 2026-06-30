import React, { useMemo, useState } from "react";
import api from "../api/axiosConfig";
import "./../styles/transferencias.css";

const MOVIMIENTOS_POR_PAGINA = 50;

export default function RevertirMovimientosModal({
  abierto,
  onClose,
  onChanged,
}) {
  const [modoBusquedaReversion, setModoBusquedaReversion] =
    useState("referencia");

  const [referenciaReversion, setReferenciaReversion] = useState("");
  const [obraReversion, setObraReversion] = useState("");
  const [versionReversion, setVersionReversion] = useState("");
  const [motivoReversion, setMotivoReversion] = useState("");

  const [movimientosReversion, setMovimientosReversion] = useState([]);

  /*
   * Se utiliza Set en lugar de Array.
   *
   * Esto hace más rápida la validación de los checkbox,
   * especialmente cuando hay muchos movimientos.
   */
  const [
    movimientosSeleccionadosReversion,
    setMovimientosSeleccionadosReversion,
  ] = useState(() => new Set());

  const [buscandoReversion, setBuscandoReversion] = useState(false);
  const [confirmandoReversion, setConfirmandoReversion] = useState(false);
  const [errorReversion, setErrorReversion] = useState("");
  const [tiempoBusquedaReversion, setTiempoBusquedaReversion] = useState(null);

  const [paginaReversion, setPaginaReversion] = useState(1);


  // =====================================================
  // REVERSIÓN: LIMPIEZA Y APERTURA
  // =====================================================

  const limpiarResultadosReversion = () => {
    setMovimientosReversion([]);
    setMovimientosSeleccionadosReversion(new Set());
    setErrorReversion("");
    setTiempoBusquedaReversion(null);
    setPaginaReversion(1);
  };

  const limpiarReversion = () => {
    setModoBusquedaReversion("referencia");
    setReferenciaReversion("");
    setObraReversion("");
    setVersionReversion("");
    setMotivoReversion("");

    limpiarResultadosReversion();
  };

  const cerrarReversion = () => {
    if (buscandoReversion || confirmandoReversion) {
      return;
    }

    onClose();
    limpiarReversion();
  };

  const cambiarModoBusquedaReversion = (modo) => {
    setModoBusquedaReversion(modo);
    setReferenciaReversion("");
    setObraReversion("");
    setVersionReversion("");

    limpiarResultadosReversion();
  };

  // =====================================================
  // REVERSIÓN: PAGINADO
  // =====================================================

  const totalPaginasReversion = Math.max(
    1,
    Math.ceil(
      movimientosReversion.length / MOVIMIENTOS_POR_PAGINA,
    ),
  );

  const movimientosReversionPaginados = useMemo(() => {
    const inicio =
      (paginaReversion - 1) * MOVIMIENTOS_POR_PAGINA;

    return movimientosReversion.slice(
      inicio,
      inicio + MOVIMIENTOS_POR_PAGINA,
    );
  }, [movimientosReversion, paginaReversion]);

  const desdeReversion =
    movimientosReversion.length === 0
      ? 0
      : (paginaReversion - 1) *
          MOVIMIENTOS_POR_PAGINA +
        1;

  const hastaReversion = Math.min(
    paginaReversion * MOVIMIENTOS_POR_PAGINA,
    movimientosReversion.length,
  );

  // =====================================================
  // REVERSIÓN: SELECCIÓN
  // =====================================================

  const alternarMovimientoReversion = (idMovimiento) => {
    if (!idMovimiento) {
      return;
    }

    setMovimientosSeleccionadosReversion((anteriores) => {
      const nuevos = new Set(anteriores);

      if (nuevos.has(idMovimiento)) {
        nuevos.delete(idMovimiento);
      } else {
        nuevos.add(idMovimiento);
      }

      return nuevos;
    });
  };

  const seleccionarPaginaReversion = () => {
    setMovimientosSeleccionadosReversion((anteriores) => {
      const nuevos = new Set(anteriores);

      movimientosReversionPaginados.forEach((movimiento) => {
        if (
          !movimiento.ya_revertido &&
          movimiento.id_movimiento_original
        ) {
          nuevos.add(movimiento.id_movimiento_original);
        }
      });

      return nuevos;
    });
  };

  const seleccionarTodosReversion = () => {
    const seleccionados = new Set();

    movimientosReversion.forEach((movimiento) => {
      if (
        !movimiento.ya_revertido &&
        movimiento.id_movimiento_original
      ) {
        seleccionados.add(
          movimiento.id_movimiento_original,
        );
      }
    });

    setMovimientosSeleccionadosReversion(seleccionados);
  };

  const quitarSeleccionPaginaReversion = () => {
    setMovimientosSeleccionadosReversion((anteriores) => {
      const nuevos = new Set(anteriores);

      movimientosReversionPaginados.forEach((movimiento) => {
        nuevos.delete(movimiento.id_movimiento_original);
      });

      return nuevos;
    });
  };

  const quitarSeleccionReversion = () => {
    setMovimientosSeleccionadosReversion(new Set());
  };

  // =====================================================
  // REVERSIÓN: BÚSQUEDA
  // =====================================================

  const buscarMovimientosReversion = async () => {
    const referencia = String(
      referenciaReversion || "",
    ).trim();

    const obra = String(obraReversion || "").trim();
    const version = String(versionReversion || "").trim();

    if (
      modoBusquedaReversion === "referencia" &&
      !referencia
    ) {
      setErrorReversion(
        "Ingresá un número de referencia.",
      );

      return;
    }

    if (
      modoBusquedaReversion === "obra_version" &&
      (!obra || !version)
    ) {
      setErrorReversion(
        "Ingresá la obra y la versión.",
      );

      return;
    }

    try {
      setBuscandoReversion(true);

      limpiarResultadosReversion();

      const response = await api.get(
        "/ajustes/reversiones/buscar",
        {
          params:
            modoBusquedaReversion === "referencia"
              ? {
                  modo: "referencia",
                  referencia,
                }
              : {
                  modo: "obra_version",
                  obra,
                  version,
                },
        },
      );

      const movimientos = Array.isArray(
        response.data?.movimientos,
      )
        ? response.data.movimientos
        : [];

      setTiempoBusquedaReversion(
        Number(response.data?.tiempo_ms || 0),
      );

      if (!movimientos.length) {
        setErrorReversion(
          modoBusquedaReversion === "referencia"
            ? "No se encontraron movimientos para esa referencia."
            : "No se encontraron movimientos para esa obra y versión.",
        );

        return;
      }

      setMovimientosReversion(movimientos);

      /*
       * No se seleccionan automáticamente.
       *
       * La selección automática de miles de registros
       * era una de las causas del bloqueo.
       */
      setMovimientosSeleccionadosReversion(new Set());
      setPaginaReversion(1);
    } catch (error) {
      console.error(
        "Error buscando movimientos:",
        error,
      );

      setErrorReversion(
        error.response?.data?.error ||
          error.response?.data?.detalle ||
          "No se pudieron buscar los movimientos.",
      );
    } finally {
      setBuscandoReversion(false);
    }
  };

  // =====================================================
  // REVERSIÓN: CONFIRMACIÓN
  // =====================================================

  const confirmarReversion = async () => {
    const referencia = String(
      referenciaReversion || "",
    ).trim();

    const obra = String(obraReversion || "").trim();
    const version = String(versionReversion || "").trim();

    if (!movimientosSeleccionadosReversion.size) {
      setErrorReversion(
        "Seleccioná al menos un movimiento para revertir.",
      );

      return;
    }

    const descripcionBusqueda =
      modoBusquedaReversion === "referencia"
        ? `la referencia "${referencia}"`
        : `la obra "${obra}", versión "${version}"`;

    const confirmado = window.confirm(
      `Se revertirán ${movimientosSeleccionadosReversion.size} movimientos de ${descripcionBusqueda}.\n\n` +
        "Se crearán ajustes inversos y se modificará el stock.\n\n" +
        "¿Confirmás la reversión?",
    );

    if (!confirmado) {
      return;
    }

    try {
      setConfirmandoReversion(true);
      setErrorReversion("");

      const response = await api.post(
        "/ajustes/reversiones/revertir",
        {
          modo: modoBusquedaReversion,

          referencia:
            modoBusquedaReversion === "referencia"
              ? referencia
              : null,

          obra:
            modoBusquedaReversion === "obra_version"
              ? obra
              : null,

          version:
            modoBusquedaReversion === "obra_version"
              ? version
              : null,

          movimientos: Array.from(
            movimientosSeleccionadosReversion,
          ),

          motivo: motivoReversion.trim() || null,

          confirmar: true,
        },
      );

      const ajustesGenerados = Array.isArray(
        response.data?.ajustes_generados,
      )
        ? response.data.ajustes_generados
        : [];

      const detalle = ajustesGenerados
        .map(
          (ajuste) =>
            `Ajuste ${ajuste.numero_ajuste} - ${ajuste.deposito}`,
        )
        .join("\n");

      alert(
        `Movimientos revertidos correctamente.${
          detalle ? `\n\n${detalle}` : ""
        }`,
      );

      onClose();
      limpiarReversion();

      if (typeof onChanged === "function") {
        await onChanged();
      }
    } catch (error) {
      console.error(
        "Error revirtiendo movimientos:",
        error,
      );

      const mensaje =
        error.response?.data?.error ||
        error.response?.data?.detalle ||
        "No se pudieron revertir los movimientos.";

      const faltantes = error.response?.data?.faltantes;

      if (
        Array.isArray(faltantes) &&
        faltantes.length
      ) {
        const detalle = faltantes
          .map(
            (item) =>
              `${item.codigo} en ${item.deposito}: necesita ${item.requerido}, disponible ${item.disponible}`,
          )
          .join("\n");

        setErrorReversion(
          `${mensaje}\n\n${detalle}`,
        );
      } else {
        setErrorReversion(mensaje);
      }
    } finally {
      setConfirmandoReversion(false);
    }
  };


  if (!abierto) {
    return null;
  }

  return (
    <>
      {/* =================================================
          MODAL DE REVERSIÓN
      ================================================= */}

      {abierto && (
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
            if (
              event.target.classList.contains(
                "modal-backdrop",
              )
            ) {
              cerrarReversion();
            }
          }}
        >
          <div
            className="modal-card"
            style={{
              position: "relative",
              zIndex: 1000000,
              width: "min(1200px, 96vw)",
              maxHeight: "92vh",
              overflowY: "auto",
            }}
          >
            <div className="modal-head">
              <h3>Revertir movimientos</h3>

              <button
                type="button"
                onClick={cerrarReversion}
                disabled={
                  buscandoReversion ||
                  confirmandoReversion
                }
              >
                ✕
              </button>
            </div>

            {/* MODO DE BÚSQUEDA */}

            <div
              style={{
                display: "flex",
                gap: 24,
                flexWrap: "wrap",
                marginTop: 18,
                marginBottom: 18,
                padding: 14,
                background: "#f5f7fa",
                border: "1px solid #dfe3e8",
                borderRadius: 7,
              }}
            >
              <label
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  cursor: "pointer",
                  fontWeight: 600,
                }}
              >
                <input
                  type="radio"
                  name="modoBusquedaReversion"
                  value="referencia"
                  checked={
                    modoBusquedaReversion ===
                    "referencia"
                  }
                  onChange={() =>
                    cambiarModoBusquedaReversion(
                      "referencia",
                    )
                  }
                  disabled={
                    buscandoReversion ||
                    confirmandoReversion
                  }
                />

                Buscar por referencia
              </label>

              <label
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  cursor: "pointer",
                  fontWeight: 600,
                }}
              >
                <input
                  type="radio"
                  name="modoBusquedaReversion"
                  value="obra_version"
                  checked={
                    modoBusquedaReversion ===
                    "obra_version"
                  }
                  onChange={() =>
                    cambiarModoBusquedaReversion(
                      "obra_version",
                    )
                  }
                  disabled={
                    buscandoReversion ||
                    confirmandoReversion
                  }
                />

                Buscar por obra y versión
              </label>
            </div>

            {/* CAMPOS DE BÚSQUEDA */}

            <div
              className="modal-row"
              style={{
                alignItems: "flex-end",
                marginTop: 15,
                gap: 12,
                flexWrap: "wrap",
              }}
            >
              {modoBusquedaReversion ===
              "referencia" ? (
                <label
                  style={{
                    flex: "1 1 350px",
                  }}
                >
                  Número de referencia

                  <input
                    type="text"
                    value={referenciaReversion}
                    onChange={(event) => {
                      setReferenciaReversion(
                        event.target.value,
                      );

                      limpiarResultadosReversion();
                    }}
                    onKeyDown={(event) => {
                      if (
                        event.key === "Enter"
                      ) {
                        event.preventDefault();

                        buscarMovimientosReversion();
                      }
                    }}
                    placeholder="Ingresá la referencia exacta"
                    disabled={
                      buscandoReversion ||
                      confirmandoReversion
                    }
                    autoFocus
                    style={{
                      width: "100%",
                      marginTop: 5,
                    }}
                  />
                </label>
              ) : (
                <>
                  <label
                    style={{
                      flex: "1 1 260px",
                    }}
                  >
                    Obra

                    <input
                      type="text"
                      value={obraReversion}
                      onChange={(event) => {
                        setObraReversion(
                          event.target.value,
                        );

                        limpiarResultadosReversion();
                      }}
                      placeholder="Ingresá la obra"
                      disabled={
                        buscandoReversion ||
                        confirmandoReversion
                      }
                      autoFocus
                      style={{
                        width: "100%",
                        marginTop: 5,
                      }}
                    />
                  </label>

                  <label
                    style={{
                      flex: "1 1 220px",
                    }}
                  >
                    Versión

                    <input
                      type="text"
                      value={versionReversion}
                      onChange={(event) => {
                        setVersionReversion(
                          event.target.value,
                        );

                        limpiarResultadosReversion();
                      }}
                      onKeyDown={(event) => {
                        if (
                          event.key === "Enter"
                        ) {
                          event.preventDefault();

                          buscarMovimientosReversion();
                        }
                      }}
                      placeholder="Ingresá la versión"
                      disabled={
                        buscandoReversion ||
                        confirmandoReversion
                      }
                      style={{
                        width: "100%",
                        marginTop: 5,
                      }}
                    />
                  </label>
                </>
              )}

              <button
                type="button"
                className="btn-primary"
                onClick={buscarMovimientosReversion}
                disabled={
                  buscandoReversion ||
                  confirmandoReversion
                }
                style={{
                  minWidth: 180,
                }}
              >
                {buscandoReversion
                  ? "Buscando..."
                  : "Buscar movimientos"}
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

            {/* RESULTADOS */}

            {movimientosReversion.length > 0 && (
              <>
                <div
                  style={{
                    marginTop: 20,
                    marginBottom: 10,
                  }}
                >
                  <strong>
                    Se encontraron{" "}
                    {movimientosReversion.length}{" "}
                    movimientos.
                  </strong>

                  <div
                    style={{
                      marginTop: 5,
                      fontSize: 13,
                    }}
                  >
                    La columna “Reversión” muestra
                    el movimiento inverso que se
                    aplicará.
                  </div>

                  {tiempoBusquedaReversion !==
                    null && (
                    <div
                      style={{
                        marginTop: 5,
                        fontSize: 13,
                      }}
                    >
                      Tiempo de búsqueda:{" "}
                      {(
                        tiempoBusquedaReversion /
                        1000
                      ).toFixed(2)}{" "}
                      segundos
                    </div>
                  )}

                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                      marginTop: 12,
                      flexWrap: "wrap",
                    }}
                  >
                    <button
                      type="button"
                      onClick={
                        seleccionarPaginaReversion
                      }
                      disabled={
                        buscandoReversion ||
                        confirmandoReversion
                      }
                    >
                      Seleccionar página
                    </button>

                    <button
                      type="button"
                      onClick={
                        quitarSeleccionPaginaReversion
                      }
                      disabled={
                        buscandoReversion ||
                        confirmandoReversion
                      }
                    >
                      Quitar página
                    </button>

                    <button
                      type="button"
                      onClick={
                        seleccionarTodosReversion
                      }
                      disabled={
                        buscandoReversion ||
                        confirmandoReversion
                      }
                    >
                      Seleccionar todos
                    </button>

                    <button
                      type="button"
                      onClick={
                        quitarSeleccionReversion
                      }
                      disabled={
                        buscandoReversion ||
                        confirmandoReversion
                      }
                    >
                      Quitar selección
                    </button>

                    <span
                      style={{
                        fontWeight: 600,
                      }}
                    >
                      Seleccionados:{" "}
                      {
                        movimientosSeleccionadosReversion.size
                      }
                    </span>
                  </div>
                </div>

                {/* TABLA DE MOVIMIENTOS */}

                <div
                  style={{
                    overflowX: "auto",
                  }}
                >
                  <table className="tabla-transferencias">
                    <thead>
                      <tr>
                        <th
                          style={{
                            width: 80,
                            textAlign: "center",
                          }}
                        >
                          Seleccionar
                        </th>

                        <th>Estado</th>
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
                      {movimientosReversionPaginados.map(
                        (movimiento) => {
                          const idMovimiento =
                            movimiento.id_movimiento_original;

                          const seleccionado =
                            movimientosSeleccionadosReversion.has(
                              idMovimiento,
                            );

                          return (
                            <tr
                              key={idMovimiento}
                              style={{
                                opacity:
                                  movimiento.ya_revertido
                                    ? 0.55
                                    : 1,

                                background:
                                  movimiento.ya_revertido
                                    ? "#f3f3f3"
                                    : undefined,
                              }}
                            >
                              <td
                                style={{
                                  textAlign:
                                    "center",
                                }}
                              >
                                <input
                                  type="checkbox"
                                  checked={
                                    seleccionado
                                  }
                                  disabled={
                                    movimiento.ya_revertido ||
                                    buscandoReversion ||
                                    confirmandoReversion
                                  }
                                  onChange={() =>
                                    alternarMovimientoReversion(
                                      idMovimiento,
                                    )
                                  }
                                  title={
                                    movimiento.ya_revertido
                                      ? "Este movimiento ya fue revertido"
                                      : "Seleccionar movimiento"
                                  }
                                />
                              </td>

                              <td>
                                {movimiento.ya_revertido ? (
                                  <span
                                    style={{
                                      display:
                                        "inline-block",
                                      padding:
                                        "3px 8px",
                                      borderRadius:
                                        10,
                                      background:
                                        "#e5e7eb",
                                      fontSize: 12,
                                      fontWeight:
                                        600,
                                    }}
                                  >
                                    YA REVERTIDO
                                  </span>
                                ) : (
                                  <span
                                    style={{
                                      display:
                                        "inline-block",
                                      padding:
                                        "3px 8px",
                                      borderRadius:
                                        10,
                                      background:
                                        "#dcfce7",
                                      fontSize: 12,
                                      fontWeight:
                                        600,
                                    }}
                                  >
                                    DISPONIBLE
                                  </span>
                                )}
                              </td>

                              <td>
                                {movimiento.tipo_original ||
                                  ""}
                              </td>

                              <td>
                                {movimiento.numero_original ||
                                  ""}
                              </td>

                              <td>
                                {movimiento.fecha_real
                                  ? new Date(
                                      movimiento.fecha_real,
                                    ).toLocaleDateString(
                                      "es-AR",
                                    )
                                  : ""}
                              </td>

                              <td>
                                {movimiento.deposito ||
                                  ""}
                              </td>

                              <td>
                                {movimiento.codigo ||
                                  ""}
                              </td>

                              <td>
                                {movimiento.descripcion ||
                                  ""}
                              </td>

                              <td
                                style={{
                                  textAlign:
                                    "right",
                                }}
                              >
                                {
                                  movimiento.cantidad_original
                                }
                              </td>

                              <td
                                style={{
                                  textAlign:
                                    "right",
                                  fontWeight:
                                    "bold",
                                }}
                              >
                                {
                                  movimiento.cantidad_reversion
                                }
                              </td>

                              <td>
                                {movimiento.referente ||
                                  ""}
                              </td>
                            </tr>
                          );
                        },
                      )}
                    </tbody>
                  </table>
                </div>

                {/* PAGINADO DEL MODAL */}

                <div
                  style={{
                    display: "flex",
                    justifyContent:
                      "space-between",
                    alignItems: "center",
                    gap: 10,
                    marginTop: 12,
                    flexWrap: "wrap",
                  }}
                >
                  <span>
                    Mostrando {desdeReversion}-
                    {hastaReversion} de{" "}
                    {movimientosReversion.length}
                  </span>

                  <span>
                    Página {paginaReversion} de{" "}
                    {totalPaginasReversion}
                  </span>

                  <div
                    style={{
                      display: "flex",
                      gap: 8,
                    }}
                  >
                    <button
                      type="button"
                      onClick={() =>
                        setPaginaReversion(
                          (pagina) =>
                            Math.max(
                              1,
                              pagina - 1,
                            ),
                        )
                      }
                      disabled={
                        paginaReversion <= 1 ||
                        buscandoReversion ||
                        confirmandoReversion
                      }
                    >
                      Anterior
                    </button>

                    <button
                      type="button"
                      onClick={() =>
                        setPaginaReversion(
                          (pagina) =>
                            Math.min(
                              totalPaginasReversion,
                              pagina + 1,
                            ),
                        )
                      }
                      disabled={
                        paginaReversion >=
                          totalPaginasReversion ||
                        buscandoReversion ||
                        confirmandoReversion
                      }
                    >
                      Siguiente
                    </button>
                  </div>
                </div>

                {/* MOTIVO OPCIONAL */}

                <label
                  style={{
                    display: "block",
                    marginTop: 18,
                  }}
                >
                  Observación de la reversión
                  (opcional)

                  <textarea
                    value={motivoReversion}
                    onChange={(event) =>
                      setMotivoReversion(
                        event.target.value,
                      )
                    }
                    disabled={
                      buscandoReversion ||
                      confirmandoReversion
                    }
                    rows={3}
                    placeholder="Indicá el motivo u observación de la reversión"
                    style={{
                      display: "block",
                      width: "100%",
                      marginTop: 5,
                      resize: "vertical",
                    }}
                  />
                </label>
              </>
            )}

            {/* BOTONES DEL MODAL */}

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
                disabled={
                  buscandoReversion ||
                  confirmandoReversion
                }
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
                  movimientosSeleccionadosReversion.size ===
                    0
                }
              >
                {confirmandoReversion
                  ? "Revirtiendo..."
                  : `Confirmar reversión (${movimientosSeleccionadosReversion.size})`}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
