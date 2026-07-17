import React, { useEffect, useMemo, useState } from "react";
import api from "../api/axiosConfig";
import "./../styles/stockRecortes.css";
import {useExcelFilters, ExcelFilterButton} from "../components/ExcelColumnFilter";

const RECORTES_HEADERS = [
  ["codigo", "Código"],
  ["descripcion", "Descripción"],
  ["medida", "Medida"],
  ["obra_version", "Obra / Versión"],
  ["cantidad", "Cantidad"],
  ["ubicaciones_label", "Ubicaciones"],
];

const FORM_INICIAL = {
  codigo: "",
  descripcion: "",
  medida: "",
  obra_version: "",
  cantidad: "",
  id_ubicacion_recorte: "",
};

function StockRecortes() {
  const [recortes, setRecortes] = useState([]);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState("");

  const [modalNuevo, setModalNuevo] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [form, setForm] = useState(FORM_INICIAL);

  const [detalleAbierto, setDetalleAbierto] = useState(null);
  const [ubicaciones, setUbicaciones] = useState([]);
  const [modalUbicaciones, setModalUbicaciones] =
    useState(false);
  const [nuevaUbicacion, setNuevaUbicacion] =
    useState("");
  const [editandoUbicacionId, setEditandoUbicacionId] =
    useState(null);
  const [editandoUbicacionNombre, setEditandoUbicacionNombre] =
    useState("");

  const cargarRecortes = async () => {
    try {
      setCargando(true);
      setError("");

      const response = await api.get("/api/stock-recortes");

      setRecortes(
        Array.isArray(response.data)
          ? response.data
          : []
      );
    } catch (err) {
      console.error("Error cargando stock de recortes:", err);

      setError(
        err.response?.data?.error ||
          err.response?.data?.detalle ||
          "No se pudo cargar el stock de recortes."
      );
    } finally {
      setCargando(false);
    }
  };

  useEffect(() => {
    cargarRecortes();
  }, []);

  const cargarUbicaciones = async () => {
    try {
      const response = await api.get(
        "/api/stock-recortes/ubicaciones"
      );

      const lista = Array.isArray(response.data)
        ? response.data
        : [];

      setUbicaciones(lista);

      return lista;
    } catch (err) {
      console.error(
        "Error cargando ubicaciones de recortes:",
        err
      );

      alert("No se pudieron cargar las ubicaciones.");
      return [];
    }
  };

  const getRecorteFilterValue = (item, key) => {
    const valores = {
      codigo: item.codigo ?? "",
      descripcion: item.descripcion ?? "",
      medida: item.medida ?? "",
      obra_version: item.obra_version ?? "",
      cantidad: item.cantidad ?? 0,
      ubicaciones_label:
        item.ubicaciones_label ?? "",
    };

    return valores[key] ?? "";
  };

  const excelColumns = useMemo(
    () =>
      RECORTES_HEADERS.map(([key, label]) => ({
        key,
        label,
        getValue: (row) =>
          getRecorteFilterValue(row, key),
      })),
    []
  );

  const excel = useExcelFilters(
    recortes,
    excelColumns
  );

  const cambiarForm = (campo, valor) => {
    setForm((prev) => ({
      ...prev,
      [campo]: valor,
    }));
  };

  const abrirNuevo = async () => {
  const lista = await cargarUbicaciones();

  const general = lista.find(
    (ubicacion) =>
      String(ubicacion.nombre || "")
        .trim()
        .toUpperCase() === "GENERAL"
  );

  setForm({
    ...FORM_INICIAL,
    id_ubicacion_recorte: general
      ? String(general.id_ubicacion_recorte)
      : "",
  });

  setModalNuevo(true);
};

  const cerrarNuevo = () => {
    if (guardando) return;

    setModalNuevo(false);
    setForm(FORM_INICIAL);
  };

  const buscarDescripcionPorCodigo = async (codigoIngresado) => {
  const codigo = String(codigoIngresado || "")
    .trim()
    .toUpperCase();

  if (!codigo) {
    setForm((prev) => ({
      ...prev,
      codigo: "",
      descripcion: "",
    }));

    return;
  }

  try {
    const response = await api.get(
      `/articulos/codigo/${encodeURIComponent(codigo)}`
    );

    const articulo = response.data || {};

    setForm((prev) => ({
      ...prev,
      codigo: String(articulo.codigo || codigo)
        .trim()
        .toUpperCase(),
      descripcion: articulo.descripcion || "",
    }));
  } catch (err) {
    console.error("No se encontró el artículo:", err);

    setForm((prev) => ({
      ...prev,
      codigo,
      descripcion: "Artículo no encontrado",
    }));
  }
};

  const guardarNuevo = async () => {
    const codigo = form.codigo.trim();
    const descripcion = form.descripcion.trim();
    const medida = form.medida.trim();
    const id_ubicacion_recorte = Number(
      form.id_ubicacion_recorte
    );
    const cantidad = Number(form.cantidad);
    const obra_version = form.obra_version.trim();

    if (!codigo) {
      alert("Debe ingresar el código.");
      return;
    }

    if (!descripcion) {
      alert("Debe ingresar la descripción.");
      return;
    }

    if (!medida) {
      alert("Debe ingresar la medida.");
      return;
    }

    if (
      !Number.isInteger(id_ubicacion_recorte) ||
      id_ubicacion_recorte <= 0
    ) {
      alert("Debe seleccionar una ubicación.");
      return;
    }

    if (!Number.isFinite(cantidad) || cantidad < 0) {
      alert("La cantidad no es válida.");
      return;
    }

    try {
      setGuardando(true);

      await api.post("/api/stock-recortes", {
        codigo,
        descripcion,
        medida,
        obra_version,
        id_ubicacion_recorte,
        cantidad,
      });

      cerrarNuevo();
      await cargarRecortes();
    } catch (err) {
      console.error("Error creando recorte:", err);

      alert(
        err.response?.data?.error ||
          err.response?.data?.detalle ||
          "No se pudo crear el recorte."
      );
    } finally {
      setGuardando(false);
    }
  };

  const eliminarRecorte = async (item) => {
    const confirmar = window.confirm(
      `¿Eliminar el recorte "${item.codigo}"?\n\n` +
        `Esta acción lo quitará del listado, pero conservará el historial en la base de datos.`
    );

    if (!confirmar) return;

    try {
      await api.delete(`/api/stock-recortes/${item.id_recorte}`);
      await cargarRecortes();
    } catch (err) {
      console.error("Error eliminando recorte:", err);

      alert(
        err.response?.data?.error ||
          err.response?.data?.detalle ||
          "No se pudo eliminar el recorte."
      );
    }
  };

  return (
    <div className="stock-recortes-container">
      <div className="stock-recortes-header">
        <h2 className="module-title">
          Stock Recortes
        </h2>

        <div className="stock-recortes-botones">
          <button
            className="btn-recorte-principal"
            onClick={abrirNuevo}
          >
            Nuevo recorte
          </button>

          <button
            className="btn-recorte-principal"
            onClick={async () => {
              await cargarUbicaciones();
              setModalUbicaciones(true);
            }}
          >
            Administrar ubicaciones
          </button>

          <button className="btn-recorte-principal" onClick={cargarRecortes}> Actualizar </button>

          <button
            className="btn-recorte-principal"
            onClick={() => {
              setBusqueda("");
              excel.clearAllFilters?.();
            }}
          >
            Limpiar filtros
          </button>
        </div>
      </div>

      {cargando && (
        <div className="stock-recortes-mensaje">
          Cargando stock de recortes...
        </div>
      )}

      {error && (
        <div className="stock-recortes-error">
          {error}
        </div>
      )}

      {!cargando && !error && (
        <div className="stock-recortes-tabla-wrap">
          <table className="stock-recortes-tabla">
            <thead>
              <tr>
                {RECORTES_HEADERS.map(([key, label]) => (
                  <th
                    key={key}
                    className={
                      key === "cantidad"
                        ? "numero"
                        : ""
                    }
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

                <th className="acciones-columna">
                  Acciones
                </th>
              </tr>
            </thead>

            <tbody>
              {excel.rows.length === 0 ? (
                <tr>
                  <td colSpan="7" className="sin-resultados">
                    No hay recortes para mostrar.
                  </td>
                </tr>
              ) : (
                excel.rows.map((item) => {
                  const abierto =
                    detalleAbierto === item.id_recorte;

                  return (
                    <React.Fragment key={item.id_recorte}>
                      <tr>
                        <td>{item.codigo}</td>
                        <td>{item.descripcion}</td>
                        <td>{item.medida}</td>
                        <td>{item.obra_version || ""}</td>

                        <td className="numero">
                          {Number(item.cantidad || 0).toLocaleString(
                            "es-AR",
                            {
                              minimumFractionDigits: 0,
                              maximumFractionDigits: 3,
                            }
                          )}
                        </td>

                        <td>
                          {item.ubicaciones_label ||
                            "Sin ubicación"}
                        </td>

                        <td className="acciones-celda">
                          <button
                            onClick={() =>
                              setDetalleAbierto(
                                abierto
                                  ? null
                                  : item.id_recorte
                              )
                            }
                          >
                            {abierto
                              ? "Ocultar"
                              : "Ver ubicaciones"}
                          </button>
                        </td>
                      </tr>

                      {abierto && (
                        <tr className="fila-detalle-recorte">
                          <td colSpan="7">
                            <div className="detalle-recorte">
                              <strong>
                                Ubicaciones de {item.codigo}
                              </strong>

                              {!item.ubicaciones?.length ? (
                                <div className="sin-ubicaciones">
                                  No tiene ubicaciones con stock.
                                </div>
                              ) : (
                                <table className="tabla-ubicaciones-recorte">
                                  <thead>
                                    <tr>
                                      <th>Ubicación</th>
                                      <th className="numero">
                                        Cantidad
                                      </th>
                                    </tr>
                                  </thead>

                                  <tbody>
                                    {item.ubicaciones.map(
                                      (ubicacion) => (
                                        <tr
                                          key={
                                            ubicacion.id_stock_recorte
                                          }
                                        >
                                          <td>
                                            {ubicacion.ubicacion}
                                          </td>

                                          <td className="numero">
                                            {Number(
                                              ubicacion.cantidad || 0
                                            ).toLocaleString(
                                              "es-AR",
                                              {
                                                minimumFractionDigits: 0,
                                                maximumFractionDigits: 3,
                                              }
                                            )}
                                          </td>
                                        </tr>
                                      )
                                    )}
                                  </tbody>
                                </table>
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      )}

      {modalUbicaciones && (
  <div
    className="recorte-modal-overlay"
    onMouseDown={() =>
      setModalUbicaciones(false)
    }
  >
    <div
      className="recorte-modal"
      onMouseDown={(e) =>
        e.stopPropagation()
      }
    >
      <h3>Ubicaciones de recortes</h3>

      <div
        style={{
          display: "flex",
          gap: 8,
          marginBottom: 16,
        }}
      >
        <input
          value={nuevaUbicacion}
          onChange={(e) =>
            setNuevaUbicacion(e.target.value)
          }
          placeholder="Nueva ubicación"
        />

        <button
          className="btn-recorte-principal"
          onClick={async () => {
            const nombre =
              nuevaUbicacion.trim();

            if (!nombre) {
              alert(
                "Debe indicar el nombre."
              );
              return;
            }

            try {
              await api.post(
                "/api/stock-recortes/ubicaciones",
                { nombre }
              );

              setNuevaUbicacion("");
              await cargarUbicaciones();
            } catch (err) {
              alert(
                err.response?.data?.error ||
                  "No se pudo crear la ubicación."
              );
            }
          }}
        >
          Crear
        </button>
      </div>

      <div
        style={{
          maxHeight: 350,
          overflowY: "auto",
        }}
      >
        <table className="tabla-ubicaciones-recorte">
          <thead>
            <tr>
              <th>Ubicación</th>
              <th>Acciones</th>
            </tr>
          </thead>

          <tbody>
            {ubicaciones.map((ubicacion) => {
              const editando =
                editandoUbicacionId ===
                ubicacion.id_ubicacion_recorte;

              return (
                <tr
                  key={
                    ubicacion.id_ubicacion_recorte
                  }
                >
                  <td>
                    {editando ? (
                      <input
                        value={
                          editandoUbicacionNombre
                        }
                        onChange={(e) =>
                          setEditandoUbicacionNombre(
                            e.target.value
                          )
                        }
                        autoFocus
                      />
                    ) : (
                      ubicacion.nombre
                    )}
                  </td>

                  <td>
                    {editando ? (
                      <>
                        <button
                          onClick={async () => {
                            const nombre =
                              editandoUbicacionNombre.trim();

                            if (!nombre) {
                              alert(
                                "El nombre no puede estar vacío."
                              );
                              return;
                            }

                            try {
                              await api.put(
                                `/api/stock-recortes/ubicaciones/${ubicacion.id_ubicacion_recorte}`,
                                { nombre }
                              );

                              setEditandoUbicacionId(
                                null
                              );

                              setEditandoUbicacionNombre(
                                ""
                              );

                              await cargarUbicaciones();
                              await cargarRecortes();
                            } catch (err) {
                              alert(
                                err.response?.data
                                  ?.error ||
                                  "No se pudo modificar."
                              );
                            }
                          }}
                        >
                          Guardar
                        </button>

                        <button
                          onClick={() => {
                            setEditandoUbicacionId(
                              null
                            );

                            setEditandoUbicacionNombre(
                              ""
                            );
                          }}
                        >
                          Cancelar
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          onClick={() => {
                            setEditandoUbicacionId(
                              ubicacion.id_ubicacion_recorte
                            );

                            setEditandoUbicacionNombre(
                              ubicacion.nombre
                            );
                          }}
                        >
                          Editar
                        </button>

                        <button
                          disabled={
                            String(
                              ubicacion.nombre
                            )
                              .trim()
                              .toUpperCase() ===
                            "GENERAL"
                          }
                          onClick={async () => {
                            const ok =
                              window.confirm(
                                `¿Eliminar la ubicación "${ubicacion.nombre}"?`
                              );

                            if (!ok) return;

                            try {
                              await api.delete(
                                `/api/stock-recortes/ubicaciones/${ubicacion.id_ubicacion_recorte}`
                              );

                              await cargarUbicaciones();
                            } catch (err) {
                              alert(
                                err.response?.data
                                  ?.error ||
                                  "No se pudo eliminar."
                              );
                            }
                          }}
                        >
                          Eliminar
                        </button>
                      </>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="recorte-modal-acciones">
        <button
          onClick={() =>
            setModalUbicaciones(false)
          }
        >
          Cerrar
        </button>
      </div>
    </div>
  </div>
)}

      {modalNuevo && (
        <div
          className="recorte-modal-overlay"
          onMouseDown={cerrarNuevo}
        >
          <div
            className="recorte-modal"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <h3>Nuevo recorte</h3>

            <label>
              Código
              <input
                value={form.codigo}
                onChange={(e) =>
                  cambiarForm("codigo", e.target.value)
                }
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    buscarDescripcionPorCodigo(e.target.value);
                  }
                }}
                onBlur={(e) =>
                  buscarDescripcionPorCodigo(e.target.value)
                }
                placeholder="Ejemplo: 1011"
                autoFocus
              />
            </label>

            <label>
              Descripción
              <input
                value={form.descripcion}
                onChange={(e) =>
                  cambiarForm(
                    "descripcion",
                    e.target.value
                  )
                }
                placeholder="Descripción del recorte"
              />
            </label>

            <label>
              Obra / Versión
              <input
                value={form.obra_version}
                onChange={(e) =>
                  cambiarForm("obra_version", e.target.value)
                }
                placeholder="Ejemplo: Obra A / Versión 2"
              />
            </label>

            <label>
              Medida
              <input
                value={form.medida}
                onChange={(e) =>
                  cambiarForm("medida", e.target.value)
                }
                placeholder="Ejemplo: 500 x 300 mm"
              />
            </label>

            <label>
              Cantidad inicial
              <input
                type="number"
                min="0"
                step="0.001"
                value={form.cantidad}
                onChange={(e) =>
                  cambiarForm(
                    "cantidad",
                    e.target.value
                  )
                }
              />
            </label>

            <label>
              Ubicación inicial

              <select
                value={form.id_ubicacion_recorte}
                onChange={(e) =>
                  cambiarForm(
                    "id_ubicacion_recorte",
                    e.target.value
                  )
                }
              >
                <option value="">
                  Seleccionar ubicación
                </option>

                {ubicaciones.map((ubicacion) => (
                  <option
                    key={ubicacion.id_ubicacion_recorte}
                    value={ubicacion.id_ubicacion_recorte}
                  >
                    {ubicacion.nombre}
                  </option>
                ))}
              </select>
            </label>

            <div className="recorte-modal-acciones">
              <button
                onClick={cerrarNuevo}
                disabled={guardando}
              >
                Cancelar
              </button>

              <button
                className="btn-recorte-principal"
                onClick={guardarNuevo}
                disabled={guardando}
              >
                {guardando
                  ? "Guardando..."
                  : "Guardar"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default StockRecortes;