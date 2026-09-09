import React, { useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "../context/AuthContext";
import "../styles/indicadoresProduccion.css";

const API = "/api/ordenes-trabajo";
const OBJETIVO_EFICIENCIA = 0.8;

function fechaIso(fecha = new Date()) {
  const anio = fecha.getFullYear();
  const mes = String(fecha.getMonth() + 1).padStart(2, "0");
  const dia = String(fecha.getDate()).padStart(2, "0");
  return `${anio}-${mes}-${dia}`;
}

function inicioMes() {
  const hoy = new Date();
  return fechaIso(new Date(hoy.getFullYear(), hoy.getMonth(), 1));
}

function numero(valor, decimales = 2) {
  return new Intl.NumberFormat("es-AR", {
    minimumFractionDigits: decimales,
    maximumFractionDigits: decimales,
  }).format(Number(valor) || 0);
}

function porcentaje(valor) {
  if (valor === null || valor === undefined || !Number.isFinite(Number(valor))) {
    return "—";
  }

  return new Intl.NumberFormat("es-AR", {
    style: "percent",
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  }).format(Number(valor));
}

function fechaArgentina(valor) {
  if (!valor) return "";
  const [anio, mes, dia] = String(valor).slice(0, 10).split("-");
  return `${dia}/${mes}/${anio}`;
}

function dividir(numerador, denominador) {
  const divisor = Number(denominador) || 0;
  return divisor > 0 ? (Number(numerador) || 0) / divisor : null;
}

async function leerJson(url, token = "") {
  const headers = {};

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const respuesta = await fetch(url, {
    credentials: "include",
    headers,
  });
  const cuerpo = await respuesta.json().catch(() => ({}));

  if (!respuesta.ok) {
    throw new Error(cuerpo.error || "No se pudo completar la consulta");
  }

  return cuerpo;
}

function SelectorMultiple({ etiqueta, opciones, seleccionados, onChange }) {
  const [abierto, setAbierto] = useState(false);
  const contenedorRef = useRef(null);

  useEffect(() => {
    const cerrar = (event) => {
      if (!contenedorRef.current?.contains(event.target)) setAbierto(false);
    };

    document.addEventListener("mousedown", cerrar);
    return () => document.removeEventListener("mousedown", cerrar);
  }, []);

  const resumen =
    seleccionados.length === 0
      ? "Todos"
      : seleccionados.length === 1
        ? seleccionados[0]
        : `${seleccionados.length} seleccionados`;

  const alternar = (opcion) => {
    if (seleccionados.includes(opcion)) {
      onChange(seleccionados.filter((item) => item !== opcion));
    } else {
      onChange([...seleccionados, opcion]);
    }
  };

  return (
    <div className="selector-multiple" ref={contenedorRef}>
      <span className="selector-multiple-label">{etiqueta}</span>
      <button
        type="button"
        className="selector-multiple-trigger"
        onClick={() => setAbierto((actual) => !actual)}
        aria-expanded={abierto}
      >
        <span>{resumen}</span>
        <span aria-hidden="true">▾</span>
      </button>

      {abierto && (
        <div className="selector-multiple-menu">
          <button
            type="button"
            className="selector-multiple-limpiar"
            onClick={() => onChange([])}
          >
            Seleccionar todos
          </button>
          <div className="selector-multiple-opciones">
            {opciones.map((opcion) => (
              <label key={opcion}>
                <input
                  type="checkbox"
                  checked={seleccionados.includes(opcion)}
                  onChange={() => alternar(opcion)}
                />
                <span>{opcion}</span>
              </label>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function sumar(filas) {
  return filas.reduce(
    (total, fila) => ({
      cantidad: total.cantidad + Number(fila.cantidad || 0),
      presencia: total.presencia + Number(fila.horas_presencia || 0),
      directas: total.directas + Number(fila.horas_directas || 0),
      indirectas: total.indirectas + Number(fila.horas_indirectas || 0),
      estandar: total.estandar + Number(fila.horas_estandar || 0),
    }),
    { cantidad: 0, presencia: 0, directas: 0, indirectas: 0, estandar: 0 },
  );
}

function compararTexto(a, b) {
  return String(a || "").localeCompare(String(b || ""), "es", {
    numeric: true,
    sensitivity: "base",
  });
}

function compararHora(a, b) {
  return String(a || "").localeCompare(String(b || ""));
}

function agruparPorFecha(filas) {
  const mapa = new Map();

  filas.forEach((fila) => {
    const fecha = fila.fecha || "SIN FECHA";
    if (!mapa.has(fecha)) mapa.set(fecha, []);
    mapa.get(fecha).push(fila);
  });

  return [...mapa.entries()]
    .sort(([fechaA], [fechaB]) => compararTexto(fechaA, fechaB))
    .map(([fecha, registros]) => {
      const registrosOrdenados = [...registros].sort((a, b) => {
        const porOperador = compararTexto(a.operador, b.operador);
        if (porOperador !== 0) return porOperador;

        return compararHora(a.hora_inicio, b.hora_inicio);
      });

      return {
        fecha,
        registros: registrosOrdenados,
        total: sumar(registrosOrdenados),
      };
    });
}

function TarjetaIndicador({ titulo, valor, ayuda, tono = "normal" }) {
  return (
    <article className={`indicador-kpi indicador-kpi--${tono}`}>
      <span>{titulo}</span>
      <strong>{valor}</strong>
      {ayuda && <small>{ayuda}</small>}
    </article>
  );
}

function VistaEficiencia({ filas }) {
  const totales = useMemo(() => sumar(filas), [filas]);
  const gruposPorFecha = useMemo(() => agruparPorFecha(filas), [filas]);
  const eficiencia = dividir(totales.estandar, totales.directas);
  const oee = dividir(totales.estandar, totales.presencia);
  const porcentajeIndirecto = dividir(totales.indirectas, totales.presencia);

  return (
    <>
      <div className="indicadores-kpis">
        <TarjetaIndicador titulo="Hs. presencia" valor={numero(totales.presencia)} />
        <TarjetaIndicador titulo="Hs. directas" valor={numero(totales.directas)} />
        <TarjetaIndicador
          titulo="Hs. indirectas"
          valor={numero(totales.indirectas)}
          ayuda={`${porcentaje(porcentajeIndirecto)} de presencia`}
          tono="indirecto"
        />
        <TarjetaIndicador titulo="Hs. estándar" valor={numero(totales.estandar)} />
        <TarjetaIndicador
          titulo="Eficiencia"
          valor={porcentaje(eficiencia)}
          ayuda="Hs. estándar / hs. directas"
          tono={eficiencia !== null && eficiencia >= OBJETIVO_EFICIENCIA ? "bien" : "alerta"}
        />
        <TarjetaIndicador
          titulo="OEE"
          valor={porcentaje(oee)}
          ayuda="Hs. estándar / hs. presencia"
          tono={oee !== null && oee >= OBJETIVO_EFICIENCIA ? "bien" : "alerta"}
        />
      </div>

      <div className="indicadores-table-card">
        <div className="indicadores-table-title">
          <div>
            <h2>Eficiencia</h2>
          </div>
        </div>
        <div className="indicadores-table-wrap">
          <table className="indicadores-table indicadores-table--eficiencia-diaria">
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Legajo</th>
                <th>H. inicio</th>
                <th>H. fin</th>
                <th>Hs. presencia</th>
                <th>Obra</th>
                <th>Operación</th>
                <th>Descripción</th>
                <th>Cantidad</th>
                <th>Hs.</th>
                <th>OP</th>
                <th>Hs. indirectas</th>
                <th>Hs. estándar</th>
                <th>Eficiencia</th>
                <th>Observación</th>
                <th>Descanso</th>
                <th>Hs. indirectas</th>
                <th>% hs indirectas</th>
              </tr>
            </thead>
            <tbody>
              {filas.length === 0 && (
                <tr>
                  <td colSpan="18" className="indicadores-empty">
                    No hay datos para los filtros seleccionados.
                  </td>
                </tr>
              )}
              {gruposPorFecha.map((grupo) => {
                const eficienciaDia = dividir(
                  grupo.total.estandar,
                  grupo.total.directas,
                );
                const indirectasDia = dividir(
                  grupo.total.indirectas,
                  grupo.total.presencia,
                );

                return (
                  <React.Fragment key={grupo.fecha}>
                    {grupo.registros.map((fila) => {
                      const eficienciaFila = dividir(
                        fila.horas_estandar,
                        fila.horas_directas,
                      );
                      const indirectasFila = dividir(
                        fila.horas_indirectas,
                        fila.horas_presencia,
                      );
                      const esIndirecta = fila.tipo_registro === "INDIRECTO";

                      return (
                        <tr
                          key={`${fila.id_ot}-${fila.tipo_registro}`}
                          className={esIndirecta ? "indicadores-row-indirecta" : ""}
                        >
                          <td>{fechaArgentina(fila.fecha)}</td>
                          <td>{fila.operador}</td>
                          <td>{fila.hora_inicio}</td>
                          <td>{fila.hora_fin}</td>
                          <td className="numero">{numero(fila.horas_presencia)}</td>
                          <td>{fila.codigo}</td>
                          <td>{fila.operacion}</td>
                          <td>{fila.descripcion || "—"}</td>
                          <td className="numero">
                            {Number(fila.cantidad || 0) ? numero(fila.cantidad) : ""}
                          </td>
                          <td className="numero">
                            {esIndirecta ? "" : numero(fila.horas_directas)}
                          </td>
                          <td>{fila.orden_trabajo || ""}</td>
                          <td className="numero">
                            {esIndirecta ? numero(fila.horas_indirectas) : ""}
                          </td>
                          <td className="numero">
                            {Number(fila.horas_estandar || 0)
                              ? numero(fila.horas_estandar)
                              : ""}
                          </td>
                          <td className="numero">
                            {esIndirecta ? "" : porcentaje(eficienciaFila)}
                          </td>
                          <td className="indicadores-observacion">
                            {fila.observacion || "—"}
                          </td>
                          <td className="numero">
                            {Number(fila.descanso_minutos || 0)
                              ? numero(Number(fila.descanso_minutos) / 60)
                              : ""}
                          </td>
                          <td className="numero">
                            {esIndirecta ? numero(fila.horas_indirectas) : ""}
                          </td>
                          <td className="numero">
                            {esIndirecta ? porcentaje(indirectasFila) : ""}
                          </td>
                        </tr>
                      );
                    })}

                    <tr className="indicadores-row-total-dia">
                      <td colSpan="4">Total {fechaArgentina(grupo.fecha)}</td>
                      <td className="numero">{numero(grupo.total.presencia)}</td>
                      <td colSpan="3" />
                      <td className="numero">{numero(grupo.total.cantidad)}</td>
                      <td className="numero">{numero(grupo.total.directas)}</td>
                      <td />
                      <td className="numero">{numero(grupo.total.indirectas)}</td>
                      <td className="numero">{numero(grupo.total.estandar)}</td>
                      <td className="numero">{porcentaje(eficienciaDia)}</td>
                      <td colSpan="2" />
                      <td className="numero">{numero(grupo.total.indirectas)}</td>
                      <td className="numero">{porcentaje(indirectasDia)}</td>
                    </tr>
                  </React.Fragment>
                );
              })}
            </tbody>
            {filas.length > 0 && (
              <tfoot>
                <tr className="indicadores-row-gran-total">
                  <td colSpan="4">Gran Total</td>
                  <td className="numero">{numero(totales.presencia)}</td>
                  <td colSpan="3" />
                  <td className="numero">{numero(totales.cantidad)}</td>
                  <td className="numero">{numero(totales.directas)}</td>
                  <td />
                  <td className="numero">{numero(totales.indirectas)}</td>
                  <td className="numero">{numero(totales.estandar)}</td>
                  <td className="numero">{porcentaje(eficiencia)}</td>
                  <td colSpan="2" />
                  <td className="numero">{numero(totales.indirectas)}</td>
                  <td className="numero">{porcentaje(porcentajeIndirecto)}</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>
    </>
  );
}

function VistaAnalisis({ filas }) {
  const resumen = useMemo(() => {
    const porOperador = new Map();

    filas.forEach((fila) => {
      const operador = fila.operador || "SIN OPERADOR";
      if (!porOperador.has(operador)) porOperador.set(operador, []);
      porOperador.get(operador).push(fila);
    });

    return [...porOperador.entries()]
      .map(([operador, registros]) => ({
        operador,
        ...sumar(registros),
        registros: registros.length,
      }))
      .sort((a, b) => a.operador.localeCompare(b.operador, "es"));
  }, [filas]);

  return (
    <div className="indicadores-table-card">
      <div className="indicadores-table-title">
        <div>
          <h2>Análisis por operador</h2>
        </div>
        <span>{resumen.length} operadores</span>
      </div>

      <div className="indicadores-table-wrap">
        <table className="indicadores-table indicadores-table--analisis">
          <thead>
            <tr>
              <th>Operador</th>
              <th>Registros</th>
              <th>Cantidad</th>
              <th>Hs. presencia</th>
              <th>Hs. directas</th>
              <th>Hs. indirectas</th>
              <th>% indirectas</th>
              <th>Hs. estándar</th>
              <th>Eficiencia</th>
              <th>OEE</th>
              <th>Resultado</th>
            </tr>
          </thead>
          <tbody>
            {resumen.length === 0 && (
              <tr>
                <td colSpan="11" className="indicadores-empty">
                  Seleccioná el período y los operadores que querés analizar.
                </td>
              </tr>
            )}
            {resumen.map((fila) => {
              const eficiencia = dividir(fila.estandar, fila.directas);
              const oee = dividir(fila.estandar, fila.presencia);
              const indirectas = dividir(fila.indirectas, fila.presencia);
              const cumple = eficiencia !== null && eficiencia >= OBJETIVO_EFICIENCIA;

              return (
                <tr key={fila.operador}>
                  <td><strong>{fila.operador}</strong></td>
                  <td className="numero">{fila.registros}</td>
                  <td className="numero">{numero(fila.cantidad)}</td>
                  <td className="numero">{numero(fila.presencia)}</td>
                  <td className="numero">{numero(fila.directas)}</td>
                  <td className="numero">{numero(fila.indirectas)}</td>
                  <td className="numero">{porcentaje(indirectas)}</td>
                  <td className="numero">{numero(fila.estandar)}</td>
                  <td className="numero">{porcentaje(eficiencia)}</td>
                  <td className="numero">{porcentaje(oee)}</td>
                  <td>
                    <span
                      className={`indicadores-estado ${
                        cumple ? "indicadores-estado--bien" : "indicadores-estado--alerta"
                      }`}
                    >
                      {cumple ? "Cumple" : "Bajo objetivo"}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function VistaObras({ filas }) {
  const filasDirectas = useMemo(
    () => filas.filter((fila) => fila.tipo_registro !== "INDIRECTO"),
    [filas],
  );

  const obras = useMemo(() => {
    const mapa = new Map();

    filasDirectas.forEach((fila) => {
      const obra = fila.obra_version || "SIN OBRA";
      if (!mapa.has(obra)) mapa.set(obra, []);
      mapa.get(obra).push(fila);
    });

    return [...mapa.entries()]
      .map(([obra, registros]) => ({ obra, registros, total: sumar(registros) }))
      .sort((a, b) => a.obra.localeCompare(b.obra, "es", { numeric: true }));
  }, [filasDirectas]);

  return (
    <div className="indicadores-obras">
      {obras.length === 0 && (
        <div className="indicadores-table-card indicadores-empty">
          Seleccioná una o más obras para consultar su eficiencia.
        </div>
      )}

      {obras.map(({ obra, registros, total }) => (
        <article className="indicadores-table-card" key={obra}>
          <div className="indicadores-obra-heading">
            <div>
              <span>Obra</span>
              <h2>{obra}</h2>
            </div>
            <div className="indicadores-obra-totales">
              <span>Cantidad <strong>{numero(total.cantidad)}</strong></span>
              <span>Hs. presencia <strong>{numero(total.presencia)}</strong></span>
              <span>Hs. estándar <strong>{numero(total.estandar)}</strong></span>
              <span>
                Eficiencia <strong>{porcentaje(dividir(total.estandar, total.directas))}</strong>
              </span>
            </div>
          </div>

          <div className="indicadores-table-wrap">
            <table className="indicadores-table">
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Código</th>
                  <th>Operación</th>
                  <th>Descripción</th>
                  <th>Cantidad</th>
                  <th>Hs. presencia</th>
                  <th>Hs. estándar</th>
                  <th>Eficiencia</th>
                  <th>Estándar min.</th>
                  <th>Origen</th>
                </tr>
              </thead>
              <tbody>
                {registros.map((fila) => (
                  <tr key={`${fila.id_ot}-${fila.tipo_registro}`}>
                    <td>{fechaArgentina(fila.fecha)}</td>
                    <td>{fila.codigo}</td>
                    <td>{fila.operacion}</td>
                    <td>{fila.descripcion || "—"}</td>
                    <td className="numero">{numero(fila.cantidad)}</td>
                    <td className="numero">{numero(fila.horas_directas)}</td>
                    <td className="numero">{numero(fila.horas_estandar)}</td>
                    <td className="numero">
                      {porcentaje(dividir(fila.horas_estandar, fila.horas_directas))}
                    </td>
                    <td className="numero">{numero(fila.estandar_minutos)}</td>
                    <td>Órdenes de Trabajo</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan="4">Subtotal obra</td>
                  <td className="numero">{numero(total.cantidad)}</td>
                  <td className="numero">{numero(total.directas)}</td>
                  <td className="numero">{numero(total.estandar)}</td>
                  <td className="numero">
                    {porcentaje(dividir(total.estandar, total.directas))}
                  </td>
                  <td colSpan="2" />
                </tr>
              </tfoot>
            </table>
          </div>
        </article>
      ))}
    </div>
  );
}

function IndicadoresEficiencia() {
  const { token } = useAuth();

  const leerApi = (url) => leerJson(url, token);

  const [pestana, setPestana] = useState("eficiencia");
  const [filtros, setFiltros] = useState({
    desde: inicioMes(),
    hasta: fechaIso(),
    operadores: [],
    obras: [],
  });
  const [opciones, setOpciones] = useState({ operadores: [], obras: [] });
  const [filas, setFilas] = useState([]);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState("");

  const consultar = async (filtrosConsulta = filtros) => {
    setCargando(true);
    setError("");

    try {
      const parametros = new URLSearchParams();
      if (filtrosConsulta.desde) parametros.set("desde", filtrosConsulta.desde);
      if (filtrosConsulta.hasta) parametros.set("hasta", filtrosConsulta.hasta);
      filtrosConsulta.operadores.forEach((item) =>
        parametros.append("operador", item),
      );
      filtrosConsulta.obras.forEach((item) => parametros.append("obra", item));

      const datos = await leerApi(`${API}/datos?${parametros.toString()}`);
      setFilas(Array.isArray(datos) ? datos : []);
    } catch (consultaError) {
      setError(consultaError.message);
      setFilas([]);
    } finally {
      setCargando(false);
    }
  };

  useEffect(() => {
    if (!token) {
      return;
    }

    const iniciar = async () => {
      try {
        const datosOpciones = await leerApi(`${API}/indicadores/opciones`);
        setOpciones({
          operadores: datosOpciones.operadores || [],
          obras: datosOpciones.obras || [],
        });
      } catch (opcionesError) {
        setError(opcionesError.message);
      }

      await consultar();
    };

    iniciar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const actualizar = (campo, valor) => {
    setFiltros((actual) => ({ ...actual, [campo]: valor }));
  };

  return (
    <section className="indicadores-page">
      <div className="indicadores-heading">
        <div>
          <h1>Indicadores Eficiencia</h1>
        </div>
      </div>

      <div className="indicadores-tabs" role="tablist">
        <button
          type="button"
          className={pestana === "eficiencia" ? "active" : ""}
          onClick={() => setPestana("eficiencia")}
        >
          Eficiencia
        </button>
        <button
          type="button"
          className={pestana === "analisis" ? "active" : ""}
          onClick={() => setPestana("analisis")}
        >
          Análisis
        </button>
        <button
          type="button"
          className={pestana === "obras" ? "active" : ""}
          onClick={() => setPestana("obras")}
        >
          Eficiencia por Obras
        </button>
      </div>

      <form
        className="indicadores-filtros indicadores-filtros--eficiencia"
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
            onChange={(event) => actualizar("desde", event.target.value)}
          />
        </label>
        <label>
          Hasta
          <input
            type="date"
            value={filtros.hasta}
            onChange={(event) => actualizar("hasta", event.target.value)}
          />
        </label>
        <SelectorMultiple
          etiqueta="Operadores"
          opciones={opciones.operadores}
          seleccionados={filtros.operadores}
          onChange={(valor) => actualizar("operadores", valor)}
        />
        <SelectorMultiple
          etiqueta="Obras"
          opciones={opciones.obras}
          seleccionados={filtros.obras}
          onChange={(valor) => actualizar("obras", valor)}
        />
        <button type="submit" className="indicadores-primary" disabled={cargando}>
          {cargando ? "Calculando..." : "Calcular"}
        </button>
      </form>

      {error && <div className="indicadores-error">{error}</div>}
      {cargando && <div className="indicadores-loading">Calculando indicadores...</div>}

      {!cargando && pestana === "eficiencia" && <VistaEficiencia filas={filas} />}
      {!cargando && pestana === "analisis" && <VistaAnalisis filas={filas} />}
      {!cargando && pestana === "obras" && <VistaObras filas={filas} />}
    </section>
  );
}

export default IndicadoresEficiencia;