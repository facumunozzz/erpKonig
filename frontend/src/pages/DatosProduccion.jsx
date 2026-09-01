import React, { useEffect, useMemo, useState } from "react";
import "../styles/indicadoresProduccion.css";

const API = "/api/ordenes-trabajo";

function fechaIso(fecha = new Date()) {
  const anio = fecha.getFullYear();
  const mes = String(fecha.getMonth() + 1).padStart(2, "0");
  const dia = String(fecha.getDate()).padStart(2, "0");
  return `${anio}-${mes}-${dia}`;
}

function inicioAnio() {
  return `${new Date().getFullYear()}-01-01`;
}

function numero(valor, decimales = 2) {
  return new Intl.NumberFormat("es-AR", {
    minimumFractionDigits: decimales,
    maximumFractionDigits: decimales,
  }).format(Number(valor) || 0);
}

function fechaArgentina(valor) {
  if (!valor) return "";
  const [anio, mes, dia] = String(valor).slice(0, 10).split("-");
  return `${dia}/${mes}/${anio}`;
}

function valorEditable(valor) {
  return valor === null || valor === undefined ? "" : String(valor);
}

function valorHora(valor) {
  return valor ? String(valor).slice(0, 5) : "";
}

function claveFila(fila) {
  return `${fila.id_ot}-${fila.tipo_registro}`;
}

async function solicitarJson(url, opciones = {}) {
  const respuesta = await fetch(url, {
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(opciones.headers || {}),
    },
    ...opciones,
  });
  const cuerpo = await respuesta.json().catch(() => ({}));

  if (!respuesta.ok) {
    throw new Error(cuerpo.error || "No se pudo completar la consulta");
  }

  return cuerpo;
}

function crearBorrador(fila) {
  return {
    fecha: valorEditable(fila.fecha),
    operador: valorEditable(fila.operador),
    hora_inicio: valorHora(fila.hora_inicio),
    hora_fin: valorHora(fila.hora_fin),
    codigo: valorEditable(fila.codigo),
    obra_version: valorEditable(fila.obra_version || fila.codigo),
    operacion: valorEditable(fila.operacion),
    descripcion: valorEditable(fila.descripcion),
    cantidad: valorEditable(fila.cantidad),
    pedido: valorEditable(fila.pedido),
    observacion: valorEditable(fila.observacion),
    estandar_minutos: valorEditable(fila.estandar_minutos),
    horas_presencia: valorEditable(fila.horas_presencia),
    horas_directas: valorEditable(fila.horas_directas),
    horas_indirectas: valorEditable(fila.horas_indirectas),
    horas_estandar: valorEditable(fila.horas_estandar),
    fase: valorEditable(fila.fase),
  };
}

function CampoTexto({ valor, onChange, className = "" }) {
  return (
    <input
      className={`dato-edit-input ${className}`}
      type="text"
      value={valor}
      onChange={(event) => onChange(event.target.value)}
    />
  );
}

function CampoNumero({ valor, onChange }) {
  return (
    <input
      className="dato-edit-input dato-edit-numero"
      type="number"
      step="0.0001"
      value={valor}
      onChange={(event) => onChange(event.target.value)}
    />
  );
}

function CampoSelect({ valor, opciones, onChange, placeholder = "Seleccionar" }) {
  const opcionesFinales = Array.from(
    new Set([valor, ...(opciones || [])].map((item) => String(item || "").trim())),
  ).filter(Boolean);

  return (
    <select
      className="dato-edit-input"
      value={valor}
      onChange={(event) => onChange(event.target.value)}
    >
      <option value="">{placeholder}</option>
      {opcionesFinales.map((opcion) => (
        <option key={opcion} value={opcion}>
          {opcion}
        </option>
      ))}
    </select>
  );
}

