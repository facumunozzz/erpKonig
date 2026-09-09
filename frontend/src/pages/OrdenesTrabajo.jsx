import React, { useEffect, useMemo, useState } from "react";
import { useAuth } from "../context/AuthContext";
import "../styles/ordenesTrabajo.css";

const API_ORDENES = "/api/ordenes-trabajo";
const CLAVE_FECHA_DESDE = "ordenesTrabajo_fechaDesde";
const CLAVE_FECHA_HASTA = "ordenesTrabajo_fechaHasta";

function fechaIsoLocal(fecha = new Date()) {
  const anio = fecha.getFullYear();
  const mes = String(fecha.getMonth() + 1).padStart(2, "0");
  const dia = String(fecha.getDate()).padStart(2, "0");

  return `${anio}-${mes}-${dia}`;
}

function inicioMesActual() {
  const hoy = new Date();
  return fechaIsoLocal(new Date(hoy.getFullYear(), hoy.getMonth(), 1));
}

function finMesActual() {
  const hoy = new Date();
  return fechaIsoLocal(new Date(hoy.getFullYear(), hoy.getMonth() + 1, 0));
}

function formatearFecha(valor) {
  if (!valor) {
    return "";
  }

  const texto = String(valor).slice(0, 10);
  const [anio, mes, dia] = texto.split("-");

  return `${dia}/${mes}/${anio}`;
}

function formatearHora(valor) {
  if (!valor) {
    return "";
  }

  return String(valor).slice(0, 8);
}

function formatearNumero(valor) {
  const numero = Number(valor);

  if (!Number.isFinite(numero)) {
    return "0";
  }

  return Number.isInteger(numero)
    ? String(numero)
    : numero.toLocaleString("es-AR", {
        maximumFractionDigits: 4,
      });
}

function fechaSqlAJs(valor) {
  if (!valor) {
    return null;
  }

  const fecha = new Date(String(valor).replace(" ", "T"));
  return Number.isNaN(fecha.getTime()) ? null : fecha;
}

function segundosEntre(inicio, fin) {
  const inicioFecha = fechaSqlAJs(inicio);
  const finFecha = fin instanceof Date ? fin : fechaSqlAJs(fin);

  if (!inicioFecha || !finFecha) {
    return 0;
  }

  return Math.max(
    0,
    Math.floor((finFecha.getTime() - inicioFecha.getTime()) / 1000),
  );
}

function formatearDuracion(segundosRaw) {
  const segundos = Math.max(0, Math.floor(Number(segundosRaw) || 0));
  const horas = Math.floor(segundos / 3600);
  const minutos = Math.floor((segundos % 3600) / 60);
  const resto = segundos % 60;

  return `${String(horas).padStart(2, "0")}:${String(minutos).padStart(2, "0")}:${String(resto).padStart(2, "0")}`;
}

function esIndirecto(orden) {
  return String(orden?.tipo_ot || "PRODUCTIVA").toUpperCase() === "INDIRECTO";
}

function esCortePerfil(orden) {
  return (
    String(orden?.operacion || "")
      .trim()
      .toUpperCase() === "CORTE PERFIL"
  );
}

function tiempoIndirectoTotal(orden, ahora) {
  let total = Number(orden?.tiempo_indirecto_segundos) || 0;

  if (orden?.inicio_indirecto_activo) {
    total += segundosEntre(orden.inicio_indirecto_activo, ahora);
  }

  return Math.max(0, total);
}

function tiempoTranscurrido(orden, ahora) {
  if (!orden?.inicio_real) {
    return 0;
  }

  return segundosEntre(orden.inicio_real, orden.fin_real || ahora);
}

function tiempoEfectivo(orden, ahora) {
  if (esIndirecto(orden)) {
    return tiempoTranscurrido(orden, ahora);
  }

  return Math.max(
    0,
    tiempoTranscurrido(orden, ahora) - tiempoIndirectoTotal(orden, ahora),
  );
}

async function solicitarJson(url, opciones = {}, token = "") {
  const headers = {
    "Content-Type": "application/json",
    ...(opciones.headers || {}),
  };

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const respuesta = await fetch(url, {
    ...opciones,
    headers,
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
        contenido?.detalle ||
        contenido?.message ||
        `Error HTTP ${respuesta.status}`,
    );
  }

  return contenido;
}

function claseEstado(orden) {
  const estado = String(orden?.estado || "").toUpperCase();

  if (esIndirecto(orden)) {
    return "ot-indirecto";
  }

  if (estado === "FINALIZADA") {
    return "ot-finalizada";
  }

  if (estado === "PAUSADA") {
    return "ot-pausada";
  }

  if (estado === "EN_PROCESO") {
    return "ot-en-proceso";
  }

  return "ot-pendiente";
}

