import React, { useEffect, useMemo, useState } from "react";
import { useAuth } from "../context/AuthContext";
import "../styles/planificacionProduccion.css";

const API_PLANIFICACION = "/api/planificacion-produccion";

// Sólo se usan para recuperar datos viejos que todavía puedan existir
// en el navegador. A partir de esta versión, la planificación oficial
// se guarda en SQL Server y es compartida.
const CLAVE_BORRADOR_LEGACY = "planificacionProduccion_borrador_v4";
const CLAVE_HISTORICOS_LEGACY = "planificacionProduccion_historicos_v4";

function normalizarTexto(valor) {
  return String(valor ?? "")
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .toUpperCase();
}

const OPERACIONES_CARGA_AUTOMATICA = new Set([
  "PREPARACION PERFIL",
  "CORTE REFUERZO",
  "CORTE PERFIL",
  "MECANIZADO",
  "SOLDADURA AUTO",
  "ARMADO",
  "ACRISTALADO",
  "MOSQUITERO",
]);

// ============================================================
// CONFIGURACIÓN VISUAL DE LA TABLA DE PLANIFICACIÓN
// ============================================================
// Se usan los mismos anchos definidos actualmente en el CSS para
// poder inmovilizar columnas sin que se superpongan.
const ANCHO_OBRA_FIJA = 145;
const ANCHO_FASE_FIJA = 125;
const ANCHO_SECTOR_FIJO = 180;
const ALTO_CABECERA_FECHA = 32;

const estiloCabeceraFechaDia = {
  position: "sticky",
  top: 0,
  zIndex: 8,
  background: "#f4f4f4",
};

const estiloCabeceraFecha = {
  position: "sticky",
  top: ALTO_CABECERA_FECHA,
  zIndex: 8,
  background: "#f8fafc",
};

const estiloCabeceraObra = {
  position: "sticky",
  left: 0,
  top: 0,
  zIndex: 11,
  width: ANCHO_OBRA_FIJA,
  minWidth: ANCHO_OBRA_FIJA,
  background: "#eef2f6",
  boxShadow: "2px 0 5px rgba(15, 23, 42, 0.08)",
};

const estiloCabeceraFase = {
  position: "sticky",
  left: ANCHO_OBRA_FIJA,
  top: 0,
  zIndex: 11,
  width: ANCHO_FASE_FIJA,
  minWidth: ANCHO_FASE_FIJA,
  background: "#eef2f6",
};

const estiloCabeceraSector = {
  position: "sticky",
  left: ANCHO_OBRA_FIJA + ANCHO_FASE_FIJA,
  top: 0,
  zIndex: 11,
  width: ANCHO_SECTOR_FIJO,
  minWidth: ANCHO_SECTOR_FIJO,
  background: "#eef2f6",
  boxShadow: "2px 0 5px rgba(15, 23, 42, 0.10)",
};

const estiloCeldaObra = {
  position: "sticky",
  left: 0,
  zIndex: 4,
  width: ANCHO_OBRA_FIJA,
  minWidth: ANCHO_OBRA_FIJA,
  background: "#ffffff",
};

const estiloCeldaFase = {
  position: "sticky",
  left: ANCHO_OBRA_FIJA,
  zIndex: 4,
  width: ANCHO_FASE_FIJA,
  minWidth: ANCHO_FASE_FIJA,
  background: "#ffffff",
};

const estiloCeldaSector = {
  position: "sticky",
  left: ANCHO_OBRA_FIJA + ANCHO_FASE_FIJA,
  zIndex: 4,
  width: ANCHO_SECTOR_FIJO,
  minWidth: ANCHO_SECTOR_FIJO,
  background: "#ffffff",
  boxShadow: "2px 0 5px rgba(15, 23, 42, 0.10)",
};

const estiloScrollTablaObras = {
  maxHeight: "68vh",
  overflow: "auto",
  position: "relative",
};

function obtenerSiguienteId(filas) {
  if (!Array.isArray(filas) || filas.length === 0) {
    return 1;
  }

  return Math.max(...filas.map((fila) => Number(fila.id) || 0)) + 1;
}

function crearFilaVacia(id) {
  return {
    id,
    obra: "",
    sectorId: "",
    cantidad: "",
    tiempoStd: "",
    tiempoStdBase: "",
    tiempoStdEspecifico: false,
    totalHoras: "",
    fase: "",
    cantidadesPorDia: {},
  };
}

function crearFilaTipoMaterial(id) {
  return {
    id,
    sectorId: "",
    tipo: "",
  };
}

function crearFilaMaterialExcluir(id) {
  return {
    id,
    sectorId: "",
    codigo: "",
    descripcion: "",
    idArticulo: null,
    estado: "vacio",
    mensaje: "",
  };
}

function crearFilasIniciales() {
  return [crearFilaVacia(1)];
}

function obtenerMesActual() {
  const fecha = new Date();

  return `${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(
    2,
    "0",
  )}`;
}

function obtenerDiasHabiles(anio, mes) {
  const dias = [];
  const fecha = new Date(anio, mes, 1);

  while (fecha.getMonth() === mes) {
    const diaSemana = fecha.getDay();

    if (diaSemana !== 0 && diaSemana !== 6) {
      dias.push(new Date(fecha));
    }

    fecha.setDate(fecha.getDate() + 1);
  }

  return dias;
}

function formatearDia(fecha) {
  const texto = fecha.toLocaleDateString("es-AR", {
    weekday: "long",
  });

  return texto.charAt(0).toUpperCase() + texto.slice(1).replace(".", "");
}

function formatearFecha(fecha) {
  return fecha.toLocaleDateString("es-AR");
}

function crearClaveFecha(fecha) {
  const anio = fecha.getFullYear();
  const mes = String(fecha.getMonth() + 1).padStart(2, "0");
  const dia = String(fecha.getDate()).padStart(2, "0");

  return `${anio}-${mes}-${dia}`;
}

function convertirNumero(valor) {
  const numero = Number(valor);
  return Number.isFinite(numero) ? numero : 0;
}

function obtenerRangoMes(mesTexto) {
  const [anio, mes] = String(mesTexto || "")
    .split("-")
    .map(Number);

  if (!Number.isInteger(anio) || !Number.isInteger(mes)) {
    return {
      inicio: "",
      fin: "",
    };
  }

  const ultimoDia = new Date(anio, mes, 0).getDate();

  return {
    inicio: `${anio}-${String(mes).padStart(2, "0")}-01`,
    fin: `${anio}-${String(mes).padStart(2, "0")}-${String(ultimoDia).padStart(
      2,
      "0",
    )}`,
  };
}

function calcularHoras(cantidad, tiempoStd) {
  const cantidadNumero = convertirNumero(cantidad);
  const tiempoNumero = convertirNumero(tiempoStd);

  if (cantidadNumero <= 0 || tiempoNumero <= 0) {
    return "";
  }

  return ((cantidadNumero * tiempoNumero) / 60).toFixed(2);
}

function leerLocalStorageLegacy(clave) {
  try {
    const contenido = localStorage.getItem(clave);
    return contenido ? JSON.parse(contenido) : null;
  } catch {
    return null;
  }
}

function obtenerPlanificacionLegacy(mes) {
  const borrador = leerLocalStorageLegacy(CLAVE_BORRADOR_LEGACY);

  const desdeBorrador = borrador?.planificaciones?.[mes];

  if (Array.isArray(desdeBorrador) && desdeBorrador.length > 0) {
    return desdeBorrador;
  }

  if (
    borrador?.mesSeleccionado === mes &&
    Array.isArray(borrador?.obras) &&
    borrador.obras.length > 0
  ) {
    return borrador.obras;
  }

  const historicos = leerLocalStorageLegacy(CLAVE_HISTORICOS_LEGACY);
  const historico = historicos?.[mes];

  if (Array.isArray(historico?.obras) && historico.obras.length > 0) {
    return historico.obras;
  }

  return null;
}

