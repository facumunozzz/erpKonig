import React, { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import api from "../api/axiosConfig";
import "./../styles/transferencias.css";

const crearItemVacio = () => ({
  codigo: "",
  descripcion: "",
  stock: "",
  stockTotal: "",
  ubicacion: "",
  cantidad: "",
});

const normalizarTexto = (valor) =>
  String(valor ?? "")
    .trim()
    .toUpperCase();

const normalizarFecha = (valor) => {
  if (!valor) {
    return new Date().toISOString().slice(0, 10);
  }

  return String(valor).slice(0, 10);
};

export default function NuevaTransferencia() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const desdeAlerta =
    searchParams.get("desdeAlerta") === "1";
  const alertaIdUrl =
    searchParams.get("alertaId") || "";
  const codigoAlerta =
    searchParams.get("codigo") || "";
  const descripcionAlerta =
    searchParams.get("descripcion") || "";
  const cantidadAlerta =
    searchParams.get("cantidad") || "";
  const fechaAlerta =
    searchParams.get("fecha") || "";
  const remitoAlerta =
    searchParams.get("remitoReferencia") || "";
  const [depositos, setDepositos] = useState([]);
  const [referentes, setReferentes] = useState([]);
  const [origenId, setOrigenId] = useState("");
  const [destinoId, setDestinoId] = useState("");
  const [remitoReferencia, setRemitoReferencia] = useState("");
  const [referenteId, setReferenteId] = useState("");
  const [fechaReal, setFechaReal] = useState(() =>
    new Date().toISOString().slice(0, 10),
  );

  const [items, setItems] = useState([crearItemVacio()]);
  const [errorMsg, setErrorMsg] = useState("");
  const [errorDepositos, setErrorDepositos] = useState("");
  const [loadingReferentes, setLoadingReferentes] = useState(false);
  const [confirmando, setConfirmando] = useState(false);

  // Modal de carga
  const [mostrarReferencia, setMostrarReferencia] = useState(false);

  const [modoBusqueda, setModoBusqueda] = useState("referencia");

  const [numeroReferencia, setNumeroReferencia] = useState("");
  const [obraBusqueda, setObraBusqueda] = useState("");
  const [versionBusqueda, setVersionBusqueda] = useState("");

  const [buscandoReferencia, setBuscandoReferencia] = useState(false);

  const [opcionesReferencia, setOpcionesReferencia] = useState([]);

  // Ahora es un array para permitir selección múltiple
  const [referenciasSeleccionadas, setReferenciasSeleccionadas] = useState([]);

  const cargandoReferenciaRef = useRef(false);

  const codigoRefs = useRef([]);
  const cantidadRefs = useRef([]);
  const referenciaInputRef = useRef(null);

  const getPanolId = (lista) => {
    const panol = (lista || []).find(
      (deposito) => normalizarTexto(deposito.nombre) === "PAÑOL",
    );

    return panol ? String(panol.id_deposito) : "";
  };

  const buscarDepositoPorNombre = (nombre) => {
    const nombreNormalizado = normalizarTexto(nombre);

    if (!nombreNormalizado) {
      return null;
    }

    return (
      depositos.find(
        (deposito) => normalizarTexto(deposito.nombre) === nombreNormalizado,
      ) || null
    );
  };

  const cargarReferentes = async () => {
    try {
      setLoadingReferentes(true);

      const response = await api.get("/referentes");

      const lista = Array.isArray(response.data) ? response.data : [];

      setReferentes(lista.filter((referente) => referente.activo));
    } catch (error) {
      console.error("Error cargando referentes:", error);

      setReferentes([]);
      setErrorMsg("No se pudieron cargar los referentes.");
    } finally {
      setLoadingReferentes(false);
    }
  };

  useEffect(() => {
    const cargarDatosIniciales = async () => {
      try {
        const response = await api.get("/depositos");

        const lista = Array.isArray(response.data) ? response.data : [];

        setDepositos(lista);
        setErrorDepositos("");

        const panolId = getPanolId(lista);

        if (panolId) {
          setOrigenId((valorActual) => valorActual || panolId);
        }
      } catch (error) {
        console.error("Error cargando depósitos:", error);

        setDepositos([]);
        setErrorDepositos("No se pudo cargar la lista de depósitos.");
      }

      await cargarReferentes();
    };

    cargarDatosIniciales();
  }, []);

  useEffect(() => {
    if (cargandoReferenciaRef.current) {
      return;
    }

    const articulosConCodigo = items
      .map((item, index) => ({
        codigo: normalizarTexto(item.codigo),
        index,
      }))
      .filter((item) => item.codigo);

    if (!origenId) {
      setItems((itemsActuales) =>
        itemsActuales.map((item) => ({
          ...item,
          stock: "",
          stockTotal: "",
        })),
      );

      return;
    }

    if (!articulosConCodigo.length) {
      return;
    }

    const actualizarStocks = async () => {
      const nuevosItems = [...items];

      await Promise.all(
        articulosConCodigo.map(async ({ codigo, index }) => {
          try {
            const response = await api.get("/transferencias/stock-articulo", {
              params: {
                codigo,
                deposito_id: Number(origenId),
              },
            });

            nuevosItems[index] = {
              ...nuevosItems[index],

              codigo: response.data?.codigo || codigo,

              stock: response.data?.stock_deposito ?? response.data?.stock ?? 0,

              stockTotal: response.data?.stock_total ?? 0,

              ubicacion:
                response.data?.ubicacion ?? nuevosItems[index]?.ubicacion ?? "",
            };
          } catch (error) {
            console.error(`Error consultando stock de ${codigo}:`, error);

            nuevosItems[index] = {
              ...nuevosItems[index],
              stock: "Error",
              stockTotal: "Error",
            };
          }
        }),
      );

      setItems(nuevosItems);
    };

    actualizarStocks();

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [origenId]);

  useEffect(() => {
  if (!desdeAlerta) {
    return;
  }

  const cargarDesdeAlerta = async () => {
    const codigo = normalizarTexto(
      codigoAlerta,
    );

    const cantidad = Math.abs(
      Number(cantidadAlerta || 0),
    );

    setRemitoReferencia(remitoAlerta);

    if (fechaAlerta) {
      setFechaReal(
        String(fechaAlerta).slice(0, 10),
      );
    }

    /*
     * El depósito origen debe quedar vacío.
     */
    setOrigenId("");

    if (!codigo) {
      return;
    }

    setItems([
      {
        ...crearItemVacio(),

        codigo,

        descripcion:
          descripcionAlerta || "",

        cantidad:
          Number.isFinite(cantidad) &&
          cantidad > 0
            ? String(cantidad)
            : "",
      },
    ]);

    try {
      const response = await api.get(
        "/transferencias/articulo",
        {
          params: {
            codigo,
          },
        },
      );

      const articulo = response.data || {};

      setItems([
        {
          ...crearItemVacio(),

          codigo: normalizarTexto(
            articulo.codigo || codigo,
          ),

          descripcion:
            articulo.descripcion ||
            descripcionAlerta ||
            "",

          ubicacion:
            articulo.ubicacion || "",

          cantidad:
            Number.isFinite(cantidad) &&
            cantidad > 0
              ? String(cantidad)
              : "",
        },
      ]);
    } catch (error) {
      console.error(
        "No se pudo validar el artículo de la alerta:",
        error,
      );

      setItems([
        {
          ...crearItemVacio(),

          codigo,

          descripcion:
            descripcionAlerta ||
            "Artículo no encontrado",

          cantidad:
            Number.isFinite(cantidad) &&
            cantidad > 0
              ? String(cantidad)
              : "",
        },
      ]);
    }
  };

  cargarDesdeAlerta();

  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [desdeAlerta]);

  const actualizarItem = (index, cambios) => {
    setItems((itemsActuales) =>
      itemsActuales.map((item, itemIndex) =>
        itemIndex === index
          ? {
              ...item,
              ...cambios,
            }
          : item,
      ),
    );
  };

  const consultarStockPorDeposito = async (codigo, depositoId) => {
    const codigoNormalizado = normalizarTexto(codigo);
    const depositoNumero = Number(depositoId);

    if (
      !codigoNormalizado ||
      !Number.isInteger(depositoNumero) ||
      depositoNumero <= 0
    ) {
      return {
        codigo: codigoNormalizado,
        stock: "",
        stockTotal: "",
        ubicacion: "",
      };
    }

    try {
      const response = await api.get("/transferencias/stock-articulo", {
        params: {
          codigo: codigoNormalizado,
          deposito_id: depositoNumero,
        },
      });

      return {
        codigo: response.data?.codigo || codigoNormalizado,

        stock: response.data?.stock_deposito ?? response.data?.stock ?? 0,

        stockTotal: response.data?.stock_total ?? 0,

        ubicacion: response.data?.ubicacion ?? "",
      };
    } catch (error) {
      console.error(`Error consultando stock de ${codigoNormalizado}:`, error);

      return {
        codigo: codigoNormalizado,
        stock: "Error",
        stockTotal: "Error",
        ubicacion: "",
      };
    }
  };

  const consultarStock = async (codigo, index) => {
    const datosStock = await consultarStockPorDeposito(codigo, origenId);

    actualizarItem(index, datosStock);

    return datosStock.stock !== "Error";
  };

  const buscarArticulo = async (codigo, index) => {
    const codigoNormalizado = normalizarTexto(codigo);

    if (!codigoNormalizado) {
      actualizarItem(index, {
        codigo: "",
        descripcion: "",
        stock: "",
        stockTotal: "",
        ubicacion: "",
      });

      return false;
    }

    try {
      let response;

      try {
        response = await api.get(
          `/articulos/codigo/${encodeURIComponent(codigoNormalizado)}`,
        );
      } catch {
        response = await api.get("/transferencias/articulo", {
          params: {
            codigo: codigoNormalizado,
          },
        });
      }

      const articulo = response.data || {};

      const codigoArticulo = normalizarTexto(
        articulo.codigo || codigoNormalizado,
      );

      if (!articulo.descripcion) {
        actualizarItem(index, {
          codigo: codigoArticulo,
          descripcion: "Artículo no encontrado",
          stock: "",
          stockTotal: "",
          ubicacion: "",
        });

        return false;
      }

      actualizarItem(index, {
        codigo: codigoArticulo,
        descripcion: articulo.descripcion || "",
      });

      await consultarStock(codigoArticulo, index);

      return true;
    } catch (error) {
      console.error("No se encontró el artículo:", error);

      actualizarItem(index, {
        codigo: codigoNormalizado,
        descripcion: "Artículo no encontrado",
        stock: "",
        stockTotal: "",
        ubicacion: "",
      });

      return false;
    }
  };

  const asegurarFilaSiguiente = (index) => {
    setItems((itemsActuales) => {
      if (index !== itemsActuales.length - 1) {
        return itemsActuales;
      }

      return [...itemsActuales, crearItemVacio()];
    });

    setTimeout(() => {
      codigoRefs.current[index + 1]?.focus();
    }, 80);
  };

  const handleCodigoKeyDown = async (event, index) => {
    if (event.key !== "Enter") {
      return;
    }

    event.preventDefault();

    const codigo = normalizarTexto(items[index]?.codigo);

    if (!codigo) {
      return;
    }

    const encontrado = await buscarArticulo(codigo, index);

    if (encontrado) {
      cantidadRefs.current[index]?.focus();
    }
  };

  const handleCantidadKeyDown = (event, index) => {
    if (event.key !== "Enter") {
      return;
    }

    event.preventDefault();

    asegurarFilaSiguiente(index);
  };

  const quitarItem = (index) => {
    setItems((itemsActuales) => {
      const nuevosItems = itemsActuales.filter(
        (_, itemIndex) => itemIndex !== index,
      );

      return nuevosItems.length ? nuevosItems : [crearItemVacio()];
    });
  };

  const agregarFila = () => {
    setItems((itemsActuales) => [...itemsActuales, crearItemVacio()]);

    setTimeout(() => {
      codigoRefs.current[items.length]?.focus();
    }, 80);
  };

  // ======================================================
  // CARGA DESDE MOVIMIENTOS
  // ======================================================

  const limpiarBusquedaMovimientos = () => {
    setNumeroReferencia("");
    setObraBusqueda("");
    setVersionBusqueda("");
    setOpcionesReferencia([]);
    setReferenciasSeleccionadas([]);
  };

  const abrirCargarReferencia = () => {
    setModoBusqueda("referencia");
    limpiarBusquedaMovimientos();
    setErrorMsg("");
    setMostrarReferencia(true);

    setTimeout(() => {
      referenciaInputRef.current?.focus();
    }, 100);
  };

  const cerrarCargarReferencia = () => {
    if (buscandoReferencia) {
      return;
    }

    setMostrarReferencia(false);
    limpiarBusquedaMovimientos();
  };

  const cambiarModoBusqueda = (nuevoModo) => {
    setModoBusqueda(nuevoModo);
    limpiarBusquedaMovimientos();
    setErrorMsg("");

    setTimeout(() => {
      referenciaInputRef.current?.focus();
    }, 100);
  };

  const obtenerDepositoReferencia = (movimiento) => {
    const tipo = normalizarTexto(movimiento.tipo_transaccion);

    const ingresoEgreso = normalizarTexto(movimiento.ingreso_egreso);

    if (tipo === "TRANSFERENCIA") {
      return movimiento.deposito_destino || movimiento.deposito_origen || "";
    }

    if (ingresoEgreso === "I") {
      return movimiento.deposito_destino || movimiento.deposito_origen || "";
    }

    if (ingresoEgreso === "E") {
      return movimiento.deposito_origen || movimiento.deposito_destino || "";
    }

    return movimiento.deposito_destino || movimiento.deposito_origen || "";
  };

  const buscarReferencia = async () => {
    const referencia = String(numeroReferencia || "").trim();
    const obra = String(obraBusqueda || "").trim();
    const version = String(versionBusqueda || "").trim();

    if (modoBusqueda === "referencia" && !referencia) {
      setErrorMsg("Ingresá una referencia.");
      referenciaInputRef.current?.focus();
      return;
    }

    if (modoBusqueda === "obra_version" && (!obra || !version)) {
      setErrorMsg("Ingresá obra y versión.");
      referenciaInputRef.current?.focus();
      return;
    }

    try {
      setBuscandoReferencia(true);
      setErrorMsg("");
      setOpcionesReferencia([]);
      setReferenciasSeleccionadas([]);

      const response = await api.get("/movimientos/carga-transferencia", {
        params:
          modoBusqueda === "referencia"
            ? {
                modo: "referencia",
                referencia,
              }
            : {
                modo: "obra_version",
                obra,
                version,
              },
      });

      const movimientos = Array.isArray(response.data) ? response.data : [];

      if (!movimientos.length) {
        setErrorMsg(
          modoBusqueda === "referencia"
            ? `No se encontraron movimientos para la referencia ${referencia}.`
            : `No se encontraron movimientos para la obra ${obra}, versión ${version}.`,
        );

        return;
      }

      const grupos = new Map();

      movimientos.forEach((movimiento) => {
        const tipo =
          normalizarTexto(movimiento.tipo_transaccion) || "MOVIMIENTO";

        const numeroTransaccion = String(
          movimiento.numero_transaccion ?? "",
        ).trim();

        const deposito = obtenerDepositoReferencia(movimiento);

        const sentido = normalizarTexto(movimiento.ingreso_egreso) || "";

        const remito = String(movimiento.remito_referencia || "").trim();

        const obraMovimiento = String(movimiento.obra || "").trim();

        const versionMovimiento = String(movimiento.version || "").trim();

        const clave = [
          tipo,
          numeroTransaccion,
          normalizarTexto(deposito),
          sentido,
          normalizarTexto(remito),
          normalizarTexto(obraMovimiento),
          normalizarTexto(versionMovimiento),
        ].join("|");

        if (!grupos.has(clave)) {
          grupos.set(clave, {
            id: clave,
            tipo,
            numeroTransaccion,
            deposito,
            sentido,
            remitoReferencia: remito,
            obra: obraMovimiento,
            version: versionMovimiento,
            movimientos: [],
          });
        }

        grupos.get(clave).movimientos.push(movimiento);
      });

      const opciones = Array.from(grupos.values()).map((grupo) => {
        const primero = grupo.movimientos[0] || {};

        return {
          ...grupo,

          fechaReal: primero.fecha_real || primero.fecha || "",

          referente: primero.referente || "",

          referenteId: primero.id_referente || "",

          motivo: primero.motivo || "",

          cantidadArticulos: grupo.movimientos.length,
        };
      });

      setOpcionesReferencia(opciones);

      if (opciones.length === 1) {
        setReferenciasSeleccionadas([opciones[0].id]);
      }
    } catch (error) {
      console.error("Error buscando movimientos:", error);

      setErrorMsg(
        error.response?.data?.error ||
          error.response?.data?.detalle ||
          "No se pudieron buscar los movimientos.",
      );
    } finally {
      setBuscandoReferencia(false);
    }
  };

  const alternarOpcionSeleccionada = (id) => {
    setReferenciasSeleccionadas((seleccionadas) =>
      seleccionadas.includes(id)
        ? seleccionadas.filter((seleccionada) => seleccionada !== id)
        : [...seleccionadas, id],
    );
  };

  const seleccionarTodas = () => {
    setReferenciasSeleccionadas(opcionesReferencia.map((opcion) => opcion.id));
  };

  const quitarTodas = () => {
    setReferenciasSeleccionadas([]);
  };

  const cargarReferenciasSeleccionadas = async () => {
    const seleccionadas = opcionesReferencia.filter((opcion) =>
      referenciasSeleccionadas.includes(opcion.id),
    );

    if (!seleccionadas.length) {
      setErrorMsg("Seleccioná al menos un movimiento para cargar.");

      return;
    }

    const depositosSeleccionados = [
      ...new Set(
        seleccionadas
          .map((opcion) => normalizarTexto(opcion.deposito))
          .filter(Boolean),
      ),
    ];

    if (depositosSeleccionados.length !== 1) {
      setErrorMsg(
        "Las opciones seleccionadas pertenecen a depósitos diferentes. " +
          "Una transferencia solo puede tener un depósito de origen.",
      );

      return;
    }

    const depositoEncontrado = buscarDepositoPorNombre(
      seleccionadas[0].deposito,
    );

    if (!depositoEncontrado) {
      setErrorMsg(
        `El depósito "${seleccionadas[0].deposito}" no existe en la lista de depósitos.`,
      );

      return;
    }

    const nuevoOrigenId = String(depositoEncontrado.id_deposito);

    try {
      setBuscandoReferencia(true);
      setErrorMsg("");

      cargandoReferenciaRef.current = true;

      const articulosAgrupados = new Map();

      seleccionadas.forEach((opcion) => {
        opcion.movimientos.forEach((movimiento) => {
          const codigo = normalizarTexto(movimiento.codigo);

          const cantidad = Math.abs(Number(movimiento.cantidad) || 0);

          if (!codigo || cantidad <= 0) {
            return;
          }

          const actual = articulosAgrupados.get(codigo) || {
            codigo,
            descripcion: movimiento.descripcion || "",
            cantidad: 0,
          };

          actual.cantidad += cantidad;

          if (!actual.descripcion && movimiento.descripcion) {
            actual.descripcion = movimiento.descripcion;
          }

          articulosAgrupados.set(codigo, actual);
        });
      });

      const articulos = Array.from(articulosAgrupados.values());

      if (!articulos.length) {
        setErrorMsg(
          "Los movimientos seleccionados no contienen artículos válidos.",
        );

        return;
      }

      const nuevosItems = await Promise.all(
        articulos.map(async (articulo) => {
          const datosStock = await consultarStockPorDeposito(
            articulo.codigo,
            nuevoOrigenId,
          );

          return {
            codigo: datosStock.codigo || articulo.codigo,

            descripcion: articulo.descripcion || "",

            stock: datosStock.stock,

            stockTotal: datosStock.stockTotal,

            ubicacion: datosStock.ubicacion,

            cantidad: String(Math.trunc(articulo.cantidad)),
          };
        }),
      );

      const primeraOpcion = seleccionadas[0];

      setOrigenId(nuevoOrigenId);
      setDestinoId("");

      setReferenteId(
        primeraOpcion.referenteId ? String(primeraOpcion.referenteId) : "",
      );

      setFechaReal(normalizarFecha(primeraOpcion.fechaReal));

      if (modoBusqueda === "referencia") {
        setRemitoReferencia(numeroReferencia.trim());
      } else {
        setRemitoReferencia(
          `OBRA ${obraBusqueda.trim()} - VERSIÓN ${versionBusqueda.trim()}`,
        );
      }

      setItems(nuevosItems);

      setMostrarReferencia(false);
      limpiarBusquedaMovimientos();

      setTimeout(() => {
        cargandoReferenciaRef.current = false;
      }, 200);
    } catch (error) {
      console.error("Error cargando movimientos:", error);

      cargandoReferenciaRef.current = false;

      setErrorMsg(
        error.response?.data?.error ||
          error.response?.data?.detalle ||
          "No se pudieron cargar los movimientos.",
      );
    } finally {
      setBuscandoReferencia(false);
    }
  };

  // ======================================================
  // CONFIRMAR
  // ======================================================

  const confirmar = async () => {
    if (confirmando) {
      return;
    }

    try {
      setConfirmando(true);
      setErrorMsg("");

      const depositoOrigenId = Number(origenId);
      const depositoDestinoId = Number(destinoId);

      if (!Number.isInteger(depositoOrigenId) || depositoOrigenId <= 0) {
        setErrorMsg("Seleccioná el depósito origen.");
        return;
      }

      if (!Number.isInteger(depositoDestinoId) || depositoDestinoId <= 0) {
        setErrorMsg("Seleccioná el depósito destino.");
        return;
      }

      if (depositoOrigenId === depositoDestinoId) {
        setErrorMsg("El depósito origen y destino deben ser distintos.");

        return;
      }

      const itemsConCodigo = items
        .map((item) => ({
          codigo: normalizarTexto(item.codigo),

          descripcion: String(item.descripcion || "").trim(),

          ubicacion: String(item.ubicacion || "").trim(),

          cantidad: Number(item.cantidad),
        }))
        .filter((item) => item.codigo);

      if (!itemsConCodigo.length) {
        setErrorMsg("Cargá al menos un código.");
        return;
      }

      const itemsNoEncontrados = itemsConCodigo.filter(
        (item) =>
          !item.descripcion ||
          item.descripcion.toUpperCase().includes("NO ENCONTRADO"),
      );

      if (itemsNoEncontrados.length) {
        setErrorMsg(
          "Hay códigos sin validar o no encontrados. Revisá la tabla antes de confirmar.",
        );

        return;
      }

      const itemsSinCantidad = itemsConCodigo.filter(
        (item) => !Number.isFinite(item.cantidad) || item.cantidad <= 0,
      );

      if (itemsSinCantidad.length) {
        setErrorMsg(
          "Todos los códigos cargados deben tener una cantidad mayor a cero.",
        );

        return;
      }

      const body = {
        origen_id: depositoOrigenId,
        destino_id: depositoDestinoId,

        remito_referencia: remitoReferencia.trim() || null,

        id_referente: referenteId ? Number(referenteId) : null,

        fecha_real: fechaReal || null,

        items: itemsConCodigo.map((item) => ({
          codigo: item.codigo,
          ubicacion: item.ubicacion,
          cantidad: Math.trunc(item.cantidad),
        })),
      };

      const response = await api.post("/transferencias", body);
      const alertaIdNumero = Number(alertaIdUrl);
      if (
        desdeAlerta &&
        Number.isInteger(alertaIdNumero) &&
        alertaIdNumero > 0
      ) {
        try {
          await api.put(
            "/ajustes/alertas-consumo/marcar-leidas",
            {
              ids: [alertaIdNumero],
            },
          );
        } catch (errorAlerta) {
          console.error(
            "La transferencia fue creada, pero no se pudo resolver la alerta:",
            errorAlerta,
          );

          window.alert(
            "La transferencia se creó correctamente, pero la revisión no pudo marcarse como resuelta.",
          );
        }
      }

      const numeroTransferencia =
        response.data?.cabecera?.numero_transferencia ||
        response.data?.transferencia?.numero_transferencia ||
        response.data?.id ||
        response.data?.message ||
        "OK";

      alert(`Transferencia creada: ${numeroTransferencia}`);

      navigate("/transferencias");
    } catch (error) {
      console.error("Error confirmando transferencia:", error);

      const errorApi =
        error.response?.data?.error ||
        error.response?.data?.detalle ||
        error.message ||
        "Error al confirmar la transferencia";

      if (Array.isArray(error.response?.data?.faltantes)) {
        const detalleFaltantes = error.response.data.faltantes
          .map(
            (item) =>
              `${item.codigo}: requerido ${item.requerido}, disponible ${item.disponible}`,
          )
          .join(" | ");

        setErrorMsg(`${errorApi}. ${detalleFaltantes}`);
      } else {
        setErrorMsg(
          typeof errorApi === "string" ? errorApi : JSON.stringify(errorApi),
        );
      }
    } finally {
      setConfirmando(false);
    }
  };

  const mismoDeposito =
    Number(origenId) > 0 &&
    Number(destinoId) > 0 &&
    Number(origenId) === Number(destinoId);

  const hayItemsConDatos = items.some((item) =>
    String(item.codigo || "").trim(),
  );

  return (
    <div className="nueva-transferencia-page">
      <div className="nt-header">
        <h2 className="module-title">Nueva Transferencia</h2>

        <button
          type="button"
          className="btn-light"
          onClick={abrirCargarReferencia}
          disabled={confirmando}
        >
          Cargar movimientos
        </button>

        <button
          type="button"
          className="nt-volver"
          onClick={() => navigate("/transferencias")}
        >
          ← Volver
        </button>
      </div>

      {errorDepositos && <div className="nt-error">{errorDepositos}</div>}

      {errorMsg && <div className="nt-error">{errorMsg}</div>}

      {mismoDeposito && (
        <div className="nt-error">
          El depósito origen y destino deben ser distintos.
        </div>
      )}

      <div className="nt-card">
        <div className="nt-row">
          <div className="nt-field">
            <label htmlFor="transferencia-origen">Origen</label>

            <select
              id="transferencia-origen"
              value={origenId}
              onChange={(event) => setOrigenId(event.target.value)}
            >
              <option value="">-- Seleccioná depósito origen --</option>

              {depositos.map((deposito) => (
                <option key={deposito.id_deposito} value={deposito.id_deposito}>
                  {deposito.nombre}
                </option>
              ))}
            </select>
          </div>

          <div className="nt-field">
            <label htmlFor="transferencia-destino">Destino</label>

            <select
              id="transferencia-destino"
              value={destinoId}
              onChange={(event) => setDestinoId(event.target.value)}
            >
              <option value="">-- Seleccioná depósito destino --</option>

              {depositos.map((deposito) => (
                <option key={deposito.id_deposito} value={deposito.id_deposito}>
                  {deposito.nombre}
                </option>
              ))}
            </select>
          </div>

          <div className="nt-field">
            <label htmlFor="transferencia-remito">Remito / Referencia</label>

            <input
              id="transferencia-remito"
              type="text"
              value={remitoReferencia}
              onChange={(event) => setRemitoReferencia(event.target.value)}
              placeholder="Remito, comprobante o referencia..."
            />
          </div>

          <div className="nt-field">
            <label htmlFor="transferencia-referente">Actuante</label>

            <select
              id="transferencia-referente"
              value={referenteId}
              onChange={(event) => setReferenteId(event.target.value)}
              disabled={loadingReferentes}
            >
              <option value="">
                {loadingReferentes
                  ? "Cargando referentes..."
                  : "-- Seleccioná referente --"}
              </option>

              {referentes.map((referente) => (
                <option
                  key={referente.id_referente}
                  value={referente.id_referente}
                >
                  {referente.nombre}
                </option>
              ))}
            </select>
          </div>

          <div className="nt-field small">
            <label htmlFor="transferencia-fecha">Fecha real</label>

            <input
              id="transferencia-fecha"
              type="date"
              value={fechaReal}
              onChange={(event) => setFechaReal(event.target.value)}
            />
          </div>
        </div>
      </div>

      <div className="nt-card">
        <h4>Ítems a transferir</h4>

        <div className="tabla-articulos-container">
          <table className="tabla-articulos">
            <thead>
              <tr>
                <th style={{ width: 170 }}>Código</th>

                <th>Descripción</th>

                <th
                  style={{
                    width: 120,
                    textAlign: "right",
                  }}
                >
                  Stock origen
                </th>

                <th
                  style={{
                    width: 120,
                    textAlign: "right",
                  }}
                >
                  Stock total
                </th>

                <th style={{ width: 190 }}>Ubicación</th>

                <th
                  style={{
                    width: 140,
                    textAlign: "right",
                  }}
                >
                  Cantidad
                </th>

                <th style={{ width: 110 }}>Acción</th>
              </tr>
            </thead>

            <tbody>
              {items.map((item, index) => (
                <tr key={index}>
                  <td>
                    <input
                      ref={(elemento) => {
                        codigoRefs.current[index] = elemento;
                      }}
                      type="text"
                      value={item.codigo}
                      placeholder="Código..."
                      onChange={(event) =>
                        actualizarItem(index, {
                          codigo: event.target.value.toUpperCase(),
                          descripcion: "",
                          stock: "",
                          stockTotal: "",
                          ubicacion: "",
                        })
                      }
                      onBlur={() => buscarArticulo(item.codigo, index)}
                      onKeyDown={(event) => handleCodigoKeyDown(event, index)}
                      style={{ width: "100%" }}
                    />
                  </td>

                  <td>
                    <input
                      type="text"
                      value={item.descripcion}
                      readOnly
                      placeholder="Se completa automáticamente"
                      style={{ width: "100%" }}
                    />
                  </td>

                  <td style={{ textAlign: "right" }}>{item.stock ?? ""}</td>

                  <td style={{ textAlign: "right" }}>
                    {item.stockTotal ?? ""}
                  </td>

                  <td>
                    <input
                      type="text"
                      value={item.ubicacion || ""}
                      placeholder="Ubicación del artículo"
                      maxLength={100}
                      onChange={(event) =>
                        actualizarItem(index, {
                          ubicacion: event.target.value,
                        })
                      }
                      style={{ width: "100%" }}
                    />
                  </td>

                  <td>
                    <input
                      ref={(elemento) => {
                        cantidadRefs.current[index] = elemento;
                      }}
                      type="number"
                      min="1"
                      step="1"
                      value={item.cantidad}
                      onChange={(event) =>
                        actualizarItem(index, {
                          cantidad: event.target.value.replace(/[^0-9]/g, ""),
                        })
                      }
                      onKeyDown={(event) => handleCantidadKeyDown(event, index)}
                      style={{
                        width: "100%",
                        textAlign: "right",
                      }}
                    />
                  </td>

                  <td>
                    <button
                      type="button"
                      className="borrar-btn"
                      onClick={() => quitarItem(index)}
                    >
                      Quitar
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="nt-actions" style={{ marginTop: 14 }}>
          <button
            type="button"
            className="btn-light"
            onClick={agregarFila}
            disabled={confirmando}
          >
            Agregar fila
          </button>

          <button
            type="button"
            className="btn-primary"
            onClick={confirmar}
            disabled={
              confirmando ||
              !origenId ||
              !destinoId ||
              !hayItemsConDatos ||
              mismoDeposito
            }
          >
            {confirmando ? "Confirmando..." : "Confirmar transferencia"}
          </button>
        </div>
      </div>

      {mostrarReferencia && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.45)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 9999,
            padding: 20,
          }}
        >
          <div
            style={{
              width: "min(900px, 96vw)",
              maxHeight: "90vh",
              overflowY: "auto",
              background: "#fff",
              borderRadius: 8,
              padding: 22,
            }}
          >
            <h3>Cargar movimientos</h3>

            <div
              style={{
                display: "flex",
                gap: 18,
                marginBottom: 18,
              }}
            >
              <label>
                <input
                  type="radio"
                  checked={modoBusqueda === "referencia"}
                  onChange={() => cambiarModoBusqueda("referencia")}
                />{" "}
                Buscar por referencia
              </label>

              <label>
                <input
                  type="radio"
                  checked={modoBusqueda === "obra_version"}
                  onChange={() => cambiarModoBusqueda("obra_version")}
                />{" "}
                Buscar por obra y versión
              </label>
            </div>

            {modoBusqueda === "referencia" ? (
              <label>
                Referencia
                <input
                  ref={referenciaInputRef}
                  type="text"
                  value={numeroReferencia}
                  onChange={(event) => {
                    setNumeroReferencia(event.target.value);

                    setOpcionesReferencia([]);
                    setReferenciasSeleccionadas([]);
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      buscarReferencia();
                    }
                  }}
                  style={{
                    display: "block",
                    width: "100%",
                    marginTop: 5,
                  }}
                />
              </label>
            ) : (
              <div
                style={{
                  display: "flex",
                  gap: 12,
                  flexWrap: "wrap",
                }}
              >
                <label style={{ flex: 1 }}>
                  Obra
                  <input
                    ref={referenciaInputRef}
                    type="text"
                    value={obraBusqueda}
                    onChange={(event) => {
                      setObraBusqueda(event.target.value);

                      setOpcionesReferencia([]);
                      setReferenciasSeleccionadas([]);
                    }}
                    style={{
                      display: "block",
                      width: "100%",
                      marginTop: 5,
                    }}
                  />
                </label>

                <label style={{ flex: 1 }}>
                  Versión
                  <input
                    type="text"
                    value={versionBusqueda}
                    onChange={(event) => {
                      setVersionBusqueda(event.target.value);

                      setOpcionesReferencia([]);
                      setReferenciasSeleccionadas([]);
                    }}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        buscarReferencia();
                      }
                    }}
                    style={{
                      display: "block",
                      width: "100%",
                      marginTop: 5,
                    }}
                  />
                </label>
              </div>
            )}

            <div style={{ marginTop: 14 }}>
              <button
                type="button"
                className="btn-primary"
                onClick={buscarReferencia}
                disabled={buscandoReferencia}
              >
                {buscandoReferencia ? "Buscando..." : "Buscar"}
              </button>
            </div>

            {opcionesReferencia.length > 0 && (
              <div style={{ marginTop: 22 }}>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    gap: 10,
                  }}
                >
                  <h4>Seleccioná uno o más movimientos</h4>

                  <div>
                    <button
                      type="button"
                      className="btn-light"
                      onClick={seleccionarTodas}
                    >
                      Seleccionar todos
                    </button>

                    <button
                      type="button"
                      className="btn-light"
                      onClick={quitarTodas}
                      style={{ marginLeft: 8 }}
                    >
                      Quitar selección
                    </button>
                  </div>
                </div>

                <div
                  style={{
                    display: "grid",
                    gap: 10,
                  }}
                >
                  {opcionesReferencia.map((opcion) => {
                    const seleccionada = referenciasSeleccionadas.includes(
                      opcion.id,
                    );

                    return (
                      <label
                        key={opcion.id}
                        style={{
                          display: "flex",
                          gap: 12,
                          alignItems: "flex-start",
                          padding: 12,
                          border: seleccionada
                            ? "2px solid #356ae6"
                            : "1px solid #ccc",
                          borderRadius: 6,
                          cursor: "pointer",
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={seleccionada}
                          onChange={() => alternarOpcionSeleccionada(opcion.id)}
                        />

                        <span>
                          <strong>
                            {opcion.tipo} {opcion.numeroTransaccion}
                          </strong>
                          <br />
                          Depósito:{" "}
                          <strong>{opcion.deposito || "Sin depósito"}</strong>
                          {opcion.sentido && (
                            <>
                              {" "}
                              —{" "}
                              {opcion.sentido === "I"
                                ? "Ingreso"
                                : opcion.sentido === "E"
                                  ? "Egreso"
                                  : opcion.sentido}
                            </>
                          )}
                          <br />
                          Artículos: {opcion.cantidadArticulos}
                          {opcion.fechaReal && (
                            <> — Fecha: {normalizarFecha(opcion.fechaReal)}</>
                          )}
                          {opcion.remitoReferencia && (
                            <>
                              <br />
                              Referencia: {opcion.remitoReferencia}
                            </>
                          )}
                          {opcion.obra && (
                            <>
                              <br />
                              Obra: {opcion.obra}
                            </>
                          )}
                          {opcion.version && <> — Versión: {opcion.version}</>}
                          {opcion.referente && (
                            <>
                              <br />
                              Actuante: {opcion.referente}
                            </>
                          )}
                        </span>
                      </label>
                    );
                  })}
                </div>
              </div>
            )}

            <div
              style={{
                display: "flex",
                justifyContent: "flex-end",
                gap: 10,
                marginTop: 24,
              }}
            >
              <button
                type="button"
                className="btn-light"
                onClick={cerrarCargarReferencia}
                disabled={buscandoReferencia}
              >
                Cancelar
              </button>

              <button
                type="button"
                className="btn-primary"
                onClick={cargarReferenciasSeleccionadas}
                disabled={
                  buscandoReferencia || !referenciasSeleccionadas.length
                }
              >
                {buscandoReferencia
                  ? "Cargando..."
                  : `Cargar seleccionados (${referenciasSeleccionadas.length})`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
