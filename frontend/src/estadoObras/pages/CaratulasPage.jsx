import { useEffect, useMemo, useRef, useState } from "react";
import EstadosModal from "../components/EstadosModal";
import "../styles/caratulas.css";

const COLUMNAS = [
  { key: "estado", label: "Estado", type: "estado" },
  { key: "caratula", label: "Caratula", type: "text" },
  { key: "version", label: "Versión", type: "text" },
  { key: "fase", label: "Fase", type: "text" },
  { key: "mrp", label: "MRP", type: "text" },
  { key: "fecha_mrp", label: "Fecha MRP", type: "date" },
  { key: "prioridad", label: "Prioridad", type: "text" },
  { key: "etapa", label: "ETAPA", type: "text" },
  { key: "cerrado_comercial", label: "Cerrado Comercial", type: "checkbox" },
  { key: "fecha_aprobacion", label: "Fecha aprobación", type: "date" },
  { key: "comercial", label: "Comercial", type: "text" },
  { key: "referencia", label: "Referencia", type: "text" },
  { key: "color", label: "Color", type: "text" },
  { key: "fecha_entrega", label: "Fecha de entrega", type: "date" },
  { key: "pedido_vidrios", label: "Pedido de Vidrios", type: "text" },
  { key: "proveedor_vidrios", label: "Proveedor Vidrios", type: "text" },
  { key: "cantidad_vidrios", label: "Cantidad de vidrios", type: "number" },
  {
    key: "fecha_recepcion_vidrios",
    label: "Fecha de recepción Vidrios",
    type: "date",
  },
  { key: "curvos_formas", label: "Curvos y formas", type: "text" },
  { key: "premarcos", label: "Premarcos", type: "text" },
  { key: "mosquiteros", label: "Mosquiteros", type: "text" },
  {
    key: "fecha_fabricacion_mosquiteros",
    label: "Fecha fabricación Mosquiteros",
    type: "date",
  },
  { key: "complejidad", label: "Complejidad", type: "text" },
  {
    key: "fecha_inicio_prod_programada",
    label: "Fecha Inicio Prod. Program.",
    type: "date",
  },
  {
    key: "fecha_inicio_prod_real",
    label: "Fecha Inicio Prod. Real",
    type: "date",
  },
  { key: "estado_produccion", label: "Estado", type: "estado" },
  {
    key: "fecha_disponibilidad_programada",
    label: "Fecha Disponib. Program.",
    type: "date",
  },
  {
    key: "fecha_disponibilidad_real",
    label: "Fecha Disponib. Real",
    type: "date",
  },
  { key: "control_fisico", label: "Control Físico", type: "text" },
  { key: "observaciones", label: "Observaciones", type: "textarea" },
];

const CAMPOS_FECHA = new Set(
  COLUMNAS.filter((columna) => columna.type === "date").map(
    (columna) => columna.key,
  ),
);

function valorFechaInput(value) {
  if (!value) return "";

  const texto = String(value);

  if (/^\d{4}-\d{2}-\d{2}$/.test(texto)) {
    return texto;
  }

  const fecha = new Date(value);

  if (Number.isNaN(fecha.getTime())) {
    return "";
  }

  const anio = fecha.getFullYear();
  const mes = String(fecha.getMonth() + 1).padStart(2, "0");
  const dia = String(fecha.getDate()).padStart(2, "0");

  return `${anio}-${mes}-${dia}`;
}

function normalizarFilaServidor(fila) {
  const normalizada = {
    ...fila,
    cerrado_comercial: Boolean(fila?.cerrado_comercial),
  };

  CAMPOS_FECHA.forEach((campo) => {
    normalizada[campo] = valorFechaInput(fila?.[campo]);
  });

  return normalizada;
}