async function solicitarJson(url, opciones = {}) {
  const respuesta = await fetch(url, {
    ...opciones,
    headers: {
      "Content-Type": "application/json",
      ...(opciones.headers || {}),
    },
  });

  let contenido = null;

  try {
    contenido = await respuesta.json();
  } catch {
    contenido = null;
  }

  if (!respuesta.ok) {
    throw new Error(
      contenido?.error ||
        contenido?.message ||
        contenido?.detalle ||
        `Error HTTP ${respuesta.status}`,
    );
  }

  return contenido;
}

function normalizarOperacion(fila) {
  return {
    id: Number(fila.id_operacion ?? fila.id),
    nombre: String(fila.nombre ?? fila.operacion ?? "").trim(),
    tiempoStd: fila.tiempo_std ?? fila.tiempoStd ?? 0,
  };
}

function normalizarTipoMaterial(fila, indice) {
  return {
    id: Number(fila.id_tipo_material ?? fila.id ?? indice + 1),
    sectorId: String(fila.id_operacion ?? fila.sectorId ?? ""),
    tipo: String(fila.tipo ?? "").trim(),
  };
}

function normalizarMaterialExcluir(fila, indice) {
  return {
    id: Number(fila.id_material_excluir ?? fila.id ?? indice + 1),
    sectorId: String(fila.id_operacion ?? fila.sectorId ?? ""),
    codigo: String(fila.codigo ?? "").trim(),
    descripcion: String(fila.descripcion ?? "").trim(),
    idArticulo: Number(fila.id_articulo ?? fila.idArticulo) || null,
    estado: fila.id_articulo || fila.idArticulo ? "valido" : "pendiente",
    mensaje: "",
  };
}