export default function OrdenesTrabajo() {
  const { token, isAdmin } = useAuth();

  const solicitarApi = (url, opciones = {}) =>
    solicitarJson(url, opciones, token);

  const [ordenes, setOrdenes] = useState([]);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState("");

  const [desde, setDesde] = useState(
    () => localStorage.getItem(CLAVE_FECHA_DESDE) || inicioMesActual(),
  );
  const [hasta, setHasta] = useState(
    () => localStorage.getItem(CLAVE_FECHA_HASTA) || finMesActual(),
  );
  const [estado, setEstado] = useState("");

  const [modalAbierto, setModalAbierto] = useState(false);
  const [ordenEditando, setOrdenEditando] = useState(null);
  const [guardando, setGuardando] = useState(false);
  const [ocultandoFinalizadas, setOcultandoFinalizadas] = useState(false);

  const [modalInicioAbierto, setModalInicioAbierto] = useState(false);
  const [ordenIniciando, setOrdenIniciando] = useState(null);
  const [operadorInicio, setOperadorInicio] = useState("");

  const [modalCrearIndirectoAbierto, setModalCrearIndirectoAbierto] =
    useState(false);
  const [operadorIndirecto, setOperadorIndirecto] = useState("");
  const [actividadIndirecto, setActividadIndirecto] = useState("");

  const [modalFinalizarIndirectoAbierto, setModalFinalizarIndirectoAbierto] =
    useState(false);
  const [indirectoFinalizando, setIndirectoFinalizando] = useState(null);
  const [motivoIndirecto, setMotivoIndirecto] = useState("");

  const [modalFinalizarAbierto, setModalFinalizarAbierto] = useState(false);
  const [ordenFinalizando, setOrdenFinalizando] = useState(null);
  const [cantidadFinalizar, setCantidadFinalizar] = useState("");

  const [operadores, setOperadores] = useState([]);
  const [ahora, setAhora] = useState(new Date());
  const [confirmandoMaterialId, setConfirmandoMaterialId] = useState(null);

  const [modalRecorteAbierto, setModalRecorteAbierto] = useState(false);
  const [materialRecorte, setMaterialRecorte] = useState(null);
  const [recortesDisponibles, setRecortesDisponibles] = useState([]);
  const [ubicacionesRecortes, setUbicacionesRecortes] = useState([]);
  const [creandoRecorte, setCreandoRecorte] = useState(false);
  const [guardandoRecorte, setGuardandoRecorte] = useState(false);
  const [recorteForm, setRecorteForm] = useState({
    id_recorte: "",
    id_ubicacion_recorte: "",
    cantidad: "",
    medida: "",
    descripcion: "",
    obra_version: "",
    cantidad_disponible: "",
  });

  const [modalAgregarMaterialAbierto, setModalAgregarMaterialAbierto] =
    useState(false);
  const [buscandoArticuloMaterial, setBuscandoArticuloMaterial] =
    useState(false);
  const [guardandoMaterialNuevo, setGuardandoMaterialNuevo] = useState(false);
  const [articuloMaterialEncontrado, setArticuloMaterialEncontrado] =
    useState(null);
  const [materialNuevoForm, setMaterialNuevoForm] = useState({
    codigo: "",
    descripcion: "",
    tipo: "MATERIAL",
    cantidad: "",
  });

  useEffect(() => {
    if (desde) {
      localStorage.setItem(CLAVE_FECHA_DESDE, desde);
    }
  }, [desde]);

  useEffect(() => {
    if (hasta) {
      localStorage.setItem(CLAVE_FECHA_HASTA, hasta);
    }
  }, [hasta]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setAhora(new Date());
    }, 1000);

    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!modalRecorteAbierto) {
      return undefined;
    }

    const overflowAnterior = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const cerrarConEscape = (event) => {
      if (event.key === "Escape" && !guardandoRecorte) {
        setModalRecorteAbierto(false);
        setMaterialRecorte(null);
        setRecortesDisponibles([]);
        setUbicacionesRecortes([]);
        setCreandoRecorte(false);
      }
    };

    window.addEventListener("keydown", cerrarConEscape);

    return () => {
      document.body.style.overflow = overflowAnterior;
      window.removeEventListener("keydown", cerrarConEscape);
    };
  }, [modalRecorteAbierto, guardandoRecorte]);

  useEffect(() => {
    if (!modalAgregarMaterialAbierto) {
      return undefined;
    }

    const overflowAnterior = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const cerrarConEscape = (event) => {
      if (event.key === "Escape" && !guardandoMaterialNuevo) {
        setModalAgregarMaterialAbierto(false);
        setArticuloMaterialEncontrado(null);
      }
    };

    window.addEventListener("keydown", cerrarConEscape);

    return () => {
      document.body.style.overflow = overflowAnterior;
      window.removeEventListener("keydown", cerrarConEscape);
    };
  }, [modalAgregarMaterialAbierto, guardandoMaterialNuevo]);

  const cargarOperadores = async () => {
    try {
      const respuesta = await solicitarApi(`${API_ORDENES}/operadores`);

      const lista = Array.isArray(respuesta)
        ? respuesta
            .map((item) =>
              typeof item === "string"
                ? {
                    id_referente: null,
                    operador: item,
                  }
                : {
                    id_referente: item?.id_referente ?? null,
                    operador: String(item?.operador || "").trim(),
                  },
            )
            .filter((item) => item.operador)
        : [];

      setOperadores(lista);
    } catch (errorOperadores) {
      console.warn("No se pudieron cargar operadores:", errorOperadores);
    }
  };

  const cargarOrdenes = async () => {
    try {
      setCargando(true);
      setError("");

      const params = new URLSearchParams();

      if (desde) {
        params.set("desde", desde);
      }

      if (hasta) {
        params.set("hasta", hasta);
      }

      if (estado) {
        params.set("estado", estado);
      }

      const respuesta = await solicitarApi(
        `${API_ORDENES}?${params.toString()}`,
      );

      setOrdenes(Array.isArray(respuesta) ? respuesta : []);
    } catch (errorCarga) {
      console.error("Error cargando órdenes de trabajo:", errorCarga);
      setError(errorCarga.message);
      setOrdenes([]);
    } finally {
      setCargando(false);
    }
  };

  useEffect(() => {
    if (!token) {
      return;
    }

    cargarOrdenes();
    cargarOperadores();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const resumen = useMemo(() => {
    return ordenes.reduce(
      (acumulado, orden) => {
        const estadoOrden = String(orden.estado || "PENDIENTE").toUpperCase();

        acumulado.total += 1;

        if (estadoOrden === "FINALIZADA") {
          acumulado.finalizadas += 1;
        } else if (estadoOrden === "PAUSADA") {
          acumulado.pausadas += 1;
        } else if (estadoOrden === "EN_PROCESO") {
          acumulado.enProceso += 1;
        } else {
          acumulado.pendientes += 1;
        }

        return acumulado;
      },
      {
        total: 0,
        pendientes: 0,
        enProceso: 0,
        pausadas: 0,
        finalizadas: 0,
      },
    );
  }, [ordenes]);

  const abrirEdicion = async (id) => {
    try {
      setError("");

      const respuesta = await solicitarApi(`${API_ORDENES}/${id}`);

      setOrdenEditando({
        ...respuesta,
        operador: respuesta.operador || "",
        cantidad_fabricada: respuesta.cantidad_fabricada ?? 0,
        hora_inicio: respuesta.hora_inicio
          ? String(respuesta.hora_inicio).slice(0, 8)
          : "",
        hora_fin: respuesta.hora_fin
          ? String(respuesta.hora_fin).slice(0, 8)
          : "",
        observacion: respuesta.observacion || "",
        materiales: Array.isArray(respuesta.materiales)
          ? respuesta.materiales.map((material) => ({
              ...material,
              consumido: material.consumido ?? 0,
              consumido_stock: material.consumido_stock ?? 0,
              consumido_recorte: material.consumido_recorte ?? 0,
            }))
          : [],
      });

      setModalAbierto(true);
    } catch (errorDetalle) {
      window.alert(errorDetalle.message);
    }
  };

  const cerrarModal = () => {
    if (guardando) {
      return;
    }

    setModalAbierto(false);
    setOrdenEditando(null);
  };

  const actualizarCampo = (campo, valor) => {
    setOrdenEditando((actual) =>
      actual
        ? {
            ...actual,
            [campo]: valor,
          }
        : actual,
    );
  };

  const actualizarMaterialConsumido = (idMaterial, valor) => {
    setOrdenEditando((actual) => {
      if (!actual) {
        return actual;
      }

      return {
        ...actual,
        materiales: (actual.materiales || []).map((material) =>
          Number(material.id_ot_material) === Number(idMaterial)
            ? {
                ...material,
                consumido: valor,
              }
            : material,
        ),
      };
    });
  };

  const abrirAgregarMaterial = () => {
    if (!ordenEditando || esIndirecto(ordenEditando)) {
      return;
    }

    setArticuloMaterialEncontrado(null);
    setMaterialNuevoForm({
      codigo: "",
      descripcion: "",
      tipo: "MATERIAL",
      cantidad: "",
    });
    setModalAgregarMaterialAbierto(true);
  };

  const cerrarAgregarMaterial = () => {
    if (guardandoMaterialNuevo) {
      return;
    }

    setModalAgregarMaterialAbierto(false);
    setArticuloMaterialEncontrado(null);
  };

  const cambiarCodigoMaterialNuevo = (valor) => {
    setArticuloMaterialEncontrado(null);
    setMaterialNuevoForm((actual) => ({
      ...actual,
      codigo: valor.toUpperCase(),
      descripcion: "",
    }));
  };

  const buscarArticuloMaterial = async () => {
    const codigo = String(materialNuevoForm.codigo || "").trim();

    if (!codigo) {
      window.alert("Ingresá el código del artículo.");
      return;
    }

    try {
      setBuscandoArticuloMaterial(true);
      setArticuloMaterialEncontrado(null);

      const articulo = await solicitarApi(
        `${API_ORDENES}/materiales/buscar-articulo/${encodeURIComponent(codigo)}`,
      );

      setArticuloMaterialEncontrado(articulo);
      setMaterialNuevoForm((actual) => ({
        ...actual,
        codigo: String(articulo.codigo || codigo).trim(),
        descripcion: String(articulo.descripcion || "").trim(),
      }));
    } catch (errorBusqueda) {
      setMaterialNuevoForm((actual) => ({
        ...actual,
        descripcion: "",
      }));
      window.alert(errorBusqueda.message);
    } finally {
      setBuscandoArticuloMaterial(false);
    }
  };

  const agregarMaterialNuevo = async () => {
    if (!ordenEditando) {
      return;
    }

    const codigo = String(materialNuevoForm.codigo || "").trim();
    const cantidadRaw = Number(materialNuevoForm.cantidad);
    const cantidad = Number(cantidadRaw.toFixed(4));

    if (!articuloMaterialEncontrado) {
      window.alert("Primero buscá y validá el artículo.");
      return;
    }

    if (
      codigo.toUpperCase() !==
      String(articuloMaterialEncontrado.codigo || "")
        .trim()
        .toUpperCase()
    ) {
      window.alert("El código cambió. Volvé a buscar el artículo.");
      return;
    }

    if (!Number.isFinite(cantidadRaw) || cantidadRaw <= 0) {
      window.alert("Ingresá una cantidad planificada mayor que cero.");
      return;
    }

    if (Math.abs(cantidadRaw - cantidad) > 0.000001) {
      window.alert("La cantidad admite como máximo 4 decimales.");
      return;
    }

    try {
      setGuardandoMaterialNuevo(true);

      const respuesta = await solicitarApi(
        `${API_ORDENES}/${ordenEditando.id_ot}/materiales`,
        {
          method: "POST",
          body: JSON.stringify({
            codigo,
            tipo: String(materialNuevoForm.tipo || "").trim() || "MATERIAL",
            cantidad,
          }),
        },
      );

      const detalleActualizado = respuesta?.orden;

      if (detalleActualizado) {
        setOrdenEditando({
          ...detalleActualizado,
          operador: detalleActualizado.operador || "",
          cantidad_fabricada: detalleActualizado.cantidad_fabricada ?? 0,
          hora_inicio: detalleActualizado.hora_inicio
            ? String(detalleActualizado.hora_inicio).slice(0, 8)
            : "",
          hora_fin: detalleActualizado.hora_fin
            ? String(detalleActualizado.hora_fin).slice(0, 8)
            : "",
          observacion: detalleActualizado.observacion || "",
          materiales: Array.isArray(detalleActualizado.materiales)
            ? detalleActualizado.materiales.map((material) => ({
                ...material,
                consumido: material.consumido ?? 0,
                consumido_stock: material.consumido_stock ?? 0,
                consumido_recorte: material.consumido_recorte ?? 0,
              }))
            : [],
        });
      }

      setModalAgregarMaterialAbierto(false);
      setArticuloMaterialEncontrado(null);
      await cargarOrdenes();
      window.alert("Material agregado correctamente.");
    } catch (errorAgregar) {
      window.alert(errorAgregar.message);
    } finally {
      setGuardandoMaterialNuevo(false);
    }
  };

  const confirmarConsumoMaterial = async (material) => {
    if (!ordenEditando || !material) {
      return;
    }

    const consumido = Number(material.consumido);
    const consumidoStock = Number(material.consumido_stock) || 0;
    const consumidoRecorte = Number(material.consumido_recorte) || 0;
    const confirmadoTotal = consumidoStock + consumidoRecorte;

    if (!Number.isFinite(consumido) || consumido < 0) {
      window.alert("Ingresá una cantidad consumida válida.");
      return;
    }

    if (consumido + 0.000001 < confirmadoTotal) {
      window.alert(
        `Ya se confirmaron ${formatearNumero(confirmadoTotal)} unidades: ` +
          `${formatearNumero(consumidoStock)} de stock normal y ` +
          `${formatearNumero(consumidoRecorte)} de recortes. ` +
          "No podés bajar ese valor desde la OT.",
      );
      return;
    }

    const diferenciaSinRedondear = consumido - confirmadoTotal;
    const diferencia = Number(diferenciaSinRedondear.toFixed(2));

    if (diferencia <= 0) {
      window.alert("Este consumo ya está confirmado contra stock.");
      return;
    }

    if (Math.abs(diferenciaSinRedondear - diferencia) > 0.000001) {
      window.alert(
        "La parte que se descontará del stock normal admite como máximo 2 decimales.",
      );
      return;
    }

    const continuar = window.confirm(
      `Se egresarán ${formatearNumero(diferencia)} unidades del artículo ${material.codigo || ""} ` +
        `del depósito Producción.\n\n` +
        `Consumido total: ${formatearNumero(consumido)}\n` +
        `Ya egresado de stock: ${formatearNumero(consumidoStock)}\n\n` +
        `Ya consumido de recortes: ${formatearNumero(consumidoRecorte)}\n\n` +
        "¿Confirmar consumo?",
    );

    if (!continuar) {
      return;
    }

    try {
      setConfirmandoMaterialId(Number(material.id_ot_material));

      const respuesta = await solicitarApi(
        `${API_ORDENES}/${ordenEditando.id_ot}/materiales/${material.id_ot_material}/confirmar-consumo`,
        {
          method: "POST",
          body: JSON.stringify({
            consumido,
          }),
        },
      );

      const detalleActualizado = respuesta?.orden;

      if (detalleActualizado) {
        setOrdenEditando({
          ...detalleActualizado,
          operador: detalleActualizado.operador || "",
          cantidad_fabricada: detalleActualizado.cantidad_fabricada ?? 0,
          hora_inicio: detalleActualizado.hora_inicio
            ? String(detalleActualizado.hora_inicio).slice(0, 8)
            : "",
          hora_fin: detalleActualizado.hora_fin
            ? String(detalleActualizado.hora_fin).slice(0, 8)
            : "",
          observacion: detalleActualizado.observacion || "",
          materiales: Array.isArray(detalleActualizado.materiales)
            ? detalleActualizado.materiales.map((item) => ({
                ...item,
                consumido: item.consumido ?? 0,
                consumido_stock: item.consumido_stock ?? 0,
                consumido_recorte: item.consumido_recorte ?? 0,
              }))
            : [],
        });
      }

      await cargarOrdenes();

      window.alert(
        respuesta?.ajuste_numero
          ? `Consumo confirmado. Se generó el ajuste Nº ${respuesta.ajuste_numero}.`
          : "El consumo ya estaba confirmado.",
      );
    } catch (errorConsumo) {
      window.alert(errorConsumo.message);
    } finally {
      setConfirmandoMaterialId(null);
    }
  };

  const cerrarModalRecorte = (forzar = false) => {
    if (guardandoRecorte && !forzar) {
      return;
    }

    setModalRecorteAbierto(false);
    setMaterialRecorte(null);
    setRecortesDisponibles([]);
    setUbicacionesRecortes([]);
    setCreandoRecorte(false);
  };

  const abrirConsumoRecorte = async (material) => {
    if (!ordenEditando || !material || !esCortePerfil(ordenEditando)) {
      return;
    }

    try {
      const respuesta = await solicitarApi(
        `${API_ORDENES}/${ordenEditando.id_ot}/materiales/${material.id_ot_material}/recortes`,
      );

      const recortes = Array.isArray(respuesta?.recortes)
        ? respuesta.recortes
        : [];
      const ubicaciones = Array.isArray(respuesta?.ubicaciones)
        ? respuesta.ubicaciones
        : [];
      const general =
        ubicaciones.find(
          (item) =>
            String(item.nombre || "")
              .trim()
              .toUpperCase() === "GENERAL",
        ) || ubicaciones[0];

      setMaterialRecorte(material);
      setRecortesDisponibles(recortes);
      setUbicacionesRecortes(ubicaciones);
      setCreandoRecorte(recortes.length === 0);
      setRecorteForm({
        id_recorte: "",
        id_ubicacion_recorte: general
          ? String(general.id_ubicacion_recorte)
          : "",
        cantidad: "",
        medida: "",
        descripcion: `${material.descripcion || material.codigo || ""} - RECORTE`,
        obra_version: ordenEditando.obra_version || "",
        cantidad_disponible: "",
      });
      setModalRecorteAbierto(true);
    } catch (errorRecortes) {
      window.alert(errorRecortes.message);
    }
  };

  const seleccionarRecorte = (idRecorteRaw) => {
    const idRecorte = Number(idRecorteRaw);
    const recorte = recortesDisponibles.find(
      (item) => Number(item.id_recorte) === idRecorte,
    );
    const ubicacionConStock = recorte?.ubicaciones?.find(
      (item) => Number(item.cantidad) > 0,
    );

    setRecorteForm((actual) => ({
      ...actual,
      id_recorte: idRecorteRaw,
      id_ubicacion_recorte: ubicacionConStock
        ? String(ubicacionConStock.id_ubicacion_recorte)
        : "",
      cantidad: "",
    }));
  };

  const confirmarConsumoRecorte = async () => {
    if (!ordenEditando || !materialRecorte) {
      return;
    }

    const cantidad = Number(recorteForm.cantidad);

    if (!Number.isFinite(cantidad) || cantidad <= 0) {
      window.alert("Ingresá una cantidad de recorte mayor que cero.");
      return;
    }

    const payload = creandoRecorte
      ? {
          cantidad,
          nuevo_recorte: {
            medida: recorteForm.medida,
            descripcion: recorteForm.descripcion,
            obra_version: recorteForm.obra_version,
            id_ubicacion_recorte: Number(recorteForm.id_ubicacion_recorte),
            cantidad_disponible: Number(recorteForm.cantidad_disponible),
          },
        }
      : {
          cantidad,
          id_recorte: Number(recorteForm.id_recorte),
          id_ubicacion_recorte: Number(recorteForm.id_ubicacion_recorte),
        };

    if (
      !Number.isInteger(Number(recorteForm.id_ubicacion_recorte)) ||
      Number(recorteForm.id_ubicacion_recorte) <= 0
    ) {
      window.alert("Seleccioná una ubicación de recortes.");
      return;
    }

    if (creandoRecorte) {
      const disponible = Number(recorteForm.cantidad_disponible);

      if (!String(recorteForm.medida || "").trim()) {
        window.alert("Ingresá la medida del nuevo recorte.");
        return;
      }

      if (!Number.isFinite(disponible) || disponible <= 0) {
        window.alert("Ingresá la cantidad disponible del nuevo recorte.");
        return;
      }

      if (cantidad > disponible) {
        window.alert("No podés consumir más que la cantidad disponible.");
        return;
      }
    } else if (!Number.isInteger(Number(recorteForm.id_recorte))) {
      window.alert("Seleccioná un recorte.");
      return;
    }

    const continuar = window.confirm(
      `Se consumirán ${formatearNumero(cantidad)} unidades desde Stock Recortes.\n\n` +
        "El stock normal del artículo no será modificado. ¿Continuar?",
    );

    if (!continuar) {
      return;
    }

    try {
      setGuardandoRecorte(true);

      const respuesta = await solicitarApi(
        `${API_ORDENES}/${ordenEditando.id_ot}/materiales/${materialRecorte.id_ot_material}/consumir-recorte`,
        {
          method: "POST",
          body: JSON.stringify(payload),
        },
      );

      if (respuesta?.orden) {
        setOrdenEditando((actual) => ({
          ...actual,
          ...respuesta.orden,
          operador: respuesta.orden.operador || "",
          cantidad_fabricada: respuesta.orden.cantidad_fabricada ?? 0,
          hora_inicio: respuesta.orden.hora_inicio
            ? String(respuesta.orden.hora_inicio).slice(0, 8)
            : "",
          hora_fin: respuesta.orden.hora_fin
            ? String(respuesta.orden.hora_fin).slice(0, 8)
            : "",
          observacion: respuesta.orden.observacion || "",
          materiales: Array.isArray(respuesta.orden.materiales)
            ? respuesta.orden.materiales.map((item) => ({
                ...item,
                consumido: item.consumido ?? 0,
                consumido_stock: item.consumido_stock ?? 0,
                consumido_recorte: item.consumido_recorte ?? 0,
              }))
            : [],
        }));
      }

      cerrarModalRecorte(true);
      await cargarOrdenes();

      window.alert(
        respuesta?.recorte_creado
          ? "El recorte fue creado y consumido correctamente."
          : "El recorte fue consumido correctamente.",
      );
    } catch (errorRecorte) {
      window.alert(errorRecorte.message);
    } finally {
      setGuardandoRecorte(false);
    }
  };

  const guardarOrden = async () => {
    if (!ordenEditando) {
      return;
    }

    try {
      setGuardando(true);

      await solicitarApi(`${API_ORDENES}/${ordenEditando.id_ot}`, {
        method: "PUT",
        body: JSON.stringify({
          operador: String(ordenEditando.operador || "").trim() || null,
          hora_inicio: ordenEditando.hora_inicio || null,
          hora_fin: ordenEditando.hora_fin || null,
          observacion: String(ordenEditando.observacion || "").trim() || null,
        }),
      });

      setModalAbierto(false);
      setOrdenEditando(null);

      await Promise.all([cargarOrdenes(), cargarOperadores()]);
    } catch (errorGuardado) {
      window.alert(errorGuardado.message);
    } finally {
      setGuardando(false);
    }
  };

  const abrirCrearIndirecto = () => {
    setOperadorIndirecto("");
    setActividadIndirecto("");
    setModalCrearIndirectoAbierto(true);
  };

  const cerrarCrearIndirecto = () => {
    if (guardando) {
      return;
    }

    setModalCrearIndirectoAbierto(false);
    setOperadorIndirecto("");
    setActividadIndirecto("");
  };

  const crearIndirectoIndependiente = async () => {
    const operador = String(operadorIndirecto || "").trim();
    const motivo = String(actividadIndirecto || "").trim();

    if (!operador) {
      window.alert("Debe seleccionar un operador / actuante.");
      return;
    }

    if (!motivo) {
      window.alert("Debe indicar la actividad indirecta.");
      return;
    }

    try {
      setGuardando(true);

      await solicitarApi(`${API_ORDENES}/indirectos`, {
        method: "POST",
        body: JSON.stringify({
          operador,
          motivo,
        }),
      });

      setModalCrearIndirectoAbierto(false);
      setOperadorIndirecto("");
      setActividadIndirecto("");

      await Promise.all([cargarOrdenes(), cargarOperadores()]);
    } catch (errorCrearIndirecto) {
      window.alert(errorCrearIndirecto.message);
    } finally {
      setGuardando(false);
    }
  };

  const abrirInicio = (orden, event) => {
    event?.stopPropagation();

    setOrdenIniciando(orden);
    setOperadorInicio("");
    setModalInicioAbierto(true);
  };

  const cerrarInicio = () => {
    if (guardando) {
      return;
    }

    setModalInicioAbierto(false);
    setOrdenIniciando(null);
    setOperadorInicio("");
  };

  const iniciarTarea = async () => {
    if (!ordenIniciando) {
      return;
    }

    const operador = String(operadorInicio || "").trim();

    if (!operador) {
      window.alert("Debe seleccionar un operador.");
      return;
    }

    try {
      setGuardando(true);

      await solicitarApi(`${API_ORDENES}/${ordenIniciando.id_ot}/iniciar`, {
        method: "POST",
        body: JSON.stringify({
          operador,
        }),
      });

      setModalInicioAbierto(false);
      setOrdenIniciando(null);
      setOperadorInicio("");

      await Promise.all([cargarOrdenes(), cargarOperadores()]);
    } catch (errorInicio) {
      window.alert(errorInicio.message);
    } finally {
      setGuardando(false);
    }
  };

  const pausarTarea = async (orden, event) => {
    event?.stopPropagation();

    try {
      setGuardando(true);

      await solicitarApi(`${API_ORDENES}/${orden.id_ot}/pausar`, {
        method: "POST",
        body: JSON.stringify({}),
      });

      await cargarOrdenes();
    } catch (errorPausa) {
      window.alert(errorPausa.message);
    } finally {
      setGuardando(false);
    }
  };

  const reanudarTarea = async (orden, event) => {
    event?.stopPropagation();

    try {
      await solicitarApi(`${API_ORDENES}/${orden.id_ot}/reanudar`, {
        method: "POST",
        body: JSON.stringify({}),
      });

      await cargarOrdenes();
    } catch (errorReanudar) {
      window.alert(errorReanudar.message);
    }
  };

  const abrirFinalizarIndirecto = (orden, event) => {
    event?.stopPropagation();

    setIndirectoFinalizando(orden);
    setMotivoIndirecto(
      String(orden.motivo_indirecto || orden.operacion || "").trim(),
    );
    setModalFinalizarIndirectoAbierto(true);
  };

  const confirmarFinalizarIndirecto = async () => {
    if (!indirectoFinalizando) {
      return;
    }

    const motivo = String(motivoIndirecto || "").trim();

    if (!motivo) {
      window.alert("Indicá qué actividad indirecta se realizó.");
      return;
    }

    try {
      setGuardando(true);

      await solicitarApi(
        `${API_ORDENES}/${indirectoFinalizando.id_ot}/finalizar`,
        {
          method: "POST",
          body: JSON.stringify({
            motivo,
          }),
        },
      );

      setModalFinalizarIndirectoAbierto(false);
      setIndirectoFinalizando(null);
      setMotivoIndirecto("");

      await cargarOrdenes();
    } catch (errorFin) {
      window.alert(errorFin.message);
    } finally {
      setGuardando(false);
    }
  };

  const abrirFinalizacion = (orden, event) => {
    event?.stopPropagation();

    if (esIndirecto(orden)) {
      abrirFinalizarIndirecto(orden, event);
      return;
    }

    setOrdenFinalizando(orden);
    setCantidadFinalizar("");
    setModalFinalizarAbierto(true);
  };

  const confirmarFinalizacion = async () => {
    if (!ordenFinalizando) {
      return;
    }

    const cantidad = Number(cantidadFinalizar);
    const pedida = Number(ordenFinalizando.cantidad_pedida) || 0;

    if (!Number.isFinite(cantidad) || cantidad < 0) {
      window.alert("Ingresá una cantidad fabricada válida.");
      return;
    }

    if (cantidad > pedida) {
      window.alert(
        `La cantidad no puede superar la pedida (${formatearNumero(pedida)}).`,
      );
      return;
    }

    try {
      setGuardando(true);

      const idOrdenFinalizada = ordenFinalizando.id_ot;

      const respuesta = await solicitarApi(
        `${API_ORDENES}/${idOrdenFinalizada}/finalizar`,
        {
          method: "POST",
          body: JSON.stringify({
            cantidad_fabricada: cantidad,
          }),
        },
      );

      setModalFinalizarAbierto(false);
      setOrdenFinalizando(null);
      setCantidadFinalizar("");

      if (respuesta?.nueva_ot) {
        window.alert(
          `OT finalizada con ${formatearNumero(cantidad)} unidades.\n\n` +
            `Se generó una nueva OT por ${formatearNumero(
              respuesta.cantidad_faltante,
            )} unidades faltantes.\n\n` +
            "Ahora podés registrar los materiales consumidos o cerrar sin consumir ninguno.",
        );
      } else {
        window.alert(
          "OT finalizada. Ahora podés registrar los materiales consumidos " +
            "o cerrar sin consumir ninguno.",
        );
      }

      await cargarOrdenes();
      await abrirEdicion(idOrdenFinalizada);
    } catch (errorFin) {
      window.alert(errorFin.message);
    } finally {
      setGuardando(false);
    }
  };

  const ocultarFinalizadasCompletas = async () => {
    const confirmado = window.confirm(
      "¿Ocultar todas las OTs cuya cadena productiva ya esté completamente finalizada?\n\n" +
        "No se ocultarán OTs pendientes, en proceso, pausadas ni cadenas con un faltante todavía abierto.",
    );

    if (!confirmado) {
      return;
    }

    try {
      setOcultandoFinalizadas(true);

      const resultado = await solicitarApi(
        `${API_ORDENES}/ocultar-finalizadas-completas`,
        {
          method: "POST",
          body: JSON.stringify({}),
        },
      );

      window.alert(
        `${resultado?.mensaje || "Proceso terminado."}\n\n` +
          `Cadenas completas: ${resultado?.cadenas_ocultadas || 0}\n` +
          `OT productivas ocultadas: ${resultado?.productivas_ocultadas || 0}\n` +
          `Indirectos vinculados ocultados: ${resultado?.indirectos_vinculados_ocultados || 0}`,
      );

      await cargarOrdenes();
    } catch (errorOcultar) {
      window.alert(errorOcultar.message);
    } finally {
      setOcultandoFinalizadas(false);
    }
  };

  const ocultarOrden = async (orden, event) => {
    event?.stopPropagation();

    const confirmado = window.confirm(
      `¿Ocultar la card ${orden.otid}?\n\n` +
        "La orden y toda su información permanecerán guardadas en la base de datos.",
    );

    if (!confirmado) {
      return;
    }

    try {
      await solicitarApi(`${API_ORDENES}/${orden.id_ot}`, {
        method: "DELETE",
      });

      await cargarOrdenes();
    } catch (errorOcultar) {
      window.alert(errorOcultar.message);
    }
  };

  const manejarTeclaCard = (event, orden) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      abrirEdicion(orden.id_ot);
    }
  };

  const recorteSeleccionado = recortesDisponibles.find(
    (item) => Number(item.id_recorte) === Number(recorteForm.id_recorte),
  );
  const ubicacionesDelRecorte = Array.isArray(recorteSeleccionado?.ubicaciones)
    ? recorteSeleccionado.ubicaciones
    : [];

  return (
    <section className="ordenes-trabajo-page">
      <style>{`
        .ot-recorte-overlay {
          position: fixed !important;
          inset: 0 !important;
          z-index: 2147483000 !important;
          display: flex !important;
          align-items: center !important;
          justify-content: center !important;
          padding: 88px 20px 20px !important;
          overflow: auto !important;
          background: rgba(15, 23, 42, 0.68) !important;
          backdrop-filter: blur(2px);
        }

        .ot-recorte-modal {
          position: relative !important;
          inset: auto !important;
          width: min(900px, 100%) !important;
          max-width: 900px !important;
          max-height: calc(100vh - 108px) !important;
          margin: auto !important;
          padding: 0 !important;
          display: flex !important;
          flex-direction: column !important;
          overflow: hidden !important;
          border: 1px solid #d5dee9 !important;
          border-radius: 14px !important;
          background: #ffffff !important;
          box-shadow: 0 24px 70px rgba(15, 23, 42, 0.36) !important;
        }

        .ot-recorte-header {
          flex: 0 0 auto !important;
          min-height: 64px;
          padding: 12px 16px !important;
          display: grid !important;
          grid-template-columns: minmax(125px, 1fr) auto minmax(125px, 1fr) !important;
          align-items: center !important;
          gap: 12px !important;
          border-bottom: 1px solid #dce5ef !important;
          background: #f8fafc !important;
        }

        .ot-recorte-header strong {
          color: #17324d;
          font-size: 18px;
          text-align: center;
        }

        .ot-recorte-header button:first-child {
          justify-self: start;
        }

        .ot-recorte-header button:last-child {
          justify-self: end;
        }

        .ot-recorte-body {
          flex: 1 1 auto !important;
          min-height: 0 !important;
          padding: 18px 20px 24px !important;
          overflow-y: auto !important;
          overscroll-behavior: contain;
          background: #ffffff;
        }

        .ot-recorte-body .ot-aviso-modal,
        .ot-recorte-body .ot-aviso-faltante {
          margin-bottom: 14px;
        }

        .ot-recorte-body .ot-campos-dos-columnas {
          display: grid !important;
          grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
          gap: 14px !important;
        }

        .ot-recorte-body .ot-campo {
          margin-bottom: 14px !important;
        }

        .ot-recorte-body .ot-campo span {
          display: block;
          margin-bottom: 6px;
          color: #334155;
          font-size: 12px;
          font-weight: 700;
          text-transform: uppercase;
        }

        .ot-recorte-body input,
        .ot-recorte-body select {
          width: 100% !important;
          min-height: 42px !important;
          padding: 9px 11px !important;
          border: 1px solid #bccbdb !important;
          border-radius: 7px !important;
          background: #ffffff !important;
          color: #1f2937 !important;
          font-size: 15px !important;
        }

        .ot-recorte-body input:focus,
        .ot-recorte-body select:focus {
          outline: 3px solid rgba(14, 116, 183, 0.18) !important;
          border-color: #0e74b7 !important;
        }

        .ot-recorte-body input[readonly] {
          background: #f1f5f9 !important;
          color: #64748b !important;
        }

        .ot-encabezado-acciones {
          display: flex;
          align-items: center;
          gap: 10px;
          flex-wrap: wrap;
        }

        .ot-boton-limpiar-finalizadas {
          border: 0;
          border-radius: 9px;
          padding: 11px 16px;
          background: #475569;
          color: #ffffff;
          font-weight: 800;
          cursor: pointer;
          box-shadow: 0 5px 14px rgba(71, 85, 105, 0.18);
        }

        .ot-boton-limpiar-finalizadas:hover {
          filter: brightness(0.96);
        }

        .ot-boton-limpiar-finalizadas:disabled {
          opacity: 0.55;
          cursor: not-allowed;
        }

        .ot-boton-crear-indirecto {
          border: 0;
          border-radius: 9px;
          padding: 11px 16px;
          background: #7c3aed;
          color: #ffffff;
          font-weight: 800;
          cursor: pointer;
          box-shadow: 0 5px 14px rgba(124, 58, 237, 0.22);
        }

        .ot-boton-crear-indirecto:hover {
          filter: brightness(0.96);
        }

        .ot-boton-crear-indirecto:disabled {
          opacity: 0.55;
          cursor: not-allowed;
        }

        @media (max-width: 700px) {
          .ot-recorte-overlay {
            align-items: flex-start !important;
            padding: 76px 10px 10px !important;
          }

          .ot-recorte-modal {
            max-height: calc(100vh - 86px) !important;
            border-radius: 10px !important;
          }

          .ot-recorte-header {
            grid-template-columns: 1fr 1fr !important;
          }

          .ot-recorte-header strong {
            grid-column: 1 / -1;
            grid-row: 1;
          }

          .ot-recorte-header button:first-child,
          .ot-recorte-header button:last-child {
            grid-row: 2;
            width: 100%;
          }

          .ot-recorte-body {
            padding: 15px 13px 20px !important;
          }

          .ot-recorte-body .ot-campos-dos-columnas {
            grid-template-columns: 1fr !important;
            gap: 0 !important;
          }
        }
      `}</style>

      <div className="ot-encabezado">
        <div>
          <h2 className="module-title">Órdenes de Trabajo</h2>

          <p>
            Tareas productivas e indirectas, vinculadas o independientes.
          </p>
        </div>

        <div className="ot-encabezado-acciones">
          <button
            type="button"
            className="ot-boton-crear-indirecto"
            onClick={abrirCrearIndirecto}
            disabled={guardando || !token}
          >
            + CREAR INDIRECTO
          </button>
        </div>

        <div className="ot-resumen">
          <span>
            <strong>{resumen.total}</strong>
            Total
          </span>

          <span>
            <strong>{resumen.pendientes}</strong>
            Pendientes
          </span>

          <span>
            <strong>{resumen.enProceso}</strong>
            En proceso
          </span>

          <span>
            <strong>{resumen.pausadas}</strong>
            Pausadas
          </span>

          <span>
            <strong>{resumen.finalizadas}</strong>
            Finalizadas
          </span>
        </div>
      </div>

      <div className="ot-filtros">
        <label>
          <span>Desde</span>
          <input
            type="date"
            value={desde}
            onChange={(event) => setDesde(event.target.value)}
          />
        </label>

        <label>
          <span>Hasta</span>
          <input
            type="date"
            value={hasta}
            onChange={(event) => setHasta(event.target.value)}
          />
        </label>

        <label>
          <span>Estado</span>
          <select
            value={estado}
            onChange={(event) => setEstado(event.target.value)}
          >
            <option value="">Todos</option>
            <option value="PENDIENTE">Pendiente</option>
            <option value="EN_PROCESO">En proceso</option>
            <option value="PAUSADA">Pausada</option>
            <option value="FINALIZADA">Finalizada</option>
          </select>
        </label>

        <button type="button" onClick={cargarOrdenes} disabled={cargando}>
          {cargando ? "Buscando..." : "Buscar"}
        </button>
      </div>

      {error && <div className="ot-mensaje ot-error">{error}</div>}

      {!cargando && ordenes.length === 0 && (
        <div className="ot-vacio">
          No hay órdenes de trabajo para el rango seleccionado.
        </div>
      )}

      <div className="ot-grid">
        {ordenes.map((orden) => {
          const estadoOrden = String(orden.estado || "").toUpperCase();
          const indirecta = esIndirecto(orden);
          const indirectoSegundos = tiempoIndirectoTotal(orden, ahora);
          const efectivoSegundos = tiempoEfectivo(orden, ahora);
          const transcurridoSegundos = tiempoTranscurrido(orden, ahora);

          return (
            <article
              key={orden.id_ot}
              className={`ot-card ${claseEstado(orden)}`}
              role="button"
              tabIndex={0}
              onClick={() => abrirEdicion(orden.id_ot)}
              onKeyDown={(event) => manejarTeclaCard(event, orden)}
              title="Tocar para abrir y editar"
            >
              <div className="ot-card-superior">
                <div>
                  <strong>
                    Inicio: {formatearHora(orden.hora_inicio) || "-"}
                  </strong>

                  {orden.hora_fin && (
                    <strong> | Fin: {formatearHora(orden.hora_fin)}</strong>
                  )}

                  {!indirecta && Number(orden.cantidad_fabricada) > 0 && (
                    <strong>
                      {" "}
                      | Fabricado: {formatearNumero(orden.cantidad_fabricada)}
                    </strong>
                  )}
                </div>

                {indirecta ? (
                  <span className="ot-etiqueta-indirecto">INDIRECTO</span>
                ) : (
                  <span>
                    CANTIDAD PEDIDA: {formatearNumero(orden.cantidad_pedida)}
                  </span>
                )}
              </div>

              <div className="ot-card-centro">
                <div className="ot-obra">
                  {indirecta ? "INDIRECTO" : orden.obra_version}
                </div>

                <div className="ot-operacion">
                  {indirecta
                    ? orden.motivo_indirecto || orden.operacion
                    : orden.operacion}
                </div>
              </div>

              <div className="ot-card-datos">
                <span>
                  Operador: <strong>{orden.operador || "-"}</strong>
                </span>

                <span>
                  Fecha:{" "}
                  <strong>{formatearFecha(orden.fecha_planificada)}</strong>
                </span>

                {!indirecta && (
                  <span>
                    Fase: <strong>{orden.fase ?? "-"}</strong>
                  </span>
                )}

                {!indirecta && orden.id_ot_origen && orden.ot_origen_otid && (
                  <span>
                    Continuación de: <strong>{orden.ot_origen_otid}</strong>
                  </span>
                )}

                {indirecta && orden.ot_origen_otid && (
                  <span>
                    OT origen: <strong>{orden.ot_origen_otid}</strong>
                  </span>
                )}

                {indirecta && !orden.id_ot_origen && orden.usuario_creacion && (
                  <span>
                    Creado por: <strong>{orden.usuario_creacion}</strong>
                  </span>
                )}

                {!indirecta && (
                  <span>
                    Materiales:{" "}
                    <strong>{orden.cantidad_materiales || 0}</strong>
                  </span>
                )}
              </div>

              <div className="ot-tiempos">
                {indirecta ? (
                  <span>
                    Tiempo indirecto:{" "}
                    <strong>{formatearDuracion(transcurridoSegundos)}</strong>
                  </span>
                ) : (
                  <>
                    <span>
                      Tiempo indirecto:{" "}
                      <strong>{formatearDuracion(indirectoSegundos)}</strong>
                    </span>
                    <span>
                      Tiempo efectivo:{" "}
                      <strong>{formatearDuracion(efectivoSegundos)}</strong>
                    </span>
                  </>
                )}
              </div>

              <div className="ot-card-acciones">
                <div className="ot-acciones-tarea">
                  {!indirecta && estadoOrden === "PENDIENTE" && (
                    <button
                      type="button"
                      onClick={(event) => abrirInicio(orden, event)}
                    >
                      INICIA TAREA
                    </button>
                  )}

                  {!indirecta && estadoOrden === "EN_PROCESO" && (
                    <>
                      <button
                        type="button"
                        onClick={(event) => pausarTarea(orden, event)}
                      >
                        PAUSAR
                      </button>

                      <button
                        type="button"
                        onClick={(event) => abrirFinalizacion(orden, event)}
                      >
                        FINALIZA TAREA
                      </button>
                    </>
                  )}

                  {!indirecta && estadoOrden === "PAUSADA" && (
                    <button
                      type="button"
                      onClick={(event) => reanudarTarea(orden, event)}
                    >
                      REANUDAR
                    </button>
                  )}

                  {indirecta && estadoOrden === "EN_PROCESO" && (
                    <button
                      type="button"
                      onClick={(event) => abrirFinalizarIndirecto(orden, event)}
                    >
                      FINALIZA INDIRECTO
                    </button>
                  )}
                </div>

                <div className="ot-acciones-iconos">
                  <button
                    type="button"
                    onClick={(event) => ocultarOrden(orden, event)}
                    title="Ocultar card"
                    aria-label="Ocultar card"
                  >
                    ❌
                  </button>
                </div>
              </div>
            </article>
          );
        })}
      </div>

      {modalAbierto && ordenEditando && !modalRecorteAbierto && (
        <div className="ot-modal-overlay" onMouseDown={cerrarModal}>
          <div
            className="ot-modal"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="ot-modal-barra">
              <button type="button" onClick={cerrarModal} disabled={guardando}>
                Cancelar
              </button>

              <strong>
                {esIndirecto(ordenEditando) ? "Indirecto" : "Orden de Trabajo"}
              </strong>

              <button
                type="button"
                className="ot-boton-guardar"
                onClick={guardarOrden}
                disabled={guardando}
              >
                {guardando ? "Guardando..." : "Guardar"}
              </button>
            </div>

            <div className="ot-modal-contenido">
              <label className="ot-campo">
                <span>Operador</span>

                <input
                  type="text"
                  list="ot-operadores"
                  value={ordenEditando.operador}
                  onChange={(event) =>
                    actualizarCampo("operador", event.target.value)
                  }
                />

                <datalist id="ot-operadores">
                  {operadores.map((item) => (
                    <option
                      key={item.id_referente ?? item.operador}
                      value={item.operador}
                    />
                  ))}
                </datalist>
              </label>

              {!esIndirecto(ordenEditando) && (
                <label className="ot-campo">
                  <span>Fabricado</span>
                  <input
                    type="number"
                    value={ordenEditando.cantidad_fabricada}
                    readOnly
                  />
                </label>
              )}

              <div className="ot-campos-dos-columnas">
                <label className="ot-campo">
                  <span>Hora inicio</span>
                  <input
                    type="time"
                    step="1"
                    value={ordenEditando.hora_inicio}
                    onChange={(event) =>
                      actualizarCampo("hora_inicio", event.target.value)
                    }
                  />
                </label>

                <label className="ot-campo">
                  <span>Hora fin</span>
                  <input
                    type="time"
                    step="1"
                    value={ordenEditando.hora_fin}
                    onChange={(event) =>
                      actualizarCampo("hora_fin", event.target.value)
                    }
                  />
                </label>
              </div>

              <label className="ot-campo">
                <span>OTID</span>
                <input type="text" value={ordenEditando.otid} readOnly />
              </label>

              {esIndirecto(ordenEditando) && (
                <label className="ot-campo">
                  <span>OT origen</span>
                  <input
                    type="text"
                    value={ordenEditando.ot_origen_otid || ""}
                    readOnly
                  />
                </label>
              )}

              <label className="ot-campo">
                <span>Observación</span>
                <textarea
                  rows={3}
                  value={ordenEditando.observacion}
                  onChange={(event) =>
                    actualizarCampo("observacion", event.target.value)
                  }
                />
              </label>

              {!esIndirecto(ordenEditando) && (
                <div className="ot-materiales">
                  <div className="ot-materiales-titulo">
                    <div>
                      <strong>Materiales</strong>
                      <small>
                        Vinculados a OT raíz:{" "}
                        {ordenEditando.ot_raiz_otid || ordenEditando.otid}
                      </small>
                    </div>
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 10,
                        flexWrap: "wrap",
                      }}
                    >
                      <span>{ordenEditando.materiales?.length || 0} ítems</span>
                      <button
                        type="button"
                        className="ot-boton-guardar"
                        onClick={abrirAgregarMaterial}
                      >
                        + Agregar material
                      </button>
                    </div>
                  </div>

                  {Array.isArray(ordenEditando.materiales) &&
                  ordenEditando.materiales.length > 0 ? (
                    <div className="ot-materiales-scroll">
                      <table>
                        <thead>
                          <tr>
                            <th>Código</th>
                            <th>Descripción</th>
                            <th>Tipo</th>
                            <th>Planificado</th>
                            <th>Consumido</th>
                            <th>Consumido de stock</th>
                            <th>Consumido de recortes</th>
                            <th>Restante</th>
                            <th>Acción</th>
                          </tr>
                        </thead>

                        <tbody>
                          {ordenEditando.materiales.map((material) => {
                            const planificado = Number(material.cantidad) || 0;
                            const consumido = Number(material.consumido) || 0;
                            const consumidoStock =
                              Number(material.consumido_stock) || 0;
                            const consumidoRecorte =
                              Number(material.consumido_recorte) || 0;
                            const confirmadoTotal =
                              consumidoStock + consumidoRecorte;
                            const restante = planificado - consumido;
                            const pendienteStock = Number(
                              Math.max(0, consumido - confirmadoTotal).toFixed(
                                2,
                              ),
                            );
                            const confirmando =
                              Number(confirmandoMaterialId) ===
                              Number(material.id_ot_material);

                            return (
                              <tr key={material.id_ot_material}>
                                <td>{material.codigo || ""}</td>
                                <td>{material.descripcion || ""}</td>
                                <td>{material.tipo || ""}</td>
                                <td>{formatearNumero(planificado)}</td>
                                <td>
                                  <input
                                    type="number"
                                    min={confirmadoTotal}
                                    step="0.001"
                                    value={material.consumido}
                                    onChange={(event) =>
                                      actualizarMaterialConsumido(
                                        material.id_ot_material,
                                        event.target.value,
                                      )
                                    }
                                  />
                                </td>
                                <td className="ot-material-stock-confirmado">
                                  {formatearNumero(consumidoStock)}
                                </td>
                                <td className="ot-material-stock-confirmado">
                                  {formatearNumero(consumidoRecorte)}
                                </td>
                                <td
                                  className={
                                    restante < 0
                                      ? "ot-material-restante negativo"
                                      : "ot-material-restante"
                                  }
                                >
                                  {formatearNumero(restante)}
                                </td>
                                <td>
                                  <div
                                    style={{
                                      display: "flex",
                                      flexDirection: "column",
                                      gap: 6,
                                    }}
                                  >
                                    <button
                                      type="button"
                                      className={
                                        pendienteStock > 0
                                          ? "ot-confirmar-consumo pendiente"
                                          : "ot-confirmar-consumo"
                                      }
                                      disabled={
                                        confirmando || pendienteStock <= 0
                                      }
                                      onClick={() =>
                                        confirmarConsumoMaterial(material)
                                      }
                                    >
                                      {confirmando
                                        ? "Confirmando..."
                                        : pendienteStock > 0
                                          ? `Confirmar ${formatearNumero(pendienteStock)}`
                                          : "Stock confirmado"}
                                    </button>

                                    {esCortePerfil(ordenEditando) && (
                                      <button
                                        type="button"
                                        className="ot-confirmar-consumo pendiente"
                                        onClick={() =>
                                          abrirConsumoRecorte(material)
                                        }
                                      >
                                        Usar recorte
                                      </button>
                                    )}
                                  </div>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <div className="ot-sin-materiales">
                      Esta orden no tiene materiales asociados.
                    </div>
                  )}

                  <div className="ot-materiales-nota">
                    El botón <strong>Agregar material</strong> incorpora un
                    artículo existente a la planificación de la OT, pero no
                    modifica stock ni registra consumo. Al tocar{" "}
                    <strong>Confirmar</strong>, el sistema egresa solamente la
                    diferencia todavía no confirmada desde el depósito
                    <strong> Producción</strong> y genera un ajuste interno con
                    motivo
                    <strong> CONSUMO PRODUCCIÓN</strong>. Las OT por faltante
                    comparten estos mismos materiales y consumos con la OT raíz.
                    {esCortePerfil(ordenEditando) && (
                      <>
                        {" "}
                        En <strong>CORTE PERFIL</strong>, el botón
                        <strong> Usar recorte</strong> descuenta únicamente de
                        Stock Recortes y no modifica el stock normal.
                      </>
                    )}
                  </div>
                </div>
              )}

              <div className="ot-nota-tiempo">
                Los tiempos efectivo e indirecto se calculan con las acciones
                Iniciar, Pausar, Reanudar y Finalizar.
              </div>
            </div>
          </div>
        </div>
      )}

      {modalAgregarMaterialAbierto && ordenEditando && (
        <div
          className="ot-modal-overlay ot-recorte-overlay"
          onMouseDown={cerrarAgregarMaterial}
          role="presentation"
        >
          <div
            className="ot-modal ot-recorte-modal"
            onMouseDown={(event) => event.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="ot-agregar-material-titulo"
          >
            <div className="ot-modal-barra ot-recorte-header">
              <button
                type="button"
                onClick={cerrarAgregarMaterial}
                disabled={guardandoMaterialNuevo}
              >
                Cancelar
              </button>

              <strong id="ot-agregar-material-titulo">Agregar material</strong>

              <button
                type="button"
                className="ot-boton-guardar"
                onClick={agregarMaterialNuevo}
                disabled={
                  guardandoMaterialNuevo ||
                  buscandoArticuloMaterial ||
                  !articuloMaterialEncontrado
                }
              >
                {guardandoMaterialNuevo ? "Agregando..." : "Agregar"}
              </button>
            </div>

            <div className="ot-modal-contenido ot-recorte-body">
              <div className="ot-aviso-modal">
                El material se agregará a la OT raíz{" "}
                <strong>
                  {ordenEditando.ot_raiz_otid || ordenEditando.otid}
                </strong>
                . Sus consumos comenzarán en cero y no se modificará el stock.
              </div>

              <div className="ot-campos-dos-columnas">
                <label className="ot-campo">
                  <span>Código del artículo</span>
                  <input
                    type="text"
                    autoFocus
                    value={materialNuevoForm.codigo}
                    onChange={(event) =>
                      cambiarCodigoMaterialNuevo(event.target.value)
                    }
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        buscarArticuloMaterial();
                      }
                    }}
                    disabled={
                      buscandoArticuloMaterial || guardandoMaterialNuevo
                    }
                    placeholder="Ingresar código exacto"
                  />
                </label>

                <div
                  style={{
                    display: "flex",
                    alignItems: "end",
                    paddingBottom: 14,
                  }}
                >
                  <button
                    type="button"
                    className="ot-boton-guardar"
                    onClick={buscarArticuloMaterial}
                    disabled={
                      buscandoArticuloMaterial ||
                      guardandoMaterialNuevo ||
                      !String(materialNuevoForm.codigo || "").trim()
                    }
                    style={{ width: "100%", minHeight: 42 }}
                  >
                    {buscandoArticuloMaterial
                      ? "Buscando..."
                      : "Buscar artículo"}
                  </button>
                </div>
              </div>

              <label className="ot-campo">
                <span>Descripción</span>
                <input
                  type="text"
                  value={materialNuevoForm.descripcion}
                  readOnly
                  placeholder="Se completa al encontrar el artículo"
                />
              </label>

              {articuloMaterialEncontrado && (
                <div className="ot-aviso-modal">
                  Artículo encontrado:{" "}
                  <strong>{articuloMaterialEncontrado.codigo}</strong> —{" "}
                  {articuloMaterialEncontrado.descripcion}
                </div>
              )}

              <div className="ot-campos-dos-columnas">
                <label className="ot-campo">
                  <span>Tipo</span>
                  <input
                    type="text"
                    value={materialNuevoForm.tipo}
                    onChange={(event) =>
                      setMaterialNuevoForm((actual) => ({
                        ...actual,
                        tipo: event.target.value,
                      }))
                    }
                    disabled={guardandoMaterialNuevo}
                    placeholder="MATERIAL"
                  />
                </label>

                <label className="ot-campo">
                  <span>Cantidad planificada</span>
                  <input
                    type="number"
                    min="0.0001"
                    step="0.0001"
                    value={materialNuevoForm.cantidad}
                    onChange={(event) =>
                      setMaterialNuevoForm((actual) => ({
                        ...actual,
                        cantidad: event.target.value,
                      }))
                    }
                    disabled={guardandoMaterialNuevo}
                  />
                </label>
              </div>
            </div>
          </div>
        </div>
      )}

      {modalRecorteAbierto && materialRecorte && (
        <div
          className="ot-modal-overlay ot-recorte-overlay"
          onMouseDown={() => cerrarModalRecorte()}
          role="presentation"
        >
          <div
            className="ot-modal ot-recorte-modal"
            onMouseDown={(event) => event.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="ot-recorte-titulo"
          >
            <div className="ot-modal-barra ot-recorte-header">
              <button
                type="button"
                onClick={() => cerrarModalRecorte()}
                disabled={guardandoRecorte}
              >
                Omitir / cerrar
              </button>

              <strong id="ot-recorte-titulo">Consumir recorte</strong>

              <button
                type="button"
                className="ot-boton-guardar"
                onClick={confirmarConsumoRecorte}
                disabled={guardandoRecorte}
              >
                {guardandoRecorte ? "Consumiendo..." : "Confirmar"}
              </button>
            </div>

            <div className="ot-modal-contenido ot-recorte-body">
              <div className="ot-aviso-modal">
                Material: <strong>{materialRecorte.codigo}</strong> —{" "}
                {materialRecorte.descripcion}. Este movimiento modifica solo
                Stock Recortes.
              </div>

              {recortesDisponibles.length > 0 && (
                <div
                  style={{
                    display: "flex",
                    gap: 8,
                    marginBottom: 12,
                    flexWrap: "wrap",
                  }}
                >
                  <button
                    type="button"
                    className={!creandoRecorte ? "ot-boton-guardar" : ""}
                    onClick={() => setCreandoRecorte(false)}
                    disabled={guardandoRecorte}
                  >
                    Usar existente
                  </button>

                  <button
                    type="button"
                    className={creandoRecorte ? "ot-boton-guardar" : ""}
                    onClick={() => setCreandoRecorte(true)}
                    disabled={guardandoRecorte}
                  >
                    Crear nuevo
                  </button>
                </div>
              )}

              {!creandoRecorte ? (
                <>
                  <label className="ot-campo">
                    <span>Recorte disponible</span>
                    <select
                      value={recorteForm.id_recorte}
                      onChange={(event) =>
                        seleccionarRecorte(event.target.value)
                      }
                      disabled={guardandoRecorte}
                    >
                      <option value="">Seleccionar recorte</option>
                      {recortesDisponibles.map((recorte) => (
                        <option
                          key={recorte.id_recorte}
                          value={recorte.id_recorte}
                        >
                          {recorte.codigo} —{" "}
                          {formatearNumero(recorte.cantidad_total)} disponibles
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="ot-campo">
                    <span>Ubicación</span>
                    <select
                      value={recorteForm.id_ubicacion_recorte}
                      onChange={(event) =>
                        setRecorteForm((actual) => ({
                          ...actual,
                          id_ubicacion_recorte: event.target.value,
                        }))
                      }
                      disabled={guardandoRecorte || !recorteSeleccionado}
                    >
                      <option value="">Seleccionar ubicación</option>
                      {ubicacionesDelRecorte.map((ubicacion) => (
                        <option
                          key={ubicacion.id_stock_recorte}
                          value={ubicacion.id_ubicacion_recorte}
                          disabled={Number(ubicacion.cantidad) <= 0}
                        >
                          {ubicacion.ubicacion} —{" "}
                          {formatearNumero(ubicacion.cantidad)} disponibles
                        </option>
                      ))}
                    </select>
                  </label>
                </>
              ) : (
                <>
                  {recortesDisponibles.length === 0 && (
                    <div className="ot-aviso-faltante">
                      No existe ningún recorte relacionado con este código.
                      Podés registrarlo ahora y consumirlo en el mismo paso.
                    </div>
                  )}

                  <div className="ot-campos-dos-columnas">
                    <label className="ot-campo">
                      <span>Código base</span>
                      <input
                        type="text"
                        value={materialRecorte.codigo || ""}
                        readOnly
                      />
                    </label>

                    <label className="ot-campo">
                      <span>Medida</span>
                      <input
                        type="text"
                        value={recorteForm.medida}
                        onChange={(event) =>
                          setRecorteForm((actual) => ({
                            ...actual,
                            medida: event.target.value,
                          }))
                        }
                        placeholder="Ej.: 850"
                        disabled={guardandoRecorte}
                      />
                    </label>
                  </div>

                  <label className="ot-campo">
                    <span>Descripción</span>
                    <input
                      type="text"
                      value={recorteForm.descripcion}
                      onChange={(event) =>
                        setRecorteForm((actual) => ({
                          ...actual,
                          descripcion: event.target.value,
                        }))
                      }
                      disabled={guardandoRecorte}
                    />
                  </label>

                  <div className="ot-campos-dos-columnas">
                    <label className="ot-campo">
                      <span>Obra / versión</span>
                      <input
                        type="text"
                        value={recorteForm.obra_version}
                        onChange={(event) =>
                          setRecorteForm((actual) => ({
                            ...actual,
                            obra_version: event.target.value,
                          }))
                        }
                        disabled={guardandoRecorte}
                      />
                    </label>

                    <label className="ot-campo">
                      <span>Ubicación</span>
                      <select
                        value={recorteForm.id_ubicacion_recorte}
                        onChange={(event) =>
                          setRecorteForm((actual) => ({
                            ...actual,
                            id_ubicacion_recorte: event.target.value,
                          }))
                        }
                        disabled={guardandoRecorte}
                      >
                        <option value="">Seleccionar ubicación</option>
                        {ubicacionesRecortes.map((ubicacion) => (
                          <option
                            key={ubicacion.id_ubicacion_recorte}
                            value={ubicacion.id_ubicacion_recorte}
                          >
                            {ubicacion.nombre}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>

                  <label className="ot-campo">
                    <span>Cantidad disponible antes de consumir</span>
                    <input
                      type="number"
                      min="0.001"
                      step="0.001"
                      value={recorteForm.cantidad_disponible}
                      onChange={(event) =>
                        setRecorteForm((actual) => ({
                          ...actual,
                          cantidad_disponible: event.target.value,
                        }))
                      }
                      disabled={guardandoRecorte}
                    />
                  </label>
                </>
              )}

              <label className="ot-campo">
                <span>Cantidad a consumir</span>
                <input
                  type="number"
                  min="0.001"
                  step="0.001"
                  value={recorteForm.cantidad}
                  onChange={(event) =>
                    setRecorteForm((actual) => ({
                      ...actual,
                      cantidad: event.target.value,
                    }))
                  }
                  disabled={guardandoRecorte}
                />
              </label>
            </div>
          </div>
        </div>
      )}

      {modalInicioAbierto && ordenIniciando && (
        <div className="ot-modal-overlay" onMouseDown={cerrarInicio}>
          <div
            className="ot-modal ot-modal-pequeno"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="ot-modal-barra">
              <button type="button" onClick={cerrarInicio} disabled={guardando}>
                Cancelar
              </button>

              <strong>Iniciar tarea</strong>

              <button
                type="button"
                className="ot-boton-guardar"
                onClick={iniciarTarea}
                disabled={guardando || !operadorInicio}
              >
                {guardando ? "Iniciando..." : "Iniciar"}
              </button>
            </div>

            <div className="ot-modal-contenido">
              <div className="ot-aviso-modal">
                Seleccioná el operador / actuante que realizará esta orden de
                trabajo.
              </div>

              <label className="ot-campo">
                <span>Operador</span>

                <select
                  autoFocus
                  value={operadorInicio}
                  onChange={(event) => setOperadorInicio(event.target.value)}
                  disabled={guardando}
                >
                  <option value="">Seleccionar operador</option>

                  {operadores.map((item) => (
                    <option
                      key={item.id_referente ?? item.operador}
                      value={item.operador}
                    >
                      {item.operador}
                    </option>
                  ))}
                </select>
              </label>

              {operadores.length === 0 && (
                <div className="ot-aviso-modal">
                  No hay referentes / actuantes activos disponibles.
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {modalCrearIndirectoAbierto && (
        <div className="ot-modal-overlay" onMouseDown={cerrarCrearIndirecto}>
          <div
            className="ot-modal ot-modal-pequeno"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="ot-modal-barra">
              <button
                type="button"
                onClick={cerrarCrearIndirecto}
                disabled={guardando}
              >
                Cancelar
              </button>

              <strong>Crear indirecto</strong>

              <button
                type="button"
                className="ot-boton-guardar"
                onClick={crearIndirectoIndependiente}
                disabled={guardando}
              >
                {guardando ? "Creando..." : "Crear e iniciar"}
              </button>
            </div>

            <div className="ot-modal-contenido">
              <div className="ot-aviso-modal">
                Este indirecto no necesita una OT de origen. Quedará ligado al
                usuario que está conectado y comenzará a medir tiempo al crearlo.
              </div>

              <label className="ot-campo">
                <span>Operador / actuante</span>

                <select
                  autoFocus
                  value={operadorIndirecto}
                  onChange={(event) => setOperadorIndirecto(event.target.value)}
                  disabled={guardando}
                >
                  <option value="">Seleccionar operador</option>

                  {operadores.map((item) => (
                    <option
                      key={item.id_referente ?? item.operador}
                      value={item.operador}
                    >
                      {item.operador}
                    </option>
                  ))}
                </select>
              </label>

              <label className="ot-campo">
                <span>Actividad indirecta</span>

                <input
                  type="text"
                  placeholder="Ej.: limpieza, orden, capacitación, espera..."
                  value={actividadIndirecto}
                  onChange={(event) => setActividadIndirecto(event.target.value)}
                  disabled={guardando}
                />
              </label>

              {operadores.length === 0 && (
                <div className="ot-aviso-modal">
                  No hay referentes / actuantes activos disponibles.
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {modalFinalizarIndirectoAbierto && indirectoFinalizando && (
        <div
          className="ot-modal-overlay"
          onMouseDown={() => {
            if (!guardando) {
              setModalFinalizarIndirectoAbierto(false);
              setIndirectoFinalizando(null);
              setMotivoIndirecto("");
            }
          }}
        >
          <div
            className="ot-modal ot-modal-pequeno"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="ot-modal-barra">
              <button
                type="button"
                onClick={() => {
                  setModalFinalizarIndirectoAbierto(false);
                  setIndirectoFinalizando(null);
                  setMotivoIndirecto("");
                }}
                disabled={guardando}
              >
                Cancelar
              </button>

              <strong>Finalizar indirecto</strong>

              <button
                type="button"
                className="ot-boton-guardar"
                onClick={confirmarFinalizarIndirecto}
                disabled={guardando}
              >
                {guardando ? "Finalizando..." : "Finalizar"}
              </button>
            </div>

            <div className="ot-modal-contenido">
              <div className="ot-aviso-modal">
                Indicá qué actividad indirecta se realizó durante esta pausa.
              </div>

              <label className="ot-campo">
                <span>Actividad indirecta</span>

                <input
                  type="text"
                  autoFocus
                  placeholder="Ej.: búsqueda de material, limpieza, espera..."
                  value={motivoIndirecto}
                  onChange={(event) => setMotivoIndirecto(event.target.value)}
                />
              </label>
            </div>
          </div>
        </div>
      )}

      {modalFinalizarAbierto && ordenFinalizando && (
        <div
          className="ot-modal-overlay"
          onMouseDown={() => {
            if (!guardando) {
              setModalFinalizarAbierto(false);
              setOrdenFinalizando(null);
            }
          }}
        >
          <div
            className="ot-modal ot-modal-pequeno"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="ot-modal-barra">
              <button
                type="button"
                onClick={() => {
                  setModalFinalizarAbierto(false);
                  setOrdenFinalizando(null);
                }}
                disabled={guardando}
              >
                Cancelar
              </button>

              <strong>Finalizar OT</strong>

              <button
                type="button"
                className="ot-boton-guardar"
                onClick={confirmarFinalizacion}
                disabled={guardando}
              >
                {guardando ? "Finalizando..." : "Finalizar"}
              </button>
            </div>

            <div className="ot-modal-contenido">
              <div className="ot-aviso-modal">
                Cantidad pedida:{" "}
                {formatearNumero(ordenFinalizando.cantidad_pedida)}
              </div>

              <label className="ot-campo">
                <span>Cantidad fabricada</span>
                <input
                  type="number"
                  min="0"
                  max={Number(ordenFinalizando.cantidad_pedida) || undefined}
                  step="1"
                  autoFocus
                  value={cantidadFinalizar}
                  onChange={(event) => setCantidadFinalizar(event.target.value)}
                />
              </label>

              {cantidadFinalizar !== "" &&
                Number(cantidadFinalizar) <
                  Number(ordenFinalizando.cantidad_pedida) && (
                  <div className="ot-aviso-faltante">
                    Se generará automáticamente una nueva OT por{" "}
                    <strong>
                      {formatearNumero(
                        Number(ordenFinalizando.cantidad_pedida) -
                          Number(cantidadFinalizar),
                      )}
                    </strong>{" "}
                    unidades faltantes.
                  </div>
                )}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