function DatosProduccion() {
  const [filtros, setFiltros] = useState({
    desde: inicioAnio(),
    hasta: fechaIso(),
    operador: "",
    obra: "",
  });
  const [opciones, setOpciones] = useState({
    operadores: [],
    obras: [],
    operaciones: [],
  });
  const [filas, setFilas] = useState([]);
  const [cargando, setCargando] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");
  const [mensaje, setMensaje] = useState("");
  const [editando, setEditando] = useState(null);
  const [borrador, setBorrador] = useState(null);

  const operadoresOpciones = opciones.operadores || [];
  const obrasOpciones = opciones.obras || [];
  const operacionesOpciones = (opciones.operaciones || []).map((operacion) =>
    String(operacion.nombre || "").trim(),
  );

  const consultar = async (filtrosConsulta = filtros) => {
    setCargando(true);
    setError("");

    try {
      const parametros = new URLSearchParams();
      if (filtrosConsulta.desde) parametros.set("desde", filtrosConsulta.desde);
      if (filtrosConsulta.hasta) parametros.set("hasta", filtrosConsulta.hasta);
      if (filtrosConsulta.operador) {
        parametros.append("operador", filtrosConsulta.operador);
      }
      if (filtrosConsulta.obra) parametros.append("obra", filtrosConsulta.obra);

      const datos = await solicitarJson(`${API}/datos?${parametros.toString()}`);
      setFilas(Array.isArray(datos) ? datos : []);
    } catch (consultaError) {
      setError(consultaError.message);
      setFilas([]);
    } finally {
      setCargando(false);
    }
  };

  const cargarOpciones = async () => {
    const datosOpciones = await solicitarJson(`${API}/indicadores/opciones`);
    setOpciones({
      operadores: datosOpciones.operadores || [],
      obras: datosOpciones.obras || [],
      operaciones: datosOpciones.operaciones || [],
    });
  };

  useEffect(() => {
    const iniciar = async () => {
      try {
        await cargarOpciones();
      } catch (opcionesError) {
        setError(opcionesError.message);
      }

      await consultar();
    };

    iniciar();
    // La consulta inicial debe ejecutarse una sola vez.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const totales = useMemo(
    () =>
      filas.reduce(
        (acumulado, fila) => ({
          presencia: acumulado.presencia + Number(fila.horas_presencia || 0),
          directas: acumulado.directas + Number(fila.horas_directas || 0),
          indirectas:
            acumulado.indirectas + Number(fila.horas_indirectas || 0),
          estandar: acumulado.estandar + Number(fila.horas_estandar || 0),
        }),
        { presencia: 0, directas: 0, indirectas: 0, estandar: 0 },
      ),
    [filas],
  );

  const actualizarFiltro = (campo, valor) => {
    setFiltros((actual) => ({ ...actual, [campo]: valor }));
  };

  const actualizarBorrador = (campo, valor) => {
    setBorrador((actual) => ({ ...actual, [campo]: valor }));
  };

  const iniciarEdicion = (fila) => {
    setMensaje("");
    setError("");
    setEditando(claveFila(fila));
    setBorrador(crearBorrador(fila));
  };

  const cancelarEdicion = () => {
    setEditando(null);
    setBorrador(null);
  };

  const guardarEdicion = async (fila) => {
    if (!borrador) return;

    setGuardando(true);
    setError("");
    setMensaje("");

    try {
      await solicitarJson(`${API}/datos/${fila.id_ot}/${fila.tipo_registro}`, {
        method: "PUT",
        body: JSON.stringify(borrador),
      });

      setMensaje("Dato guardado correctamente.");
      cancelarEdicion();
      await cargarOpciones();
      await consultar();
    } catch (guardarError) {
      setError(guardarError.message);
    } finally {
      setGuardando(false);
    }
  };

  const restaurarOriginal = async (fila) => {
    const confirmar = window.confirm(
      "¿Querés restaurar esta fila al dato original de la Orden de Trabajo?",
    );

    if (!confirmar) return;

    setGuardando(true);
    setError("");
    setMensaje("");

    try {
      await solicitarJson(`${API}/datos/${fila.id_ot}/${fila.tipo_registro}`, {
        method: "DELETE",
      });

      setMensaje("Dato restaurado al valor original.");
      cancelarEdicion();
      await cargarOpciones();
      await consultar();
    } catch (restaurarError) {
      setError(restaurarError.message);
    } finally {
      setGuardando(false);
    }
  };

  const aplicarTiempoOperacion = (nombreOperacion) => {
    actualizarBorrador("operacion", nombreOperacion);

    const operacion = (opciones.operaciones || []).find(
      (item) => String(item.nombre || "").trim() === nombreOperacion,
    );

    if (operacion) {
      actualizarBorrador(
        "estandar_minutos",
        valorEditable(operacion.tiempo_std),
      );
    }
  };

  const celda = (fila, campo, contenidoNormal, contenidoEditando) =>
    editando === claveFila(fila) ? contenidoEditando : contenidoNormal;

  return (
    <section className="indicadores-page">
      <div className="indicadores-heading">
          <h1>Datos</h1>       
      </div>

      <form
        className="indicadores-filtros"
        onSubmit={(event) => {
          event.preventDefault();
          consultar();
        }}
      >
        <label>
          Desde
          <input
            type="date"
            value={filtros.desde}
            onChange={(event) => actualizarFiltro("desde", event.target.value)}
          />
        </label>

        <label>
          Hasta
          <input
            type="date"
            value={filtros.hasta}
            onChange={(event) => actualizarFiltro("hasta", event.target.value)}
          />
        </label>

        <label>
          Operador
          <select
            value={filtros.operador}
            onChange={(event) => actualizarFiltro("operador", event.target.value)}
          >
            <option value="">Todos</option>
            {operadoresOpciones.map((operador) => (
              <option key={operador} value={operador}>
                {operador}
              </option>
            ))}
          </select>
        </label>

        <label>
          Obra
          <select
            value={filtros.obra}
            onChange={(event) => actualizarFiltro("obra", event.target.value)}
          >
            <option value="">Todas</option>
            {obrasOpciones.map((obra) => (
              <option key={obra} value={obra}>
                {obra}
              </option>
            ))}
          </select>
        </label>

        <button type="submit" className="indicadores-primary" disabled={cargando}>
          {cargando ? "Consultando..." : "Consultar"}
        </button>
      </form>

      {error && <div className="indicadores-error">{error}</div>}
      {mensaje && <div className="indicadores-ok">{mensaje}</div>}

      <div className="indicadores-resumen indicadores-resumen--cuatro">
        <article>
          <span>Registros</span>
          <strong>{filas.length}</strong>
        </article>
        <article>
          <span>Horas directas</span>
          <strong>{numero(totales.directas)}</strong>
        </article>
        <article>
          <span>Horas indirectas</span>
          <strong>{numero(totales.indirectas)}</strong>
        </article>
        <article>
          <span>Horas estándar</span>
          <strong>{numero(totales.estandar)}</strong>
        </article>
      </div>

      <div className="indicadores-table-card">
        <div className="indicadores-table-title">
          <div>
            <h2>Detalle de producción</h2>
            <p>
              Las filas ajustadas se marcan como “Editado”. Los indicadores usan
              estos valores corregidos.
            </p>
          </div>
          <span>{filas.length} filas</span>
        </div>

        <div className="indicadores-table-wrap">
          <table className="indicadores-table indicadores-table--datos-editables">
            <thead>
              <tr>
                <th>Estado</th>
                <th>Fecha</th>
                <th>Operador</th>
                <th>H. inicio</th>
                <th>H. fin</th>
                <th>Obra</th>
                <th>Operación</th>
                <th>Descripción</th>
                <th>Cantidad</th>
                <th>OT</th>
                <th>Pedido</th>
                <th>Observación</th>
                <th>Estándar min.</th>
                <th>Hs. presencia</th>
                <th>Hs. directas</th>
                <th>Hs. indirectas</th>
                <th>Hs. estándar</th>
                <th>Fase</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {!cargando && filas.length === 0 && (
                <tr>
                  <td colSpan="19" className="indicadores-empty">
                    No hay órdenes finalizadas para los filtros seleccionados.
                  </td>
                </tr>
              )}

              {filas.map((fila) => {
                const estaEditando = editando === claveFila(fila);

                return (
                  <tr
                    key={claveFila(fila)}
                    className={[
                      fila.tipo_registro === "INDIRECTO"
                        ? "indicadores-row-indirecta"
                        : "",
                      Number(fila.ajustado) === 1
                        ? "indicadores-row-ajustada"
                        : "",
                    ]
                      .filter(Boolean)
                      .join(" ")}
                  >
                    <td>
                      {Number(fila.ajustado) === 1 ? (
                        <span
                          className="indicadores-estado indicadores-estado--editado"
                          title={
                            fila.usuario_ajuste
                              ? `Editado por ${fila.usuario_ajuste}`
                              : "Fila editada"
                          }
                        >
                          Editado
                        </span>
                      ) : (
                        <span className="indicadores-estado">Original</span>
                      )}
                    </td>
                    <td>
                      {celda(
                        fila,
                        "fecha",
                        fechaArgentina(fila.fecha),
                        <input
                          className="dato-edit-input"
                          type="date"
                          value={borrador?.fecha || ""}
                          onChange={(event) =>
                            actualizarBorrador("fecha", event.target.value)
                          }
                        />,
                      )}
                    </td>
                    <td>
                      {celda(
                        fila,
                        "operador",
                        fila.operador,
                        <CampoSelect
                          valor={borrador?.operador || ""}
                          opciones={operadoresOpciones}
                          onChange={(valor) =>
                            actualizarBorrador("operador", valor)
                          }
                          placeholder="Operador"
                        />,
                      )}
                    </td>
                    <td>
                      {celda(
                        fila,
                        "hora_inicio",
                        fila.hora_inicio,
                        <input
                          className="dato-edit-input"
                          type="time"
                          value={borrador?.hora_inicio || ""}
                          onChange={(event) =>
                            actualizarBorrador("hora_inicio", event.target.value)
                          }
                        />,
                      )}
                    </td>
                    <td>
                      {celda(
                        fila,
                        "hora_fin",
                        fila.hora_fin,
                        <input
                          className="dato-edit-input"
                          type="time"
                          value={borrador?.hora_fin || ""}
                          onChange={(event) =>
                            actualizarBorrador("hora_fin", event.target.value)
                          }
                        />,
                      )}
                    </td>
                    <td>
                      {celda(
                        fila,
                        "codigo",
                        fila.codigo,
                        <CampoSelect
                          valor={borrador?.obra_version || borrador?.codigo || ""}
                          opciones={obrasOpciones}
                          onChange={(valor) => {
                            actualizarBorrador("codigo", valor);
                            actualizarBorrador("obra_version", valor);
                          }}
                          placeholder="Obra"
                        />,
                      )}
                    </td>
                    <td>
                      {celda(
                        fila,
                        "operacion",
                        fila.operacion,
                        <CampoSelect
                          valor={borrador?.operacion || ""}
                          opciones={operacionesOpciones}
                          onChange={aplicarTiempoOperacion}
                          placeholder="Operación"
                        />,
                      )}
                    </td>
                    <td>
                      {celda(
                        fila,
                        "descripcion",
                        fila.descripcion || "—",
                        <CampoTexto
                          valor={borrador?.descripcion || ""}
                          onChange={(valor) =>
                            actualizarBorrador("descripcion", valor)
                          }
                        />,
                      )}
                    </td>
                    <td className="numero">
                      {celda(
                        fila,
                        "cantidad",
                        numero(fila.cantidad),
                        <CampoNumero
                          valor={borrador?.cantidad || ""}
                          onChange={(valor) =>
                            actualizarBorrador("cantidad", valor)
                          }
                        />,
                      )}
                    </td>
                    <td>{fila.orden_trabajo}</td>
                    <td className="numero">
                      {celda(
                        fila,
                        "pedido",
                        numero(fila.pedido),
                        <CampoNumero
                          valor={borrador?.pedido || ""}
                          onChange={(valor) =>
                            actualizarBorrador("pedido", valor)
                          }
                        />,
                      )}
                    </td>
                    <td className="indicadores-observacion">
                      {celda(
                        fila,
                        "observacion",
                        fila.observacion || "—",
                        <CampoTexto
                          className="dato-edit-observacion"
                          valor={borrador?.observacion || ""}
                          onChange={(valor) =>
                            actualizarBorrador("observacion", valor)
                          }
                        />,
                      )}
                    </td>
                    <td className="numero">
                      {celda(
                        fila,
                        "estandar_minutos",
                        numero(fila.estandar_minutos),
                        <CampoNumero
                          valor={borrador?.estandar_minutos || ""}
                          onChange={(valor) =>
                            actualizarBorrador("estandar_minutos", valor)
                          }
                        />,
                      )}
                    </td>
                    <td className="numero">
                      {celda(
                        fila,
                        "horas_presencia",
                        numero(fila.horas_presencia),
                        <CampoNumero
                          valor={borrador?.horas_presencia || ""}
                          onChange={(valor) =>
                            actualizarBorrador("horas_presencia", valor)
                          }
                        />,
                      )}
                    </td>
                    <td className="numero">
                      {celda(
                        fila,
                        "horas_directas",
                        numero(fila.horas_directas),
                        <CampoNumero
                          valor={borrador?.horas_directas || ""}
                          onChange={(valor) =>
                            actualizarBorrador("horas_directas", valor)
                          }
                        />,
                      )}
                    </td>
                    <td className="numero">
                      {celda(
                        fila,
                        "horas_indirectas",
                        numero(fila.horas_indirectas),
                        <CampoNumero
                          valor={borrador?.horas_indirectas || ""}
                          onChange={(valor) =>
                            actualizarBorrador("horas_indirectas", valor)
                          }
                        />,
                      )}
                    </td>
                    <td className="numero">
                      {celda(
                        fila,
                        "horas_estandar",
                        numero(fila.horas_estandar),
                        <CampoNumero
                          valor={borrador?.horas_estandar || ""}
                          onChange={(valor) =>
                            actualizarBorrador("horas_estandar", valor)
                          }
                        />,
                      )}
                    </td>
                    <td>
                      {celda(
                        fila,
                        "fase",
                        fila.fase ?? "—",
                        <CampoTexto
                          valor={borrador?.fase || ""}
                          onChange={(valor) => actualizarBorrador("fase", valor)}
                        />,
                      )}
                    </td>
                    <td>
                      {estaEditando ? (
                        <div className="datos-acciones">
                          <button
                            type="button"
                            className="datos-btn datos-btn--guardar"
                            onClick={() => guardarEdicion(fila)}
                            disabled={guardando}
                          >
                            Guardar
                          </button>
                          <button
                            type="button"
                            className="datos-btn"
                            onClick={cancelarEdicion}
                            disabled={guardando}
                          >
                            Cancelar
                          </button>
                        </div>
                      ) : (
                        <div className="datos-acciones">
                          <button
                            type="button"
                            className="datos-btn datos-btn--editar"
                            onClick={() => iniciarEdicion(fila)}
                            disabled={guardando}
                          >
                            Editar
                          </button>
                          {Number(fila.ajustado) === 1 && (
                            <button
                              type="button"
                              className="datos-btn datos-btn--restaurar"
                              onClick={() => restaurarOriginal(fila)}
                              disabled={guardando}
                            >
                              Restaurar
                            </button>
                          )}
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}

export default DatosProduccion;