function PlanificacionProduccion() {
  const { token } = useAuth();
  const mesInicial = obtenerMesActual();

  const [mesSeleccionado, setMesSeleccionado] = useState(mesInicial);

  const [sectores, setSectores] = useState([]);

  const [obras, setObras] = useState(crearFilasIniciales);

  const [tiposMaterialPorOperacion, setTiposMaterialPorOperacion] = useState(
    [],
  );
  const [materialesExcluir, setMaterialesExcluir] = useState([]);
  const [tiposArticulos, setTiposArticulos] = useState([]);

  const [cargandoConfiguracion, setCargandoConfiguracion] = useState(true);
  const [guardandoConfiguracion, setGuardandoConfiguracion] = useState(false);
  const [cargandoPlanificacion, setCargandoPlanificacion] = useState(true);
  const [guardandoPlanificacion, setGuardandoPlanificacion] = useState(false);
  const [filaCalculando, setFilaCalculando] = useState(null);
  const [errorGeneral, setErrorGeneral] = useState("");
  const [errorTipos, setErrorTipos] = useState("");

  const [modalTiemposAbierto, setModalTiemposAbierto] = useState(false);
  const [modalTiposMaterialAbierto, setModalTiposMaterialAbierto] =
    useState(false);
  const [modalExcluirAbierto, setModalExcluirAbierto] = useState(false);
  const [modalHistoricoAbierto, setModalHistoricoAbierto] = useState(false);
  const [modalExportarAbierto, setModalExportarAbierto] = useState(false);
  const [exportandoOrdenes, setExportandoOrdenes] = useState(false);

  const rangoExportacionInicial = obtenerRangoMes(mesInicial);

  const [fechaInicioExportar, setFechaInicioExportar] = useState(
    rangoExportacionInicial.inicio,
  );

  const [fechaFinExportar, setFechaFinExportar] = useState(
    rangoExportacionInicial.fin,
  );

  const [mesHistorico, setMesHistorico] = useState(obtenerMesActual());
  const [nuevoSector, setNuevoSector] = useState("");

  const diasHabiles = useMemo(() => {
    if (!mesSeleccionado) {
      return [];
    }

    const [anio, mes] = mesSeleccionado.split("-").map(Number);

    return obtenerDiasHabiles(anio, mes - 1);
  }, [mesSeleccionado]);

  const sectoresPorId = useMemo(() => {
    return sectores.reduce((resultado, sector) => {
      resultado[String(sector.id)] = sector;
      return resultado;
    }, {});
  }, [sectores]);

  const totalesPorSectorYFecha = useMemo(() => {
    const totales = {};

    obras.forEach((obra) => {
      if (!obra.sectorId) {
        return;
      }

      const tiempoStd = convertirNumero(obra.tiempoStd);

      if (tiempoStd <= 0) {
        return;
      }

      Object.entries(obra.cantidadesPorDia || {}).forEach(
        ([claveFecha, cantidad]) => {
          const cantidadNumero = convertirNumero(cantidad);

          if (cantidadNumero <= 0) {
            return;
          }

          const clave = `${obra.sectorId}-${claveFecha}`;

          totales[clave] =
            (totales[clave] || 0) + (cantidadNumero * tiempoStd) / 60;
        },
      );
    });

    return totales;
  }, [obras]);

  const cargarPlanificacionCompartida = async (mes, opciones = {}) => {
    const { avisarSiNoExiste = false } = opciones;

    if (!mes) {
      return false;
    }

    try {
      setCargandoPlanificacion(true);
      setErrorGeneral("");

      const respuesta = await solicitarJson(
        `${API_PLANIFICACION}/planificacion?mes=${encodeURIComponent(mes)}`,
      );

      if (!respuesta?.existe) {
        const planificacionLegacy = obtenerPlanificacionLegacy(mes);

        if (Array.isArray(planificacionLegacy) && planificacionLegacy.length > 0) {
          setObras(planificacionLegacy);

          return false;
        }

        setObras(crearFilasIniciales());

        if (avisarSiNoExiste) {
          window.alert(`No existe una planificación guardada para ${mes}.`);
        }

        return false;
      }

      setObras(
        Array.isArray(respuesta.obras) && respuesta.obras.length > 0
          ? respuesta.obras
          : crearFilasIniciales(),
      );

      return true;
    } catch (error) {
      console.error("Error al cargar planificación compartida:", error);
      setErrorGeneral(error.message);
      window.alert(error.message);
      return false;
    } finally {
      setCargandoPlanificacion(false);
    }
  };

  useEffect(() => {
    const cargarConfiguracionInicial = async () => {
      try {
        setCargandoConfiguracion(true);
        setErrorGeneral("");

        const [
          operacionesRespuesta,
          tiposRespuesta,
          tiposMaterialRespuesta,
          materialesExcluirRespuesta,
        ] = await Promise.all([
          solicitarJson(`${API_PLANIFICACION}/operaciones`),
          solicitarJson(`${API_PLANIFICACION}/tipos-articulos`),
          solicitarJson(`${API_PLANIFICACION}/tipos-material`),
          solicitarJson(`${API_PLANIFICACION}/materiales-excluir`),
        ]);

        const operacionesNormalizadas = Array.isArray(operacionesRespuesta)
          ? operacionesRespuesta.map(normalizarOperacion)
          : [];

        setSectores(operacionesNormalizadas);
        setTiposArticulos(
          Array.isArray(tiposRespuesta)
            ? tiposRespuesta
                .map((tipo) => String(tipo || "").trim())
                .filter(Boolean)
            : [],
        );
        setTiposMaterialPorOperacion(
          Array.isArray(tiposMaterialRespuesta)
            ? tiposMaterialRespuesta.map(normalizarTipoMaterial)
            : [],
        );
        setMaterialesExcluir(
          Array.isArray(materialesExcluirRespuesta)
            ? materialesExcluirRespuesta.map(normalizarMaterialExcluir)
            : [],
        );

        if (operacionesNormalizadas.length > 0) {
          setObras((estadoAnterior) =>
            estadoAnterior.map((obra) => {
              const sector =
                operacionesNormalizadas.find(
                  (item) => String(item.id) === String(obra.sectorId),
                ) || null;

              if (!sector) {
                return obra;
              }

              if (obra.tiempoStdEspecifico) {
                return {
                  ...obra,
                  tiempoStdBase: String(sector.tiempoStd ?? ""),
                  totalHoras: calcularHoras(obra.cantidad, obra.tiempoStd),
                };
              }

              return {
                ...obra,
                tiempoStd: String(sector.tiempoStd ?? ""),
                tiempoStdBase: String(sector.tiempoStd ?? ""),
                tiempoStdEspecifico: false,
                totalHoras: calcularHoras(obra.cantidad, sector.tiempoStd),
              };
            }),
          );
        }
      } catch (error) {
        console.error("Error al cargar configuración:", error);
        setErrorGeneral(
          `${error.message}. Verificá que el router esté montado en ${API_PLANIFICACION}.`,
        );
      } finally {
        setCargandoConfiguracion(false);
      }
    };

    cargarConfiguracionInicial();
  }, []);

  useEffect(() => {
    cargarPlanificacionCompartida(mesInicial);
    // La carga inicial de la planificación compartida debe ejecutarse una vez.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const recargarOperaciones = async () => {
    const respuesta = await solicitarJson(`${API_PLANIFICACION}/operaciones`);

    const operacionesNormalizadas = Array.isArray(respuesta)
      ? respuesta.map(normalizarOperacion)
      : [];

    setSectores(operacionesNormalizadas);
    return operacionesNormalizadas;
  };

  const recargarTiposMaterial = async () => {
    const respuesta = await solicitarJson(
      `${API_PLANIFICACION}/tipos-material`,
    );

    setTiposMaterialPorOperacion(
      Array.isArray(respuesta) ? respuesta.map(normalizarTipoMaterial) : [],
    );
  };

  const recargarMaterialesExcluir = async () => {
    const respuesta = await solicitarJson(
      `${API_PLANIFICACION}/materiales-excluir`,
    );

    setMaterialesExcluir(
      Array.isArray(respuesta) ? respuesta.map(normalizarMaterialExcluir) : [],
    );
  };

  const actualizarObra = (id, campo, valor) => {
    setObras((estadoAnterior) =>
      estadoAnterior.map((obra) => {
        if (obra.id !== id) {
          return obra;
        }

        const actualizada = {
          ...obra,
          [campo]: valor,
        };

        if (campo === "sectorId") {
          const sector = sectoresPorId[String(valor)];

          actualizada.tiempoStd = sector ? String(sector.tiempoStd ?? "") : "";
          actualizada.tiempoStdBase = actualizada.tiempoStd;
          actualizada.tiempoStdEspecifico = false;
        }

        actualizada.totalHoras = calcularHoras(
          actualizada.cantidad,
          actualizada.tiempoStd,
        );

        return actualizada;
      }),
    );
  };

  const actualizarCantidadDia = (id, fecha, valor) => {
    const claveFecha = crearClaveFecha(fecha);

    setObras((estadoAnterior) =>
      estadoAnterior.map((obra) =>
        obra.id === id
          ? {
              ...obra,
              cantidadesPorDia: {
                ...obra.cantidadesPorDia,
                [claveFecha]: valor,
              },
            }
          : obra,
      ),
    );
  };

  const agregarFila = () => {
    setObras((estadoAnterior) => [
      ...estadoAnterior,
      crearFilaVacia(obtenerSiguienteId(estadoAnterior)),
    ]);
  };

  const eliminarFila = (id) => {
    setObras((estadoAnterior) =>
      estadoAnterior.filter((obra) => obra.id !== id),
    );
  };

  const cambiarMesPlanificacion = async (nuevoMes) => {
    if (!nuevoMes || nuevoMes === mesSeleccionado) {
      return;
    }

    setMesSeleccionado(nuevoMes);

    const rango = obtenerRangoMes(nuevoMes);
    setFechaInicioExportar(rango.inicio);
    setFechaFinExportar(rango.fin);

    await cargarPlanificacionCompartida(nuevoMes);
  };

  const manejarEnterTablaObras = (event) => {
    if (event.key !== "Enter") {
      return;
    }

    const elementoActual = event.target;

    // Solo actuar sobre inputs y selects
    if (
      elementoActual.tagName !== "INPUT" &&
      elementoActual.tagName !== "SELECT"
    ) {
      return;
    }

    const celdaActual = elementoActual.closest("td");
    const filaActual = elementoActual.closest("tr");

    if (!celdaActual || !filaActual) {
      return;
    }

    event.preventDefault();

    const indiceColumna = celdaActual.cellIndex;
    let filaSiguiente = filaActual.nextElementSibling;

    while (filaSiguiente) {
      const celdaSiguiente = filaSiguiente.cells[indiceColumna];

      if (celdaSiguiente) {
        const siguienteCampo = celdaSiguiente.querySelector(
          "input:not([disabled]), select:not([disabled])",
        );

        if (siguienteCampo) {
          siguienteCampo.focus();

          // Si es input, seleccionar el contenido para poder reemplazarlo
          // directamente escribiendo.
          if (
            siguienteCampo.tagName === "INPUT" &&
            typeof siguienteCampo.select === "function"
          ) {
            siguienteCampo.select();
          }

          return;
        }
      }

      filaSiguiente = filaSiguiente.nextElementSibling;
    }
  };

  const actualizarTiempoSectorLocal = (id, valor) => {
    setSectores((estadoAnterior) =>
      estadoAnterior.map((sector) =>
        sector.id === id ? { ...sector, tiempoStd: valor } : sector,
      ),
    );

    setObras((estadoAnterior) =>
      estadoAnterior.map((obra) => {
        if (String(obra.sectorId) !== String(id)) {
          return obra;
        }

        if (obra.tiempoStdEspecifico) {
          return {
            ...obra,
            tiempoStdBase: valor,
            totalHoras: calcularHoras(obra.cantidad, obra.tiempoStd),
          };
        }

        return {
          ...obra,
          tiempoStd: valor,
          tiempoStdBase: valor,
          totalHoras: calcularHoras(obra.cantidad, valor),
        };
      }),
    );
  };

  const guardarTiempoSector = async (sector) => {
    try {
      setErrorGeneral("");

      await solicitarJson(`${API_PLANIFICACION}/operaciones/${sector.id}`, {
        method: "PUT",
        body: JSON.stringify({
          nombre: sector.nombre,
          tiempo_std: convertirNumero(sector.tiempoStd),
        }),
      });

      await recargarOperaciones();
    } catch (error) {
      console.error("Error al guardar tiempo estándar:", error);
      setErrorGeneral(error.message);
      window.alert(error.message);
    }
  };

  const guardarTiempoStdObra = async (obra) => {
    const obraVersion = String(obra.obra || "")
      .trim()
      .replace(",", ".");
    const fase = Number(obra.fase);
    const idOperacion = Number(obra.sectorId);
    const tiempoStd = convertirNumero(obra.tiempoStd);

    if (!obraVersion || !obraVersion.includes(".")) {
      window.alert(
        "Para guardar un STD específico, la fila debe tener Obra/Versión con formato OBRA.VERSION.",
      );
      return;
    }

    if (!Number.isInteger(fase)) {
      window.alert(
        "Para guardar un STD específico, la fila debe tener una fase válida.",
      );
      return;
    }

    if (!Number.isInteger(idOperacion)) {
      window.alert(
        "Para guardar un STD específico, la fila debe tener una operación válida.",
      );
      return;
    }

    if (tiempoStd < 0) {
      window.alert("El tiempo STD no puede ser negativo.");
      return;
    }

    try {
      setErrorGeneral("");

      const respuesta = await solicitarJson(
        `${API_PLANIFICACION}/tiempos-obra`,
        {
          method: "PUT",
          body: JSON.stringify({
            obraVersion,
            fase,
            id_operacion: idOperacion,
            tiempo_std: tiempoStd,
          }),
        },
      );

      const tiempoBase = convertirNumero(respuesta?.tiempo_std_base);
      const tiempoEspecifico = convertirNumero(respuesta?.tiempo_std);

      setObras((estadoAnterior) =>
        estadoAnterior.map((fila) => {
          const mismaClave =
            String(fila.obra || "")
              .trim()
              .replace(",", ".")
              .toUpperCase() ===
              String(respuesta?.obra_version || obraVersion).toUpperCase() &&
            Number(fila.fase) === fase &&
            Number(fila.sectorId) === idOperacion;

          if (!mismaClave) {
            return fila;
          }

          return {
            ...fila,
            obra: respuesta?.obra_version || obraVersion,
            tiempoStd: String(tiempoEspecifico),
            tiempoStdBase: String(tiempoBase),
            tiempoStdEspecifico: Boolean(respuesta?.tiempo_std_especifico),
            totalHoras: calcularHoras(fila.cantidad, tiempoEspecifico),
          };
        }),
      );
    } catch (error) {
      console.error("Error al guardar STD específico:", error);
      setErrorGeneral(error.message);
      window.alert(error.message);
    }
  };

  const agregarSector = async () => {
    const nombre = nuevoSector.trim();

    if (!nombre) {
      return;
    }

    try {
      setErrorGeneral("");

      await solicitarJson(`${API_PLANIFICACION}/operaciones`, {
        method: "POST",
        body: JSON.stringify({
          nombre,
          tiempo_std: 0,
        }),
      });

      await recargarOperaciones();
      setNuevoSector("");
    } catch (error) {
      console.error("Error al crear operación:", error);
      setErrorGeneral(error.message);
      window.alert(error.message);
    }
  };

  const eliminarSector = async (id) => {
    const sectorUsado = obras.some(
      (obra) => String(obra.sectorId) === String(id),
    );

    if (sectorUsado) {
      window.alert("La operación está siendo utilizada en la planificación.");
      return;
    }

    if (!window.confirm("¿Eliminar esta operación?")) {
      return;
    }

    try {
      await solicitarJson(`${API_PLANIFICACION}/operaciones/${id}`, {
        method: "DELETE",
      });

      await Promise.all([
        recargarOperaciones(),
        recargarTiposMaterial(),
        recargarMaterialesExcluir(),
      ]);
    } catch (error) {
      console.error("Error al eliminar operación:", error);
      window.alert(error.message);
    }
  };

  const agregarFilaTipoMaterial = () => {
    setTiposMaterialPorOperacion((estadoAnterior) => [
      ...estadoAnterior,
      crearFilaTipoMaterial(obtenerSiguienteId(estadoAnterior)),
    ]);
  };

  const actualizarFilaTipoMaterial = (id, campo, valor) => {
    setTiposMaterialPorOperacion((estadoAnterior) =>
      estadoAnterior.map((fila) =>
        fila.id === id ? { ...fila, [campo]: valor } : fila,
      ),
    );
  };

  const eliminarFilaTipoMaterial = (id) => {
    setTiposMaterialPorOperacion((estadoAnterior) =>
      estadoAnterior.filter((fila) => fila.id !== id),
    );
  };

  const guardarTiposMaterial = async () => {
    const filasIncompletas = tiposMaterialPorOperacion.some(
      (fila) => !fila.sectorId || !fila.tipo,
    );

    if (filasIncompletas) {
      window.alert(
        "Todas las filas deben tener una operación y un tipo de material.",
      );
      return;
    }

    try {
      setGuardandoConfiguracion(true);
      setErrorTipos("");

      await solicitarJson(`${API_PLANIFICACION}/tipos-material`, {
        method: "PUT",
        body: JSON.stringify({
          filas: tiposMaterialPorOperacion.map((fila) => ({
            id_operacion: Number(fila.sectorId),
            tipo: fila.tipo,
          })),
        }),
      });

      await recargarTiposMaterial();
      setModalTiposMaterialAbierto(false);
    } catch (error) {
      console.error("Error al guardar tipos de material:", error);
      setErrorTipos(error.message);
    } finally {
      setGuardandoConfiguracion(false);
    }
  };

  const agregarFilaMaterialExcluir = () => {
    setMaterialesExcluir((estadoAnterior) => [
      ...estadoAnterior,
      crearFilaMaterialExcluir(obtenerSiguienteId(estadoAnterior)),
    ]);
  };

  const actualizarFilaMaterialExcluir = (id, campo, valor) => {
    setMaterialesExcluir((estadoAnterior) =>
      estadoAnterior.map((fila) => {
        if (fila.id !== id) {
          return fila;
        }

        if (campo === "codigo") {
          return {
            ...fila,
            codigo: valor.toUpperCase(),
            descripcion: "",
            idArticulo: null,
            estado: valor.trim() ? "pendiente" : "vacio",
            mensaje: "",
          };
        }

        return {
          ...fila,
          [campo]: valor,
        };
      }),
    );
  };

  const buscarMaterialExcluir = async (id) => {
    const fila = materialesExcluir.find((item) => item.id === id);
    const codigo = String(fila?.codigo || "").trim();

    if (!codigo) {
      return;
    }

    setMaterialesExcluir((estadoAnterior) =>
      estadoAnterior.map((item) =>
        item.id === id
          ? {
              ...item,
              estado: "buscando",
              mensaje: "",
            }
          : item,
      ),
    );

    try {
      const articulo = await solicitarJson(
        `${API_PLANIFICACION}/articulos/codigo/${encodeURIComponent(codigo)}`,
      );

      setMaterialesExcluir((estadoAnterior) =>
        estadoAnterior.map((item) =>
          item.id === id
            ? {
                ...item,
                codigo: String(articulo.codigo || codigo),
                descripcion: String(articulo.descripcion || ""),
                idArticulo: Number(articulo.id_articulo) || null,
                estado: articulo.id_articulo ? "valido" : "inexistente",
                mensaje: articulo.id_articulo ? "" : "El código no existe.",
              }
            : item,
        ),
      );
    } catch (error) {
      setMaterialesExcluir((estadoAnterior) =>
        estadoAnterior.map((item) =>
          item.id === id
            ? {
                ...item,
                descripcion: "",
                idArticulo: null,
                estado: String(error.message)
                  .toLowerCase()
                  .includes("no encontrado")
                  ? "inexistente"
                  : "error",
                mensaje: error.message,
              }
            : item,
        ),
      );
    }
  };

  const eliminarFilaMaterialExcluir = (id) => {
    setMaterialesExcluir((estadoAnterior) =>
      estadoAnterior.filter((fila) => fila.id !== id),
    );
  };

  const guardarMaterialesExcluir = async () => {
    const filasIncompletas = materialesExcluir.some(
      (fila) => !fila.sectorId || !fila.idArticulo || fila.estado !== "valido",
    );

    if (filasIncompletas) {
      window.alert(
        "Todas las filas deben tener operación y un código de artículo válido.",
      );
      return;
    }

    try {
      setGuardandoConfiguracion(true);

      await solicitarJson(`${API_PLANIFICACION}/materiales-excluir`, {
        method: "PUT",
        body: JSON.stringify({
          filas: materialesExcluir.map((fila) => ({
            id_operacion: Number(fila.sectorId),
            id_articulo: Number(fila.idArticulo),
          })),
        }),
      });

      await recargarMaterialesExcluir();
      setModalExcluirAbierto(false);
    } catch (error) {
      console.error("Error al guardar materiales excluidos:", error);
      window.alert(error.message);
    } finally {
      setGuardandoConfiguracion(false);
    }
  };

  const cargarOperacionesDeFila = async (filaOrigen) => {
    const obraVersion = String(filaOrigen.obra || "")
      .trim()
      .replace(",", ".");
    const faseTexto = String(filaOrigen.fase || "").trim();
    const fase = Number(faseTexto);

    if (!obraVersion || !obraVersion.includes(".")) {
      window.alert(
        "Ingrese Obra/Versión con el formato OBRA.VERSION, por ejemplo 12345.2.",
      );
      return;
    }

    if (!Number.isInteger(fase)) {
      window.alert("La fase debe ser un número entero.");
      return;
    }

    const obraNormalizada = obraVersion.toUpperCase();

    const yaExiste = obras.some(
      (obra) =>
        obra.id !== filaOrigen.id &&
        String(obra.obra || "")
          .trim()
          .replace(",", ".")
          .toUpperCase() === obraNormalizada &&
        Number(obra.fase) === fase,
    );

    if (yaExiste) {
      const continuar = window.confirm(
        `Ya existen operaciones cargadas para la obra ${obraVersion}, fase ${fase}.\n\n` +
          "Si continúa, se agregará un nuevo conjunto sin eliminar las filas existentes.\n\n" +
          "¿Desea continuar?",
      );

      if (!continuar) {
        return;
      }
    }

    try {
      setFilaCalculando(filaOrigen.id);
      setErrorGeneral("");

      const respuesta = await solicitarJson(
        `${API_PLANIFICACION}/calcular-materiales`,
        {
          method: "POST",
          body: JSON.stringify({
            obraVersion,
            fase,
          }),
        },
      );

      const operacionesRespuesta = Array.isArray(respuesta?.operaciones)
        ? respuesta.operaciones.filter((operacion) =>
            OPERACIONES_CARGA_AUTOMATICA.has(
              normalizarTexto(operacion.operacion),
            ),
          )
        : [];

      if (operacionesRespuesta.length === 0) {
        window.alert(
          "La consulta no devolvió ninguna de las operaciones habilitadas para carga automática.",
        );
        return;
      }

      setObras((estadoAnterior) => {
        const siguienteIdInicial = obtenerSiguienteId(estadoAnterior);

        const nuevasFilas = operacionesRespuesta.map((operacion, indice) => {
          const cantidad = convertirNumero(operacion.cantidad);
          const tiempoStd = convertirNumero(operacion.tiempo_std);

          return {
            ...crearFilaVacia(siguienteIdInicial + indice),
            obra: respuesta.obraVersion || obraVersion,
            sectorId: String(operacion.id_operacion),
            cantidad: cantidad === 0 ? "0" : String(cantidad),
            tiempoStd: String(tiempoStd),
            tiempoStdBase: String(convertirNumero(operacion.tiempo_std_base)),
            tiempoStdEspecifico: Boolean(operacion.tiempo_std_especifico),
            totalHoras: calcularHoras(cantidad, tiempoStd),
            fase: String(respuesta.fase ?? fase),
          };
        });

        const filaOrigenVacia =
          !filaOrigen.sectorId &&
          !filaOrigen.cantidad &&
          !filaOrigen.tiempoStd &&
          !filaOrigen.totalHoras &&
          Object.keys(filaOrigen.cantidadesPorDia || {}).length === 0;

        if (filaOrigenVacia) {
          return [
            ...estadoAnterior.filter((obra) => obra.id !== filaOrigen.id),
            ...nuevasFilas,
          ];
        }

        return [...estadoAnterior, ...nuevasFilas];
      });

      const ignorados = respuesta?.materialesIgnorados?.length || 0;
      const excluidos = respuesta?.materialesExcluidos?.length || 0;

      window.alert(
        `Se agregaron ${operacionesRespuesta.length} operaciones.\n` +
          `Materiales ignorados: ${ignorados}.\n` +
          `Materiales excluidos: ${excluidos}.`,
      );
    } catch (error) {
      console.error("Error al cargar operaciones:", error);
      setErrorGeneral(error.message);
      window.alert(error.message);
    } finally {
      setFilaCalculando(null);
    }
  };

  const abrirModalExportar = () => {
    const rango = obtenerRangoMes(mesSeleccionado);

    setFechaInicioExportar(rango.inicio);
    setFechaFinExportar(rango.fin);
    setModalExportarAbierto(true);
  };

  const exportarOrdenesTrabajo = async () => {
    if (!fechaInicioExportar || !fechaFinExportar) {
      window.alert("Debe indicar fecha de inicio y fecha de fin.");
      return;
    }

    if (fechaInicioExportar > fechaFinExportar) {
      window.alert(
        "La fecha de inicio no puede ser posterior a la fecha de fin.",
      );
      return;
    }

    try {
      setExportandoOrdenes(true);
      setErrorGeneral("");

      const agrupadas = new Map();

      for (const obra of obras) {
        const obraVersion = String(obra.obra || "")
          .trim()
          .replace(",", ".");

        const fase = Number(obra.fase);
        const sector = sectoresPorId[String(obra.sectorId)];

        for (const [fecha, cantidadRaw] of Object.entries(
          obra.cantidadesPorDia || {},
        )) {
          const cantidad = convertirNumero(cantidadRaw);

          if (
            fecha < fechaInicioExportar ||
            fecha > fechaFinExportar ||
            cantidad <= 0
          ) {
            continue;
          }

          if (!obraVersion || !obraVersion.includes(".")) {
            throw new Error(
              `Hay una fila planificada para ${fecha} sin Obra/Versión válida.`,
            );
          }

          if (!Number.isInteger(fase)) {
            throw new Error(`La obra ${obraVersion} tiene una fase inválida.`);
          }

          if (!sector) {
            throw new Error(
              `La obra ${obraVersion} tiene una operación/sector inválido.`,
            );
          }

          const clave = `${fecha}|${obraVersion.toUpperCase()}|${fase}|${sector.id}`;

          const actual = agrupadas.get(clave) || {
            fecha_planificada: fecha,
            obra_version: obraVersion,
            fase,
            id_operacion: Number(sector.id),
            operacion: sector.nombre,
            cantidad_pedida: 0,
          };

          actual.cantidad_pedida += cantidad;
          agrupadas.set(clave, actual);
        }
      }

      const ordenesBase = Array.from(agrupadas.values());

      if (!ordenesBase.length) {
        window.alert(
          "No hay cantidades planificadas dentro del rango seleccionado.",
        );
        return;
      }

      /*
       * La planificación actualmente vive en el frontend.
       * Para obtener materiales usamos la misma API que ya utiliza
       * el botón Cargar, una sola vez por Obra/Versión + Fase.
       */
      const calculosPorObraFase = new Map();

      const clavesCalculo = [
        ...new Set(
          ordenesBase.map(
            (orden) => `${orden.obra_version.toUpperCase()}|${orden.fase}`,
          ),
        ),
      ];

      await Promise.all(
        clavesCalculo.map(async (clave) => {
          const [obraVersion, faseTexto] = clave.split("|");
          const fase = Number(faseTexto);

          const respuesta = await solicitarJson(
            `${API_PLANIFICACION}/calcular-materiales`,
            {
              method: "POST",
              body: JSON.stringify({
                obraVersion,
                fase,
              }),
            },
          );

          calculosPorObraFase.set(clave, respuesta);
        }),
      );

      const ordenesConMateriales = ordenesBase.map((orden) => {
        const clave = `${orden.obra_version.toUpperCase()}|${orden.fase}`;

        const calculo = calculosPorObraFase.get(clave) || {};

        const operacionCalculada = Array.isArray(calculo.operaciones)
          ? calculo.operaciones.find(
              (operacion) =>
                Number(operacion.id_operacion) === Number(orden.id_operacion),
            )
          : null;

        const cantidadOperacionCompleta = convertirNumero(
          operacionCalculada?.cantidad,
        );

        /*
         * Si se planificó sólo una parte de la operación para ese día,
         * los materiales se prorratean en la misma proporción.
         */
        const proporcion =
          cantidadOperacionCompleta > 0
            ? orden.cantidad_pedida / cantidadOperacionCompleta
            : 1;

        const materiales = Array.isArray(calculo.materiales)
          ? calculo.materiales
              .filter((material) => {
                if (material?.excluido) {
                  return false;
                }

                return Array.isArray(material?.operaciones)
                  ? material.operaciones.some(
                      (operacionMaterial) =>
                        Number(operacionMaterial.id_operacion) ===
                        Number(orden.id_operacion),
                    )
                  : false;
              })
              .map((material) => ({
                id_articulo: Number(material.id_articulo) || null,
                codigo: material.codigo || "",
                descripcion: material.descripcion || "",
                tipo: material.tipo || "",
                cantidad: Number(
                  (convertirNumero(material.cantidad) * proporcion).toFixed(4),
                ),
              }))
              .filter(
                (material) =>
                  Number.isFinite(material.cantidad) && material.cantidad > 0,
              )
          : [];

        return {
          ...orden,
          cantidad_pedida: Number(orden.cantidad_pedida.toFixed(4)),
          materiales,
        };
      });

      const resultado = await solicitarJson("/api/ordenes-trabajo/exportar", {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: JSON.stringify({
          fecha_inicio: fechaInicioExportar,
          fecha_fin: fechaFinExportar,
          ordenes: ordenesConMateriales,
        }),
      });

      setModalExportarAbierto(false);

      window.alert(
        `Exportación finalizada.\n\n` +
          `Creadas: ${resultado?.creadas || 0}\n` +
          `Actualizadas: ${resultado?.actualizadas || 0}\n` +
          `Omitidas: ${resultado?.omitidas || 0}`,
      );
    } catch (error) {
      console.error("Error exportando órdenes de trabajo:", error);

      setErrorGeneral(error.message);
      window.alert(error.message);
    } finally {
      setExportandoOrdenes(false);
    }
  };

  const guardarPlanificacion = async () => {
    if (!mesSeleccionado) {
      window.alert("Debe seleccionar un mes.");
      return;
    }

    try {
      setGuardandoPlanificacion(true);
      setErrorGeneral("");

      const respuesta = await solicitarJson(
        `${API_PLANIFICACION}/planificacion`,
        {
          method: "PUT",
          body: JSON.stringify({
            mes: mesSeleccionado,
            obras,
          }),
        },
      );

      window.alert(
        respuesta?.message ||
          `La planificación de ${mesSeleccionado} fue guardada para todos los usuarios.`,
      );
    } catch (error) {
      console.error("Error guardando planificación compartida:", error);
      setErrorGeneral(error.message);
      window.alert(error.message);
    } finally {
      setGuardandoPlanificacion(false);
    }
  };

  const cargarHistorico = async () => {
    if (!mesHistorico) {
      window.alert("Debe seleccionar un mes.");
      return;
    }

    const encontrada = await cargarPlanificacionCompartida(mesHistorico, {
      avisarSiNoExiste: true,
    });

    if (!encontrada) {
      return;
    }

    setMesSeleccionado(mesHistorico);

    const rango = obtenerRangoMes(mesHistorico);
    setFechaInicioExportar(rango.inicio);
    setFechaFinExportar(rango.fin);

    setModalHistoricoAbierto(false);
  };

  return (
    <section className="planificacion-produccion">
      <div className="planificacion-encabezado">
        <h2 className="module-title">Planificación de Producción</h2>

        <label className="selector-mes">
          <span>Mes de planificación</span>

          <input
            type="month"
            value={mesSeleccionado}
            onChange={(event) => cambiarMesPlanificacion(event.target.value)}
            disabled={cargandoPlanificacion || guardandoPlanificacion}
          />
        </label>
      </div>

      {errorGeneral && (
        <div className="mensaje-consulta error">{errorGeneral}</div>
      )}

      {cargandoConfiguracion && (
        <div className="mensaje-consulta">
          Cargando operaciones y configuraciones...
        </div>
      )}

      {cargandoPlanificacion && (
        <div className="mensaje-consulta">
          Cargando planificación compartida...
        </div>
      )}

      <div className="planificacion-acciones">
        <button type="button" onClick={() => setModalTiemposAbierto(true)}>
          Tiempos STD
        </button>

        <button
          type="button"
          onClick={() => {
            setErrorTipos("");
            setModalTiposMaterialAbierto(true);
          }}
        >
          Tipos de material
        </button>

        <button type="button" onClick={() => setModalExcluirAbierto(true)}>
          Materiales a excluir
        </button>

        <button
          type="button"
          onClick={guardarPlanificacion}
          disabled={guardandoPlanificacion}
        >
          {guardandoPlanificacion ? "Guardando..." : "Guardar"}
        </button>

        <button
          type="button"
          onClick={() => {
            setMesHistorico(mesSeleccionado);
            setModalHistoricoAbierto(true);
          }}
        >
          Cargar planificación
        </button>

        <button type="button" onClick={abrirModalExportar}>
          Exportar a Órdenes de Trabajo
        </button>
      </div>

      <div className="planificacion-bloque">
        <div className="planificacion-scroll">
          <table className="tabla-planificacion tabla-sectores">
            <thead>
              <tr>
                <th className="columna-sector columna-fija" rowSpan={2}>
                  Sectores
                </th>

                {diasHabiles.map((fecha, indice) => (
                  <th
                    key={crearClaveFecha(fecha)}
                    className={
                      fecha.getDay() === 1 && indice !== 0
                        ? "inicio-semana"
                        : ""
                    }
                  >
                    {formatearDia(fecha)}
                  </th>
                ))}
              </tr>

              <tr>
                {diasHabiles.map((fecha, indice) => (
                  <th
                    key={crearClaveFecha(fecha)}
                    className={
                      fecha.getDay() === 1 && indice !== 0
                        ? "inicio-semana"
                        : ""
                    }
                  >
                    {formatearFecha(fecha)}
                  </th>
                ))}
              </tr>
            </thead>

            <tbody>
              {sectores.map((sector) => (
                <tr key={sector.id}>
                  <td className="columna-sector columna-fija">
                    {sector.nombre}
                  </td>

                  {diasHabiles.map((fecha, indice) => {
                    const claveFecha = crearClaveFecha(fecha);
                    const clave = `${sector.id}-${claveFecha}`;
                    const total = totalesPorSectorYFecha[clave] || 0;

                    return (
                      <td
                        key={clave}
                        className={`celda-total-sector ${
                          fecha.getDay() === 1 && indice !== 0
                            ? "inicio-semana"
                            : ""
                        }`}
                      >
                        {total > 0 ? total.toFixed(2) : ""}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="planificacion-bloque">
        <div className="planificacion-bloque-encabezado">
          <button type="button" onClick={agregarFila}>
            Agregar fila
          </button>
        </div>

        <div
          className="planificacion-scroll"
          style={estiloScrollTablaObras}
        >
          <table
            className="tabla-planificacion tabla-obras"
            onKeyDown={manejarEnterTablaObras}
          >
            <thead>
              <tr>
                <th className="columna-cargar" rowSpan={2}>
                  Cargar
                </th>

                <th
                  className="columna-obra columna-fija-obra"
                  rowSpan={2}
                  style={estiloCabeceraObra}
                >
                  Obra
                </th>

                <th
                  className="columna-fase"
                  rowSpan={2}
                  style={estiloCabeceraFase}
                >
                  Fase
                </th>

                <th
                  className="columna-sector-obra"
                  rowSpan={2}
                  style={estiloCabeceraSector}
                >
                  Sector
                </th>

                <th className="columna-cantidad" rowSpan={2}>
                  Cantidad
                </th>

                <th className="columna-tiempo" rowSpan={2}>
                  Tiempo STD
                </th>

                <th className="columna-total" rowSpan={2}>
                  Total horas
                </th>

                {diasHabiles.map((fecha, indice) => (
                  <th
                    key={crearClaveFecha(fecha)}
                    className={
                      fecha.getDay() === 1 && indice !== 0
                        ? "inicio-semana"
                        : ""
                    }
                    style={estiloCabeceraFechaDia}
                  >
                    {formatearDia(fecha)}
                  </th>
                ))}

                <th className="columna-acciones" rowSpan={2}>
                  Eliminar
                </th>
              </tr>

              <tr>
                {diasHabiles.map((fecha, indice) => (
                  <th
                    key={crearClaveFecha(fecha)}
                    className={
                      fecha.getDay() === 1 && indice !== 0
                        ? "inicio-semana"
                        : ""
                    }
                    style={estiloCabeceraFecha}
                  >
                    {formatearFecha(fecha)}
                  </th>
                ))}
              </tr>
            </thead>

            <tbody>
              {obras.map((obra) => (
                <tr key={obra.id}>
                  <td className="celda-cargar">
                    <button
                      type="button"
                      className="boton-cargar-operaciones"
                      onClick={() => cargarOperacionesDeFila(obra)}
                      disabled={filaCalculando !== null}
                      title="Cargar operaciones y materiales"
                    >
                      {filaCalculando === obra.id ? "..." : "Cargar"}
                    </button>
                  </td>

                  <td
                    className="columna-fija-obra"
                    style={estiloCeldaObra}
                  >
                    <input
                      type="text"
                      value={obra.obra}
                      placeholder="Obra/Versión"
                      onChange={(event) =>
                        actualizarObra(obra.id, "obra", event.target.value)
                      }
                    />
                  </td>

                  <td style={estiloCeldaFase}>
                    <input
                      type="text"
                      value={obra.fase}
                      placeholder="Fase"
                      onChange={(event) =>
                        actualizarObra(obra.id, "fase", event.target.value)
                      }
                    />
                  </td>

                  <td style={estiloCeldaSector}>
                    <select
                      value={obra.sectorId}
                      onChange={(event) =>
                        actualizarObra(obra.id, "sectorId", event.target.value)
                      }
                    >
                      <option value="">Seleccionar</option>

                      {sectores.map((sector) => (
                        <option key={sector.id} value={sector.id}>
                          {sector.nombre}
                        </option>
                      ))}
                    </select>
                  </td>


                  <td>
                    <input
                      type="number"
                      min="0"
                      step="1"
                      value={obra.cantidad}
                      onChange={(event) =>
                        actualizarObra(obra.id, "cantidad", event.target.value)
                      }
                    />
                  </td>

                  <td>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={obra.tiempoStd}
                      className={
                        obra.tiempoStdEspecifico
                          ? "campo-tiempo-especifico"
                          : ""
                      }
                      title={
                        obra.tiempoStdEspecifico
                          ? `STD específico de esta obra. STD general: ${obra.tiempoStdBase || "0"}`
                          : "STD general de la operación. Podés editarlo para esta obra/fase."
                      }
                      onChange={(event) =>
                        actualizarObra(obra.id, "tiempoStd", event.target.value)
                      }
                      onBlur={() => guardarTiempoStdObra(obra)}
                    />
                    {obra.tiempoStdEspecifico && (
                      <span className="etiqueta-tiempo-especifico">
                        específico
                      </span>
                    )}
                  </td>

                  <td>
                    <input
                      type="number"
                      value={obra.totalHoras}
                      readOnly
                      className="campo-calculado"
                    />
                  </td>


                  {diasHabiles.map((fecha, indice) => {
                    const claveFecha = crearClaveFecha(fecha);
                    const cantidadPlanificada =
                      obra.cantidadesPorDia?.[claveFecha] || "";

                    const horasPlanificadas = calcularHoras(
                      cantidadPlanificada,
                      obra.tiempoStd,
                    );

                    return (
                      <td
                        key={claveFecha}
                        className={
                          fecha.getDay() === 1 && indice !== 0
                            ? "inicio-semana"
                            : ""
                        }
                      >
                        <div className="celda-planificacion-dia">
                          <input
                            type="number"
                            min="0"
                            step="1"
                            value={cantidadPlanificada}
                            onChange={(event) =>
                              actualizarCantidadDia(
                                obra.id,
                                fecha,
                                event.target.value,
                              )
                            }
                          />

                          {horasPlanificadas && (
                            <span>{horasPlanificadas} h</span>
                          )}
                        </div>
                      </td>
                    );
                  })}

                  <td className="celda-acciones">
                    <button
                      type="button"
                      className="boton-eliminar-fila"
                      onClick={() => eliminarFila(obra.id)}
                      disabled={filaCalculando !== null}
                      title="Eliminar fila"
                    >
                      ×
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {modalExportarAbierto && (
        <div
          className="planificacion-modal-overlay"
          onMouseDown={() => {
            if (!exportandoOrdenes) {
              setModalExportarAbierto(false);
            }
          }}
        >
          <div
            className="planificacion-modal planificacion-modal-pequeno"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="planificacion-modal-header">
              <div>
                <h3>Exportar Órdenes de Trabajo</h3>
                <span>
                  Seleccione el rango de fechas que desea enviar a Gestión de
                  Producción.
                </span>
              </div>

              <button
                type="button"
                className="planificacion-modal-cerrar"
                onClick={() => setModalExportarAbierto(false)}
                disabled={exportandoOrdenes}
              >
                ×
              </button>
            </div>

            <div className="planificacion-modal-body">
              <div className="exportar-ot-campos">
                <label>
                  <span>Fecha de inicio</span>

                  <input
                    type="date"
                    value={fechaInicioExportar}
                    onChange={(event) =>
                      setFechaInicioExportar(event.target.value)
                    }
                    disabled={exportandoOrdenes}
                  />
                </label>

                <label>
                  <span>Fecha de fin</span>

                  <input
                    type="date"
                    value={fechaFinExportar}
                    onChange={(event) =>
                      setFechaFinExportar(event.target.value)
                    }
                    disabled={exportandoOrdenes}
                  />
                </label>
              </div>

              <div className="exportar-ot-ayuda">
                Se exportarán únicamente las celdas con cantidad planificada
                mayor a cero. También se calcularán y guardarán los materiales
                asociados a cada operación.
              </div>
            </div>

            <div className="planificacion-modal-footer">
              <button
                type="button"
                className="boton-secundario"
                onClick={() => setModalExportarAbierto(false)}
                disabled={exportandoOrdenes}
              >
                Cancelar
              </button>

              <button
                type="button"
                onClick={exportarOrdenesTrabajo}
                disabled={exportandoOrdenes}
              >
                {exportandoOrdenes ? "Exportando..." : "Exportar"}
              </button>
            </div>
          </div>
        </div>
      )}

      {modalTiemposAbierto && (
        <div
          className="planificacion-modal-overlay"
          onMouseDown={() => setModalTiemposAbierto(false)}
        >
          <div
            className="planificacion-modal"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="planificacion-modal-header">
              <div>
                <h3>Tiempos estándar</h3>
                <span>Tiempo expresado en minutos</span>
              </div>

              <button
                type="button"
                className="planificacion-modal-cerrar"
                onClick={() => setModalTiemposAbierto(false)}
              >
                ×
              </button>
            </div>

            <div className="planificacion-modal-body">
              <div className="nuevo-sector">
                <input
                  type="text"
                  value={nuevoSector}
                  placeholder="Nueva operación"
                  onChange={(event) => setNuevoSector(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      agregarSector();
                    }
                  }}
                />

                <button type="button" onClick={agregarSector}>
                  Agregar
                </button>
              </div>

              <div className="tabla-tiempos-wrapper">
                <table className="tabla-tiempos-std">
                  <thead>
                    <tr>
                      <th>Operación</th>
                      <th>Tiempo STD</th>
                      <th>Acción</th>
                    </tr>
                  </thead>

                  <tbody>
                    {sectores.map((sector) => (
                      <tr key={sector.id}>
                        <td>{sector.nombre}</td>

                        <td>
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            value={sector.tiempoStd}
                            onChange={(event) =>
                              actualizarTiempoSectorLocal(
                                sector.id,
                                event.target.value,
                              )
                            }
                            onBlur={() => guardarTiempoSector(sector)}
                          />
                        </td>

                        <td>
                          <button
                            type="button"
                            className="boton-eliminar-tiempo"
                            onClick={() => eliminarSector(sector.id)}
                          >
                            Eliminar
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="planificacion-modal-footer">
              <button
                type="button"
                onClick={() => setModalTiemposAbierto(false)}
              >
                Aceptar
              </button>
            </div>
          </div>
        </div>
      )}

      {modalTiposMaterialAbierto && (
        <div
          className="planificacion-modal-overlay"
          onMouseDown={() => setModalTiposMaterialAbierto(false)}
        >
          <div
            className="planificacion-modal"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="planificacion-modal-header">
              <div>
                <h3>Tipos de material</h3>
                <span>Relación entre operación y tipo de artículo</span>
              </div>

              <button
                type="button"
                className="planificacion-modal-cerrar"
                onClick={() => setModalTiposMaterialAbierto(false)}
              >
                ×
              </button>
            </div>

            <div className="planificacion-modal-body">
              <div className="configuracion-modal-acciones">
                <button type="button" onClick={agregarFilaTipoMaterial}>
                  Agregar fila
                </button>
              </div>

              {errorTipos && (
                <div className="mensaje-consulta error">{errorTipos}</div>
              )}

              <div className="tabla-configuracion-wrapper">
                <table className="tabla-configuracion">
                  <thead>
                    <tr>
                      <th>Operación</th>
                      <th>Tipo de material</th>
                      <th>Acción</th>
                    </tr>
                  </thead>

                  <tbody>
                    {tiposMaterialPorOperacion.length === 0 && (
                      <tr>
                        <td colSpan={3} className="tabla-vacia">
                          No hay relaciones cargadas.
                        </td>
                      </tr>
                    )}

                    {tiposMaterialPorOperacion.map((fila) => (
                      <tr key={fila.id}>
                        <td>
                          <select
                            value={fila.sectorId}
                            onChange={(event) =>
                              actualizarFilaTipoMaterial(
                                fila.id,
                                "sectorId",
                                event.target.value,
                              )
                            }
                          >
                            <option value="">Seleccionar</option>

                            {sectores.map((sector) => (
                              <option key={sector.id} value={sector.id}>
                                {sector.nombre}
                              </option>
                            ))}
                          </select>
                        </td>

                        <td>
                          <select
                            value={fila.tipo}
                            onChange={(event) =>
                              actualizarFilaTipoMaterial(
                                fila.id,
                                "tipo",
                                event.target.value,
                              )
                            }
                          >
                            <option value="">Seleccionar</option>

                            {tiposArticulos.map((tipo) => (
                              <option key={tipo} value={tipo}>
                                {tipo}
                              </option>
                            ))}
                          </select>
                        </td>

                        <td>
                          <button
                            type="button"
                            className="boton-eliminar-configuracion"
                            onClick={() => eliminarFilaTipoMaterial(fila.id)}
                          >
                            Eliminar
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="planificacion-modal-footer">
              <button
                type="button"
                className="boton-secundario"
                onClick={() => setModalTiposMaterialAbierto(false)}
                disabled={guardandoConfiguracion}
              >
                Cancelar
              </button>

              <button
                type="button"
                onClick={guardarTiposMaterial}
                disabled={guardandoConfiguracion}
              >
                {guardandoConfiguracion ? "Guardando..." : "Guardar"}
              </button>
            </div>
          </div>
        </div>
      )}

      {modalExcluirAbierto && (
        <div
          className="planificacion-modal-overlay"
          onMouseDown={() => setModalExcluirAbierto(false)}
        >
          <div
            className="planificacion-modal planificacion-modal-grande"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="planificacion-modal-header">
              <div>
                <h3>Materiales a excluir</h3>
                <span>
                  Artículos que no deberán considerarse en una operación
                </span>
              </div>

              <button
                type="button"
                className="planificacion-modal-cerrar"
                onClick={() => setModalExcluirAbierto(false)}
              >
                ×
              </button>
            </div>

            <div className="planificacion-modal-body">
              <div className="configuracion-modal-acciones">
                <button type="button" onClick={agregarFilaMaterialExcluir}>
                  Agregar fila
                </button>
              </div>

              <div className="tabla-configuracion-wrapper">
                <table className="tabla-configuracion tabla-materiales-excluir">
                  <thead>
                    <tr>
                      <th>Operación</th>
                      <th>Código</th>
                      <th>Descripción</th>
                      <th>Estado</th>
                      <th>Acción</th>
                    </tr>
                  </thead>

                  <tbody>
                    {materialesExcluir.length === 0 && (
                      <tr>
                        <td colSpan={5} className="tabla-vacia">
                          No hay materiales excluidos.
                        </td>
                      </tr>
                    )}

                    {materialesExcluir.map((fila) => (
                      <tr key={fila.id}>
                        <td>
                          <select
                            value={fila.sectorId}
                            onChange={(event) =>
                              actualizarFilaMaterialExcluir(
                                fila.id,
                                "sectorId",
                                event.target.value,
                              )
                            }
                          >
                            <option value="">Seleccionar</option>

                            {sectores.map((sector) => (
                              <option key={sector.id} value={sector.id}>
                                {sector.nombre}
                              </option>
                            ))}
                          </select>
                        </td>

                        <td>
                          <input
                            type="text"
                            value={fila.codigo}
                            placeholder="Código"
                            onChange={(event) =>
                              actualizarFilaMaterialExcluir(
                                fila.id,
                                "codigo",
                                event.target.value,
                              )
                            }
                            onBlur={() => buscarMaterialExcluir(fila.id)}
                            onKeyDown={(event) => {
                              if (event.key === "Enter") {
                                event.preventDefault();
                                buscarMaterialExcluir(fila.id);
                              }
                            }}
                          />
                        </td>

                        <td>
                          <input
                            type="text"
                            value={fila.descripcion}
                            readOnly
                            placeholder="Descripción"
                            className="campo-configuracion-calculado"
                          />
                        </td>

                        <td>
                          <span
                            className={`estado-material estado-${fila.estado}`}
                            title={fila.mensaje}
                          >
                            {fila.estado === "buscando" && "Buscando..."}
                            {fila.estado === "valido" && "Válido"}
                            {fila.estado === "inexistente" && "No existe"}
                            {fila.estado === "error" && "Error"}
                            {(fila.estado === "vacio" ||
                              fila.estado === "pendiente") &&
                              "Pendiente"}
                          </span>
                        </td>

                        <td>
                          <button
                            type="button"
                            className="boton-eliminar-configuracion"
                            onClick={() => eliminarFilaMaterialExcluir(fila.id)}
                          >
                            Eliminar
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="planificacion-modal-footer">
              <button
                type="button"
                className="boton-secundario"
                onClick={() => setModalExcluirAbierto(false)}
                disabled={guardandoConfiguracion}
              >
                Cancelar
              </button>

              <button
                type="button"
                onClick={guardarMaterialesExcluir}
                disabled={guardandoConfiguracion}
              >
                {guardandoConfiguracion ? "Guardando..." : "Guardar"}
              </button>
            </div>
          </div>
        </div>
      )}

      {modalHistoricoAbierto && (
        <div
          className="planificacion-modal-overlay"
          onMouseDown={() => setModalHistoricoAbierto(false)}
        >
          <div
            className="planificacion-modal planificacion-modal-pequeno"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="planificacion-modal-header">
              <div>
                <h3>Cargar planificación</h3>
                <span>Seleccione el mes compartido a cargar</span>
              </div>

              <button
                type="button"
                className="planificacion-modal-cerrar"
                onClick={() => setModalHistoricoAbierto(false)}
              >
                ×
              </button>
            </div>

            <div className="planificacion-modal-body">
              <label className="campo-historico">
                <span>Mes y año</span>

                <input
                  type="month"
                  value={mesHistorico}
                  onChange={(event) => setMesHistorico(event.target.value)}
                />
              </label>
            </div>

            <div className="planificacion-modal-footer">
              <button
                type="button"
                className="boton-secundario"
                onClick={() => setModalHistoricoAbierto(false)}
              >
                Cancelar
              </button>

              <button type="button" onClick={cargarHistorico}>
                Cargar
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

export default PlanificacionProduccion;