function crearFilaVacia() {
  const fila = {
    __tempId: `nuevo-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    __nuevo: true,
    __dirty: false,
    __versionLocal: 0,
    estado: "",
    caratula: "",
    version: "",
    fase: "",
    mrp: "",
    fecha_mrp: "",
    prioridad: "",
    etapa: "",
    cerrado_comercial: false,
    fecha_aprobacion: "",
    comercial: "",
    referencia: "",
    color: "",
    fecha_entrega: "",
    pedido_vidrios: "",
    proveedor_vidrios: "",
    cantidad_vidrios: "",
    fecha_recepcion_vidrios: "",
    curvos_formas: "",
    premarcos: "",
    mosquiteros: "",
    fecha_fabricacion_mosquiteros: "",
    complejidad: "",
    fecha_inicio_prod_programada: "",
    fecha_inicio_prod_real: "",
    estado_produccion: "",
    fecha_disponibilidad_programada: "",
    fecha_disponibilidad_real: "",
    control_fisico: "",
    observaciones: "",
  };

  return fila;
}

function claveFila(fila) {
  return fila?.id ? `id-${fila.id}` : fila?.__tempId;
}

async function solicitarJson(url, options = {}) {
  const response = await fetch(url, {
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
    ...options,
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(
      data?.error ||
        data?.detalle ||
        `Error ${response.status} al comunicarse con el servidor`,
    );
  }

  return data;
}

export default function CaratulasPage() {
  const [rows, setRows] = useState([]);
  const [estados, setEstados] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [estadoGuardado, setEstadoGuardado] = useState("");
  const [modalEstadosAbierto, setModalEstadosAbierto] = useState(false);

  const rowsRef = useRef([]);
  const guardandoRef = useRef(new Set());
  const reintentarRef = useRef(new Set());

  useEffect(() => {
    rowsRef.current = rows;
  }, [rows]);

  const nombresEstados = useMemo(
    () =>
      (estados || [])
        .map((item) => String(item?.nombre || "").trim())
        .filter(Boolean),
    [estados],
  );

  const cargarEstados = async () => {
    try {
      const data = await solicitarJson("/api/estado-resumen/estados");

      setEstados(Array.isArray(data?.rows) ? data.rows : []);
    } catch (err) {
      console.error("Error cargando estados:", err);
      setError(err.message || "No se pudieron cargar los estados.");
    }
  };

  const cargarDatos = async () => {
    try {
      setLoading(true);
      setError("");

      const data = await solicitarJson("/api/estado-resumen");

      const filas = Array.isArray(data?.rows)
        ? data.rows.map(normalizarFilaServidor)
        : [];

      setRows(filas);
    } catch (err) {
      console.error("Error cargando carátulas:", err);
      setError(err.message || "No se pudo cargar la tabla de carátulas.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    cargarDatos();
    cargarEstados();
  }, []);

  const agregarFila = () => {
    setRows((prev) => [...prev, crearFilaVacia()]);
  };

  const actualizarCampo = (fila, key, value) => {
    const clave = claveFila(fila);

    setRows((prev) =>
      prev.map((item) => {
        if (claveFila(item) !== clave) {
          return item;
        }

        return {
          ...item,
          [key]: value,
          __dirty: true,
          __versionLocal: Number(item.__versionLocal || 0) + 1,
        };
      }),
    );
  };

  const prepararBody = (fila) => {
    const body = {};

    COLUMNAS.forEach((columna) => {
      const value = fila?.[columna.key];

      if (columna.type === "checkbox") {
        body[columna.key] = Boolean(value);
        return;
      }

      if (columna.type === "number") {
        body[columna.key] =
          value === "" || value == null ? null : Number(value);
        return;
      }

      body[columna.key] =
        value === "" || value == null ? null : String(value).trim();
    });

    return body;
  };

  const guardarFila = async (claveSolicitada) => {
    const filaActual = rowsRef.current.find(
      (fila) => claveFila(fila) === claveSolicitada,
    );

    if (!filaActual || !filaActual.__dirty) {
      return;
    }

    if (!String(filaActual.estado || "").trim()) {
      setEstadoGuardado(
        "La fila todavía no se guardó porque falta seleccionar el primer Estado.",
      );
      return;
    }

    if (guardandoRef.current.has(claveSolicitada)) {
      reintentarRef.current.add(claveSolicitada);
      return;
    }

    guardandoRef.current.add(claveSolicitada);

    const versionAlGuardar = Number(filaActual.__versionLocal || 0);
    const eraNueva = Boolean(filaActual.__nuevo);

    try {
      setEstadoGuardado("Guardando...");

      const data = await solicitarJson(
        eraNueva
          ? "/api/estado-resumen"
          : `/api/estado-resumen/${filaActual.id}`,
        {
          method: eraNueva ? "POST" : "PUT",
          body: JSON.stringify(prepararBody(filaActual)),
        },
      );

      const filaServidor = normalizarFilaServidor(data?.row || {});
      let nuevaClave = claveSolicitada;
      let necesitaReintento = false;

      setRows((prev) =>
        prev.map((filaLocal) => {
          if (claveFila(filaLocal) !== claveSolicitada) {
            return filaLocal;
          }

          const cambioMientrasGuardaba =
            Number(filaLocal.__versionLocal || 0) > versionAlGuardar;

          const combinada = cambioMientrasGuardaba
            ? {
                ...filaServidor,
                ...filaLocal,
                id: filaServidor.id,
                __tempId: undefined,
                __nuevo: false,
                __dirty: true,
              }
            : {
                ...filaServidor,
                __nuevo: false,
                __dirty: false,
                __versionLocal: versionAlGuardar,
              };

          nuevaClave = claveFila(combinada);
          necesitaReintento = cambioMientrasGuardaba;

          return combinada;
        }),
      );

      setEstadoGuardado("Guardado");

      if (necesitaReintento) {
        window.setTimeout(() => guardarFila(nuevaClave), 50);
      }
    } catch (err) {
      console.error("Error guardando fila:", err);
      setEstadoGuardado("");
      setError(err.message || "No se pudo guardar la fila.");
    } finally {
      guardandoRef.current.delete(claveSolicitada);

      if (reintentarRef.current.has(claveSolicitada)) {
        reintentarRef.current.delete(claveSolicitada);

        window.setTimeout(() => {
          const fila = rowsRef.current.find(
            (item) => claveFila(item) === claveSolicitada,
          );

          if (fila) {
            guardarFila(claveSolicitada);
          }
        }, 50);
      }
    }
  };

  const eliminarFilaNueva = (fila) => {
    if (!fila?.__nuevo) {
      return;
    }

    const clave = claveFila(fila);

    setRows((prev) => prev.filter((item) => claveFila(item) !== clave));
  };

  const renderEstadoOptionFaltante = (value) => {
    const actual = String(value || "").trim();

    if (!actual || nombresEstados.includes(actual)) {
      return null;
    }

    return (
      <option value={actual}>
        {actual} (estado no definido)
      </option>
    );
  };

  const renderCelda = (fila, columna) => {
    const clave = claveFila(fila);
    const value = fila?.[columna.key];

    if (columna.type === "estado") {
      return (
        <select
          value={value || ""}
          onChange={(event) =>
            actualizarCampo(fila, columna.key, event.target.value)
          }
          onBlur={() => guardarFila(clave)}
        >
          <option value="">Seleccionar...</option>
          {renderEstadoOptionFaltante(value)}
          {nombresEstados.map((nombre) => (
            <option key={nombre} value={nombre}>
              {nombre}
            </option>
          ))}
        </select>
      );
    }

    if (columna.type === "checkbox") {
      return (
        <input
          type="checkbox"
          checked={Boolean(value)}
          onChange={(event) => {
            actualizarCampo(fila, columna.key, event.target.checked);

            window.setTimeout(() => guardarFila(clave), 0);
          }}
        />
      );
    }

    if (columna.type === "textarea") {
      return (
        <textarea
          rows={2}
          value={value || ""}
          onChange={(event) =>
            actualizarCampo(fila, columna.key, event.target.value)
          }
          onBlur={() => guardarFila(clave)}
        />
      );
    }

    return (
      <input
        type={columna.type}
        step={columna.type === "number" ? "any" : undefined}
        value={value ?? ""}
        onChange={(event) =>
          actualizarCampo(fila, columna.key, event.target.value)
        }
        onBlur={() => guardarFila(clave)}
      />
    );
  };

  return (
    <div className="caratulas-page">
      <div className="caratulas-toolbar">
        <div>
          <h1>Carátulas</h1>
          <p>
            Escribí directamente sobre la tabla. Los cambios se guardan al salir
            de cada campo.
          </p>
        </div>

        <div className="caratulas-toolbar-actions">
          <button type="button" onClick={agregarFila}>
            + Agregar fila
          </button>

          <button
            type="button"
            onClick={() => setModalEstadosAbierto(true)}
          >
            Administrar Estados
          </button>

          <button type="button" onClick={cargarDatos} disabled={loading}>
            {loading ? "Actualizando..." : "Actualizar"}
          </button>
        </div>
      </div>

      <div className="caratulas-status-row">
        {estadoGuardado && (
          <span className="caratulas-save-status">{estadoGuardado}</span>
        )}

        {error && (
          <span className="caratulas-error">{error}</span>
        )}
      </div>

      <div className="caratulas-table-wrap">
        <table className="caratulas-table">
          <thead>
            <tr>
              {COLUMNAS.map((columna, index) => (
                <th key={`${columna.key}-${index}`}>
                  {columna.label}
                </th>
              ))}
            </tr>
          </thead>

          <tbody>
            {rows.map((fila) => {
              const clave = claveFila(fila);

              return (
                <tr key={clave} className={fila.__nuevo ? "fila-nueva" : ""}>
                  {COLUMNAS.map((columna, index) => (
                    <td key={`${clave}-${columna.key}-${index}`}>
                      {renderCelda(fila, columna)}
                    </td>
                  ))}

                  {fila.__nuevo && (
                    <td className="caratulas-floating-delete-cell">
                      <button
                        type="button"
                        className="caratulas-delete-new"
                        onClick={() => eliminarFilaNueva(fila)}
                        title="Quitar fila nueva sin guardar"
                      >
                        ×
                      </button>
                    </td>
                  )}
                </tr>
              );
            })}

            {!loading && rows.length === 0 && (
              <tr>
                <td colSpan={COLUMNAS.length}>
                  No hay carátulas cargadas. Tocá “Agregar fila” para comenzar.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <EstadosModal
        abierto={modalEstadosAbierto}
        onClose={() => setModalEstadosAbierto(false)}
        onChanged={async () => {
          await cargarEstados();
          await cargarDatos();
        }}
      />
    </div>
  );
}