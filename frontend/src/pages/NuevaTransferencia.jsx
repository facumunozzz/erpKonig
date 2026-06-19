import React, { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
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

  /*
   * Estados para cargar una referencia desde Movimientos.
   */
  const [mostrarReferencia, setMostrarReferencia] = useState(false);
  const [numeroReferencia, setNumeroReferencia] = useState("");
  const [buscandoReferencia, setBuscandoReferencia] = useState(false);
  const [opcionesReferencia, setOpcionesReferencia] = useState([]);
  const [referenciaSeleccionada, setReferenciaSeleccionada] = useState("");

  /*
   * Evita que el efecto que responde al cambio de origen
   * borre los stocks mientras se está cargando una referencia.
   */
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

  /*
   * Cuando el usuario cambia manualmente el depósito origen,
   * se vuelven a consultar los stocks de todos los artículos.
   */
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
  // CARGAR REFERENCIA DESDE MOVIMIENTOS
  // ======================================================

  const abrirCargarReferencia = () => {
    setNumeroReferencia("");
    setOpcionesReferencia([]);
    setReferenciaSeleccionada("");
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
    setNumeroReferencia("");
    setOpcionesReferencia([]);
    setReferenciaSeleccionada("");
  };

  /*
   * Determina el depósito en el que se encuentra o desde el
   * que salió el material correspondiente al movimiento.
   */
  const obtenerDepositoReferencia = (movimiento) => {
    const tipo = normalizarTexto(movimiento.tipo_transaccion);

    const ingresoEgreso = normalizarTexto(movimiento.ingreso_egreso);

    if (tipo === "TRANSFERENCIA") {
      /*
       * En una transferencia anterior, el material quedó
       * en el depósito destino.
       */
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
    const numero = String(numeroReferencia || "").trim();

    if (!numero) {
      setErrorMsg("Ingresá un número de transacción.");

      referenciaInputRef.current?.focus();
      return;
    }

    try {
      setBuscandoReferencia(true);
      setErrorMsg("");
      setOpcionesReferencia([]);
      setReferenciaSeleccionada("");

      const response = await api.get(
        `/movimientos/referencia/${encodeURIComponent(numero)}`,
      );

      const movimientos = Array.isArray(response.data) ? response.data : [];

      if (!movimientos.length) {
        setErrorMsg(
          `No se encontraron movimientos para la transacción ${numero}.`,
        );

        return;
      }

      /*
       * Un mismo número puede existir en diferentes módulos:
       * AJUSTE 15, TRANSFERENCIA 15, REMITO 15, etc.
       *
       * También una orden de producción puede tener un egreso
       * de materiales y un ingreso de producto terminado.
       *
       * Se agrupa por tipo, número, depósito efectivo y sentido.
       */
      const grupos = new Map();

      movimientos.forEach((movimiento) => {
        const tipo =
          normalizarTexto(movimiento.tipo_transaccion) || "MOVIMIENTO";

        const numeroTransaccion = String(
          movimiento.numero_transaccion ?? numero,
        ).trim();

        const deposito = obtenerDepositoReferencia(movimiento);

        const sentido = normalizarTexto(movimiento.ingreso_egreso) || "";

        const clave = [
          tipo,
          numeroTransaccion,
          normalizarTexto(deposito),
          sentido,
        ].join("|");

        if (!grupos.has(clave)) {
          grupos.set(clave, {
            id: clave,
            tipo,
            numeroTransaccion,
            deposito,
            sentido,
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

          remitoReferencia: primero.remito_referencia || "",

          referente: primero.referente || "",

          referenteId: primero.id_referente || "",

          motivo: primero.motivo || "",

          cantidadArticulos: grupo.movimientos.length,
        };
      });

      setOpcionesReferencia(opciones);

      if (opciones.length === 1) {
        setReferenciaSeleccionada(opciones[0].id);
      }
    } catch (error) {
      console.error("Error buscando referencia:", error);

      setErrorMsg(
        error.response?.data?.error ||
          error.response?.data?.detalle ||
          "No se pudo buscar la referencia.",
      );
    } finally {
      setBuscandoReferencia(false);
    }
  };

  const cargarReferenciaSeleccionada = async () => {
    const opcion = opcionesReferencia.find(
      (item) => item.id === referenciaSeleccionada,
    );

    if (!opcion) {
      setErrorMsg("Seleccioná una referencia para cargar.");

      return;
    }

    const depositoEncontrado = buscarDepositoPorNombre(opcion.deposito);

    if (!depositoEncontrado) {
      setErrorMsg(
        `El depósito "${opcion.deposito}" no existe en la lista de depósitos.`,
      );

      return;
    }

    const nuevoOrigenId = String(depositoEncontrado.id_deposito);

    try {
      setBuscandoReferencia(true);
      setErrorMsg("");

      cargandoReferenciaRef.current = true;

      /*
       * Consolida códigos repetidos dentro de la misma
       * transacción.
       */
      const articulosAgrupados = new Map();

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

      const articulos = Array.from(articulosAgrupados.values());

      if (!articulos.length) {
        setErrorMsg("La referencia no contiene artículos válidos.");

        return;
      }

      /*
       * Consulta el stock actual de todos los artículos
       * usando explícitamente el depósito de la referencia.
       */
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

      /*
       * Completa la cabecera de la transferencia.
       */
      setOrigenId(nuevoOrigenId);

      /*
       * El destino queda vacío para que el usuario
       * seleccione adónde transferir.
       */
      setDestinoId("");

      setReferenteId(opcion.referenteId ? String(opcion.referenteId) : "");

      setFechaReal(normalizarFecha(opcion.fechaReal));

      /*
       * Se conserva la referencia original.
       * Cuando no hay remito, se registra el origen
       * de la carga.
       */
      setRemitoReferencia(
        opcion.remitoReferencia
          ? String(opcion.remitoReferencia)
          : `${opcion.tipo} ${opcion.numeroTransaccion}`,
      );

      setItems(nuevosItems);

      setMostrarReferencia(false);
      setNumeroReferencia("");
      setOpcionesReferencia([]);
      setReferenciaSeleccionada("");

      setTimeout(() => {
        cargandoReferenciaRef.current = false;
      }, 200);
    } catch (error) {
      console.error("Error cargando referencia:", error);

      cargandoReferenciaRef.current = false;

      setErrorMsg(
        error.response?.data?.error ||
          error.response?.data?.detalle ||
          "No se pudo cargar la referencia.",
      );
    } finally {
      setBuscandoReferencia(false);
    }
  };

  // ======================================================
  // CONFIRMAR TRANSFERENCIA
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
          Cargar referencia
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
                <th
                  style={{
                    width: "170px",
                  }}
                >
                  Código
                </th>

                <th>Descripción</th>

                <th
                  style={{
                    width: "120px",
                    textAlign: "right",
                  }}
                >
                  Stock origen
                </th>

                <th
                  style={{
                    width: "120px",
                    textAlign: "right",
                  }}
                >
                  Stock total
                </th>

                <th
                  style={{
                    width: "190px",
                  }}
                >
                  Ubicación
                </th>

                <th
                  style={{
                    width: "140px",
                    textAlign: "right",
                  }}
                >
                  Cantidad
                </th>

                <th
                  style={{
                    width: "110px",
                  }}
                >
                  Acción
                </th>
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
                      style={{
                        width: "100%",
                      }}
                    />
                  </td>

                  <td>
                    <input
                      type="text"
                      value={item.descripcion}
                      readOnly
                      placeholder="Se completa automáticamente"
                      style={{
                        width: "100%",
                      }}
                    />
                  </td>

                  <td
                    style={{
                      textAlign: "right",
                    }}
                  >
                    {item.stock ?? ""}
                  </td>

                  <td
                    style={{
                      textAlign: "right",
                    }}
                  >
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
                      style={{
                        width: "100%",
                      }}
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

        <div
          className="nt-actions"
          style={{
            marginTop: 14,
          }}
        >
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
          className="modal"
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0, 0, 0, 0.45)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 9999,
            padding: 20,
          }}
        >
          <div
            className="modal-content modal-wide"
            style={{
              width: "min(850px, 96vw)",
              maxHeight: "90vh",
              overflowY: "auto",
              background: "#ffffff",
              borderRadius: 8,
              padding: 22,
              boxShadow: "0 10px 35px rgba(0,0,0,0.25)",
            }}
          >
            <h3>Cargar referencia desde Movimientos</h3>

            <p
              style={{
                marginTop: 0,
                opacity: 0.8,
              }}
            >
              Ingresá el número de transacción que aparece en el módulo
              Movimientos.
            </p>

            <div
              style={{
                display: "flex",
                gap: 10,
                alignItems: "flex-end",
                flexWrap: "wrap",
              }}
            >
              <label
                style={{
                  flex: "1 1 260px",
                }}
              >
                Número de transacción
                <input
                  ref={referenciaInputRef}
                  type="text"
                  value={numeroReferencia}
                  onChange={(event) => {
                    setNumeroReferencia(event.target.value);

                    setOpcionesReferencia([]);

                    setReferenciaSeleccionada("");
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      buscarReferencia();
                    }
                  }}
                  style={{
                    width: "100%",
                    marginTop: 5,
                  }}
                />
              </label>

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
              <div
                style={{
                  marginTop: 22,
                }}
              >
                <h4>Seleccioná el movimiento que querés cargar</h4>

                <div
                  style={{
                    display: "grid",
                    gap: 10,
                  }}
                >
                  {opcionesReferencia.map((opcion) => (
                    <label
                      key={opcion.id}
                      style={{
                        display: "flex",
                        gap: 12,
                        alignItems: "flex-start",
                        padding: 12,
                        border:
                          referenciaSeleccionada === opcion.id
                            ? "2px solid #356ae6"
                            : "1px solid #cccccc",
                        borderRadius: 6,
                        cursor: "pointer",
                      }}
                    >
                      <input
                        type="radio"
                        name="referencia-seleccionada"
                        checked={referenciaSeleccionada === opcion.id}
                        onChange={() => setReferenciaSeleccionada(opcion.id)}
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
                            — Movimiento:{" "}
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
                        {opcion.referente && (
                          <>
                            <br />
                            Actuante: {opcion.referente}
                          </>
                        )}
                        {opcion.remitoReferencia && (
                          <>
                            <br />
                            Referencia: {opcion.remitoReferencia}
                          </>
                        )}
                        {opcion.motivo && (
                          <>
                            <br />
                            Motivo: {opcion.motivo}
                          </>
                        )}
                      </span>
                    </label>
                  ))}
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
                onClick={cargarReferenciaSeleccionada}
                disabled={buscandoReferencia || !referenciaSeleccionada}
              >
                {buscandoReferencia ? "Cargando..." : "Cargar seleccionada"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
