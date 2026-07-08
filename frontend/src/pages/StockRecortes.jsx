import React, { useEffect, useMemo, useState } from "react";
import api from "../api/axiosConfig";
import "./../styles/stockRecortes.css";

const FORM_INICIAL = {
  codigo: "",
  descripcion: "",
  medida: "",
  obra_version: "",
  cantidad: "",
  ubicacion: "",
};

function StockRecortes() {
  const [recortes, setRecortes] = useState([]);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState("");

  const [busqueda, setBusqueda] = useState("");
  const [modalNuevo, setModalNuevo] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [form, setForm] = useState(FORM_INICIAL);

  const [detalleAbierto, setDetalleAbierto] = useState(null);

  const cargarRecortes = async () => {
    try {
      setCargando(true);
      setError("");

      const response = await api.get("/stock-recortes");

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

  const recortesFiltrados = useMemo(() => {
    const texto = busqueda.trim().toLowerCase();

    if (!texto) return recortes;

    return recortes.filter((item) => {
      const contenido = [
        item.codigo,
        item.descripcion,
        item.medida,
        item.cantidad,
        item.ubicaciones_label,
      ]
        .join(" ")
        .toLowerCase();

      return contenido.includes(texto);
    });
  }, [recortes, busqueda]);

  const cambiarForm = (campo, valor) => {
    setForm((prev) => ({
      ...prev,
      [campo]: valor,
    }));
  };

  const abrirNuevo = () => {
    setForm(FORM_INICIAL);
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
    const ubicacion = form.ubicacion.trim();
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

    if (!ubicacion) {
      alert("Debe ingresar la ubicación.");
      return;
    }

    if (!Number.isFinite(cantidad) || cantidad < 0) {
      alert("La cantidad no es válida.");
      return;
    }

    try {
      setGuardando(true);

      await api.post("/stock-recortes", {
        codigo,
        descripcion,
        medida,
        obra_version,
        ubicacion,
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
      await api.delete(`/stock-recortes/${item.id_recorte}`);
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
          <h2 className="module-title">Stock Recortes</h2>    

        <button
          className="btn-recorte-principal"
          onClick={abrirNuevo}
        >
          Nuevo recorte
        </button>
      </div>

      <div className="stock-recortes-toolbar">
        <input
          type="text"
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          placeholder="Buscar código, descripción, medida o ubicación..."
        />

        <button onClick={cargarRecortes}>
          Actualizar
        </button>
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
                <th>Código</th>
                <th>Descripción</th>
                <th>Medida</th>
                <th className="numero">Cantidad</th>
                <th>Ubicaciones</th>
                <th className="acciones-columna">Acciones</th>
              </tr>
            </thead>

            <tbody>
              {recortesFiltrados.length === 0 ? (
                <tr>
                  <td colSpan="6" className="sin-resultados">
                    No hay recortes para mostrar.
                  </td>
                </tr>
              ) : (
                recortesFiltrados.map((item) => {
                  const abierto =
                    detalleAbierto === item.id_recorte;

                  return (
                    <React.Fragment key={item.id_recorte}>
                      <tr>
                        <td>{item.codigo}</td>
                        <td>{item.descripcion}</td>
                        <td>{item.medida}</td>

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
                          {item.ubicaciones_label || "Sin ubicación"}
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

                          <button
                            className="btn-eliminar-recorte"
                            onClick={() =>
                              eliminarRecorte(item)
                            }
                          >
                            Eliminar
                          </button>
                        </td>
                      </tr>

                      {abierto && (
                        <tr className="fila-detalle-recorte">
                          <td colSpan="6">
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
              <input
                value={form.ubicacion}
                onChange={(e) =>
                  cambiarForm(
                    "ubicacion",
                    e.target.value
                  )
                }
                placeholder="Ejemplo: ESTANTE A1"
              />
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