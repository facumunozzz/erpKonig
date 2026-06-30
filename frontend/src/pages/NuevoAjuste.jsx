import React, { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import api from "../api/axiosConfig";
import "./../styles/transferencias.css";

const normalizarMotivo = (value) =>
  String(value ?? "")
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase();

const MOTIVOS_OCULTOS = new Set([
  "CONSUMO PRODUCCION (DROPBOX)",
  "IMPORTACION EXCEL",
]);

const esMotivoOculto = (nombre) =>
  MOTIVOS_OCULTOS.has(normalizarMotivo(nombre));

const crearItemVacio = () => ({
  codigo: "",
  descripcion: "",
  proveedor: "",
  stock: "",
  stockTotal: "",
  ubicacion: "",
  cantidad: "",
});

export default function NuevoAjuste() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const borradorIdUrl = searchParams.get("borradorId");
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

  const obraAlerta =
    searchParams.get("obra") || "";

  const versionAlerta =
    searchParams.get("version") || "";

  const fechaAlerta =
    searchParams.get("fecha") || "";

  const remitoAlerta =
    searchParams.get("remitoReferencia") || "";

  const [idBorrador, setIdBorrador] = useState(borradorIdUrl || null);

  const [guardandoBorrador, setGuardandoBorrador] = useState(false);

  const [ultimoGuardado, setUltimoGuardado] = useState(null);

  const [confirmando, setConfirmando] = useState(false);

  const cargandoBorradorRef = useRef(false);

  const [depositos, setDepositos] = useState([]);
  const [motivos, setMotivos] = useState([]);
  const [referentes, setReferentes] = useState([]);

  const [depositoId, setDepositoId] = useState("");
  const [motivoId, setMotivoId] = useState("");
  const [referenteId, setReferenteId] = useState("");

  const [remitoReferencia, setRemitoReferencia] = useState("");

  const [fechaReal, setFechaReal] = useState(() =>
    new Date().toISOString().slice(0, 10),
  );

  const [obra, setObra] = useState("");
  const [version, setVersion] = useState("");

  const [tipoAjuste, setTipoAjuste] = useState("INGRESO");

  const [items, setItems] = useState([crearItemVacio()]);

  const [errorMsg, setErrorMsg] = useState("");

  const [loadingReferentes, setLoadingReferentes] = useState(false);

  const codigoRefs = useRef([]);
  const cantidadRefs = useRef([]);

  const getPanolId = (lista) => {
    const panol = (lista || []).find(
      (deposito) =>
        String(deposito.nombre || "")
          .trim()
          .toUpperCase() === "PAÑOL",
    );

    return panol ? String(panol.id_deposito) : "";
  };

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
        const responseDepositios = await api.get("/depositos");

        const listaDepositos = Array.isArray(responseDepositios.data)
          ? responseDepositios.data
          : [];

        setDepositos(listaDepositos);

        const panolId = getPanolId(listaDepositos);

        if (panolId) {
          setDepositoId((valorActual) => valorActual || panolId);
        }
      } catch (error) {
        console.error("Error cargando depósitos:", error);

        setDepositos([]);

        setErrorMsg("No se pudieron cargar los depósitos.");
      }

      try {
        const responseMotivos = await api.get("/ajustes/motivos");

        const listaMotivos = Array.isArray(responseMotivos.data)
          ? responseMotivos.data
          : [];

        setMotivos(
          listaMotivos.filter(
            (motivo) => motivo.activo && !esMotivoOculto(motivo.nombre),
          ),
        );
      } catch (error) {
        console.error("Error cargando motivos:", error);

        setMotivos([]);

        setErrorMsg("No se pudieron cargar los motivos.");
      }

      await cargarReferentes();
    };

    cargarDatosIniciales();
  }, []);

  useEffect(() => {
    if (!desdeAlerta || borradorIdUrl) {
      return;
    }

    const cargarDesdeAlerta = async () => {
      const codigo = String(codigoAlerta || "")
        .trim()
        .toUpperCase();

      const cantidad = Math.abs(
        Number(cantidadAlerta || 0),
      );

      setTipoAjuste("INGRESO");

      setObra(obraAlerta);
      setVersion(versionAlerta);

      setRemitoReferencia(remitoAlerta);

      if (fechaAlerta) {
        setFechaReal(
          String(fechaAlerta).slice(0, 10),
        );
      }

      if (!codigo) {
        return;
      }

      setItems([
        {
          ...crearItemVacio(),
          codigo,
          descripcion: descripcionAlerta,
          cantidad:
            Number.isFinite(cantidad) &&
            cantidad > 0
              ? String(cantidad)
              : "",
        },
      ]);

      /*
      * Busca los datos reales del artículo.
      * Si el depósito todavía no terminó de cargar,
      * la consulta de stock se hará al seleccionarlo.
      */
      try {
        const response = await api.get(
          `/articulos/codigo/${encodeURIComponent(
            codigo,
          )}`,
        );

        const articulo = response.data || {};

        setItems([
          {
            ...crearItemVacio(),
            codigo:
              String(
                articulo.codigo || codigo,
              )
                .trim()
                .toUpperCase(),

            descripcion:
              articulo.descripcion ||
              descripcionAlerta ||
              "",

            proveedor:
              articulo.proveedor || "",

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

  /*
   * Cuando cambia el depósito se limpia el stock
   * correspondiente al depósito anterior.
   *
   * La ubicación no se borra porque el usuario puede
   * haberla editado manualmente.
   */
  useEffect(() => {
  if (cargandoBorradorRef.current) {
    return;
  }

  if (!depositoId) {
    setItems((itemsActuales) =>
      itemsActuales.map((item) => ({
        ...item,
        stock: "",
        stockTotal: "",
      })),
    );

    return;
  }

  const actualizarStocks = async () => {
    const itemsActuales = [...items];

    const nuevosItems = await Promise.all(
      itemsActuales.map(async (item) => {
        const codigo = String(item.codigo || "")
          .trim()
          .toUpperCase();

        if (!codigo) {
          return {
            ...item,
            stock: "",
            stockTotal: "",
          };
        }

        try {
          const response = await api.get(
            "/transferencias/stock-articulo",
            {
              params: {
                codigo,
                deposito_id: Number(depositoId),
              },
            },
          );

          return {
            ...item,
            codigo: response.data?.codigo || codigo,
            stock:
              response.data?.stock_deposito ??
              response.data?.stock ??
              0,
            stockTotal:
              response.data?.stock_total ?? 0,
            ubicacion:
              response.data?.ubicacion ??
              item.ubicacion ??
              "",
          };
        } catch (error) {
          console.error(
            `Error consultando stock de ${codigo}:`,
            error,
          );

          return {
            ...item,
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
}, [depositoId]);

  const consultarStock = async (codigo, index) => {
    const codigoNormalizado = String(codigo || "")
      .trim()
      .toUpperCase();

    if (!codigoNormalizado || !depositoId) {
      actualizarItem(index, {
        stock: "",
        stockTotal: "",
        ubicacion: "",
      });

      return false;
    }

    try {
      const response = await api.get("/transferencias/stock-articulo", {
        params: {
          codigo: codigoNormalizado,
          deposito_id: Number(depositoId),
        },
      });

      actualizarItem(index, {
        codigo: response.data?.codigo || codigoNormalizado,

        stock: response.data?.stock_deposito ?? response.data?.stock ?? 0,

        stockTotal: response.data?.stock_total ?? 0,

        ubicacion: response.data?.ubicacion ?? "",
      });

      return true;
    } catch (error) {
      console.error("Error consultando stock:", error);

      actualizarItem(index, {
        stock: "Error",
        stockTotal: "Error",
        ubicacion: "",
      });

      return false;
    }
  };

  const buscarArticulo = async (codigo, index) => {
    const codigoNormalizado = String(codigo || "")
      .trim()
      .toUpperCase();

    if (!codigoNormalizado) {
      actualizarItem(index, {
        codigo: "",
        descripcion: "",
        proveedor: "",
        stock: "",
        stockTotal: "",
        ubicacion: "",
      });

      return false;
    }

    try {
      const response = await api.get(
        `/articulos/codigo/${encodeURIComponent(codigoNormalizado)}`,
      );

      const articulo = response.data || {};

      const descripcion = String(articulo.descripcion || "").trim();

      const codigoArticulo = String(articulo.codigo || codigoNormalizado)
        .trim()
        .toUpperCase();

      if (!descripcion) {
        actualizarItem(index, {
          codigo: codigoArticulo,
          descripcion: "Artículo no encontrado",
          proveedor: "",
          stock: "",
          stockTotal: "",
          ubicacion: "",
        });

        return false;
      }

      actualizarItem(index, {
        codigo: codigoArticulo,
        descripcion,
        proveedor: articulo.proveedor || "",
      });

      await consultarStock(codigoArticulo, index);

      return true;
    } catch (error) {
      console.error("No se encontró el artículo:", error);

      actualizarItem(index, {
        codigo: codigoNormalizado,
        descripcion: "Artículo no encontrado",
        proveedor: "",
        stock: "",
        stockTotal: "",
        ubicacion: "",
      });

      return false;
    }
  };

  const asegurarFilaSiguiente = (index, columnaFoco = "codigo") => {
    setItems((itemsActuales) => {
      if (index !== itemsActuales.length - 1) {
        return itemsActuales;
      }

      return [...itemsActuales, crearItemVacio()];
    });

    setTimeout(() => {
      if (columnaFoco === "cantidad") {
        cantidadRefs.current[index + 1]?.focus();
      } else {
        codigoRefs.current[index + 1]?.focus();
      }
    }, 80);
  };

  const handleCodigoKeyDown = async (event, index) => {
    if (event.key !== "Enter") {
      return;
    }

    event.preventDefault();

    const codigo = String(items[index]?.codigo || "")
      .trim()
      .toUpperCase();

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

    asegurarFilaSiguiente(index, "codigo");
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

  const hayDatosParaBorrador = () => {
    if (motivoId) {
      return true;
    }

    if (referenteId) {
      return true;
    }

    if (remitoReferencia.trim()) {
      return true;
    }

    if (obra.trim()) {
      return true;
    }

    if (version.trim()) {
      return true;
    }

    return items.some(
      (item) =>
        String(item.codigo || "").trim() ||
        String(item.descripcion || "").trim() ||
        String(item.cantidad || "").trim(),
    );
  };

  const guardarBorrador = async ({ silencioso = true } = {}) => {
    if (cargandoBorradorRef.current) {
      return null;
    }

    if (!hayDatosParaBorrador()) {
      return null;
    }

    if (guardandoBorrador) {
      return idBorrador;
    }

    try {
      setGuardandoBorrador(true);

      const body = {
        id_borrador: idBorrador || null,

        deposito_id: depositoId || null,

        motivo_id: motivoId || null,

        tipo_ajuste: tipoAjuste,

        remito_referencia: remitoReferencia.trim() || null,

        id_referente: referenteId || null,

        fecha_real: fechaReal || null,

        obra: obra.trim() || null,

        version: version.trim() || null,

        items: items.map((item) => ({
          codigo: String(item.codigo || "")
            .trim()
            .toUpperCase(),

          descripcion: item.descripcion || "",

          proveedor: item.proveedor || "",

          stock: item.stock ?? "",

          stock_total: item.stockTotal ?? "",

          ubicacion: item.ubicacion || "",

          cantidad: item.cantidad ?? "",
        })),
      };

      const response = await api.post("/ajustes/borradores", body);

      const nuevoId = response.data?.id_borrador || idBorrador;

      if (nuevoId) {
        setIdBorrador(String(nuevoId));
      }

      setUltimoGuardado(new Date());

      if (!silencioso) {
        alert("Borrador guardado correctamente.");
      }

      return nuevoId;
    } catch (error) {
      console.error("Error guardando borrador:", error);

      if (!silencioso) {
        alert(
          error.response?.data?.error ||
            error.response?.data?.detalle ||
            "No se pudo guardar el borrador.",
        );
      }

      return null;
    } finally {
      setGuardandoBorrador(false);
    }
  };

  const cargarBorrador = async (id) => {
    try {
      cargandoBorradorRef.current = true;

      const response = await api.get(`/ajustes/borradores/${id}`);

      const cabecera = response.data?.cabecera || {};

      const detalle = Array.isArray(response.data?.detalle)
        ? response.data.detalle
        : [];

      setIdBorrador(String(id));

      setDepositoId(cabecera.deposito_id ? String(cabecera.deposito_id) : "");

      setMotivoId(cabecera.motivo_id ? String(cabecera.motivo_id) : "");

      setReferenteId(
        cabecera.id_referente ? String(cabecera.id_referente) : "",
      );

      setRemitoReferencia(cabecera.remito_referencia || "");

      setFechaReal(
        cabecera.fecha_real
          ? String(cabecera.fecha_real).slice(0, 10)
          : new Date().toISOString().slice(0, 10),
      );

      setObra(cabecera.obra == null ? "" : String(cabecera.obra));

      setVersion(cabecera.version == null ? "" : String(cabecera.version));

      setTipoAjuste(
        String(cabecera.tipo_ajuste || "INGRESO").toUpperCase() === "EGRESO"
          ? "EGRESO"
          : "INGRESO",
      );

      if (detalle.length) {
        setItems(
          detalle.map((item) => ({
            codigo: item.codigo || "",

            descripcion: item.descripcion || "",

            proveedor: item.proveedor || "",

            stock: item.stock ?? "",

            stockTotal: item.stock_total ?? "",

            ubicacion: item.ubicacion || "",

            cantidad: item.cantidad ?? "",
          })),
        );
      } else {
        setItems([crearItemVacio()]);
      }
    } catch (error) {
      console.error("Error cargando borrador:", error);

      alert(
        error.response?.data?.error ||
          error.response?.data?.detalle ||
          "No se pudo cargar el borrador.",
      );
    } finally {
      setTimeout(() => {
        cargandoBorradorRef.current = false;
      }, 300);
    }
  };

  useEffect(() => {
    if (borradorIdUrl) {
      cargarBorrador(borradorIdUrl);
    }

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [borradorIdUrl]);

  const confirmar = async () => {
    if (confirmando) {
      return;
    }

    try {
      setConfirmando(true);
      setErrorMsg("");

      const depositoNumero = Number(depositoId);

      const motivoNumero = Number(motivoId);

      if (!Number.isInteger(depositoNumero) || depositoNumero <= 0) {
        setErrorMsg("Seleccioná un depósito.");

        return;
      }

      if (!Number.isInteger(motivoNumero) || motivoNumero <= 0) {
        setErrorMsg("Seleccioná un motivo.");

        return;
      }

      const itemsConCodigo = items
        .map((item) => ({
          cod_articulo: String(item.codigo || "")
            .trim()
            .toUpperCase(),

          descripcion: String(item.descripcion || "").trim(),

          ubicacion: String(item.ubicacion || "").trim(),

          cantidad: Number(item.cantidad),
        }))
        .filter((item) => item.cod_articulo);

      if (!itemsConCodigo.length) {
        setErrorMsg("Cargá al menos un código.");

        return;
      }

      const noEncontrados = itemsConCodigo.filter(
        (item) =>
          !item.descripcion ||
          item.descripcion.toUpperCase().includes("NO ENCONTRADO"),
      );

      if (noEncontrados.length) {
        setErrorMsg("Hay códigos sin validar o no encontrados.");

        return;
      }

      const sinCantidad = itemsConCodigo.filter(
        (item) => !Number.isFinite(item.cantidad) || item.cantidad <= 0,
      );

      if (sinCantidad.length) {
        setErrorMsg("Todos los códigos deben tener una cantidad mayor a cero.");

        return;
      }

      const body = {
        deposito_id: depositoNumero,
        id_ubicacion: null,
        motivo_id: motivoNumero,
        obra: obra.trim() || null,
        version: version.trim() || null,
        remito_referencia: remitoReferencia.trim() || null,
        id_referente: referenteId ? Number(referenteId) : null,
        fecha_real: fechaReal || null,
        items: itemsConCodigo.map((item) => ({
          cod_articulo: item.cod_articulo,
          ubicacion: item.ubicacion,
          cantidad:
            tipoAjuste === "EGRESO"
              ? -Math.abs(Math.trunc(item.cantidad))
              : Math.abs(Math.trunc(item.cantidad)),
        })),
      };

      const response = await api.post("/ajustes", body);
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
            "El ajuste fue creado, pero no se pudo resolver la alerta:",
            errorAlerta,
          );

          window.alert(
            "El ajuste se creó correctamente, pero la revisión no pudo marcarse como resuelta.",
          );
        }
      }

      const numeroAjuste =
        response.data?.ajuste?.numero_ajuste ||
        response.data?.ajuste?.id ||
        response.data?.message ||
        "OK";

      alert(`Ajuste creado: ${numeroAjuste}`);

      if (idBorrador) {
        try {
          await api.delete(`/ajustes/borradores/${idBorrador}`);
        } catch (errorBorrador) {
          console.warn(
            "El ajuste se creó, pero no se pudo eliminar el borrador:",
            errorBorrador,
          );
        }
      }

      navigate("/ajustes");
    } catch (error) {
      console.error("Error creando ajuste:", error);

      const mensaje =
        error.response?.data?.error ||
        error.response?.data?.detalle ||
        error.message ||
        "Error al crear ajuste";

      if (
        error.response?.data?.detalle &&
        typeof error.response.data.detalle === "object"
      ) {
        setErrorMsg(
          `${mensaje}: ${JSON.stringify(error.response.data.detalle)}`,
        );
      } else {
        setErrorMsg(
          typeof mensaje === "string" ? mensaje : JSON.stringify(mensaje),
        );
      }
    } finally {
      setConfirmando(false);
    }
  };

  const volver = () => {
    navigate("/ajustes");
  };

  const motivoSeleccionado = motivos.find(
    (motivo) => String(motivo.id_motivo) === String(motivoId),
  );

  const tipoMovimientoFijo = String(
    motivoSeleccionado?.tipo_movimiento || "",
  ).toUpperCase();

  const hayItemsConDatos = items.some((item) =>
    String(item.codigo || "").trim(),
  );

  return (
    <div className="nueva-transferencia-page">
      <div className="nt-header">
        <h2 className="module-title">Nuevo Ajuste</h2>

        <button type="button" className="nt-volver" onClick={volver}>
          ← Volver
        </button>

        <button
          type="button"
          className="btn-light"
          onClick={() =>
            guardarBorrador({
              silencioso: false,
            })
          }
          disabled={guardandoBorrador || confirmando}
        >
          {guardandoBorrador ? "Guardando..." : "Guardar borrador"}
        </button>

        {ultimoGuardado && (
          <span
            style={{
              fontSize: 12,
              opacity: 0.7,
            }}
          >
            Guardado: {ultimoGuardado.toLocaleTimeString("es-AR")}
          </span>
        )}
      </div>

      {errorMsg && <div className="nt-error">{errorMsg}</div>}

      <div className="nt-card">
        <div className="nt-row">
          <div className="nt-field">
            <label htmlFor="ajuste-deposito">Depósito</label>

            <select
              id="ajuste-deposito"
              value={depositoId}
              onChange={(event) => setDepositoId(event.target.value)}
            >
              <option value="">-- Seleccioná depósito --</option>

              {depositos.map((deposito) => (
                <option key={deposito.id_deposito} value={deposito.id_deposito}>
                  {deposito.nombre}
                </option>
              ))}
            </select>
          </div>

          <div className="nt-field">
            <label htmlFor="ajuste-motivo">Motivo</label>

            <select
              id="ajuste-motivo"
              value={motivoId}
              onChange={(event) => {
                const nuevoMotivoId = event.target.value;

                setMotivoId(nuevoMotivoId);

                const motivo = motivos.find(
                  (item) => String(item.id_motivo) === String(nuevoMotivoId),
                );

                const tipo = String(
                  motivo?.tipo_movimiento || "",
                ).toUpperCase();

                if (tipo === "INGRESO" || tipo === "EGRESO") {
                  setTipoAjuste(tipo);
                }
              }}
            >
              <option value="">-- Seleccioná motivo --</option>

              {motivos.map((motivo) => (
                <option key={motivo.id_motivo} value={motivo.id_motivo}>
                  {motivo.nombre}
                  {motivo.tipo_movimiento
                    ? ` (${motivo.tipo_movimiento})`
                    : " (Ingreso / Egreso)"}
                </option>
              ))}
            </select>
          </div>

          <div className="nt-field">
            <label>Tipo de ajuste</label>

            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
              }}
            >
              <button
                type="button"
                className={`btn-light ${
                  tipoAjuste === "INGRESO" ? "activo" : ""
                }`}
                disabled={tipoMovimientoFijo === "EGRESO"}
                title={
                  tipoMovimientoFijo === "EGRESO"
                    ? "Este motivo está definido como egreso"
                    : ""
                }
                onClick={() => setTipoAjuste("INGRESO")}
              >
                INGRESO
              </button>

              <button
                type="button"
                className={`btn-light ${
                  tipoAjuste === "EGRESO" ? "activo" : ""
                }`}
                disabled={tipoMovimientoFijo === "INGRESO"}
                title={
                  tipoMovimientoFijo === "INGRESO"
                    ? "Este motivo está definido como ingreso"
                    : ""
                }
                onClick={() => setTipoAjuste("EGRESO")}
              >
                EGRESO
              </button>
            </div>
          </div>

          <div className="nt-field">
            <label htmlFor="ajuste-remito">Remito / Referencia</label>

            <input
              id="ajuste-remito"
              type="text"
              value={remitoReferencia}
              onChange={(event) => setRemitoReferencia(event.target.value)}
              placeholder="Remito, comprobante o referencia..."
            />
          </div>

          <div className="nt-field">
            <label htmlFor="ajuste-referente">Actuante</label>

            <select
              id="ajuste-referente"
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
            <label htmlFor="ajuste-fecha">Fecha real</label>

            <input
              id="ajuste-fecha"
              type="date"
              value={fechaReal}
              onChange={(event) => setFechaReal(event.target.value)}
            />
          </div>

          <div className="nt-field obra-version-field">
            <div className="mini-field">
              <label>Obra</label>

              <input
                type="text"
                value={obra}
                onChange={(e) => setObra(e.target.value)}
                placeholder="Número o nombre de obra"
                maxLength={100}
              />
            </div>

            <div className="mini-field">
              <label>Versión</label>

              <input
                type="text"
                value={version}
                onChange={(e) => setVersion(e.target.value)}
                placeholder="Versión"
                maxLength={100}
              />
            </div>
          </div>
        </div>
      </div>

      <div className="nt-card">
        <h4>
          Ítems del ajuste -{" "}
          {tipoAjuste === "EGRESO" ? "Egreso de stock" : "Ingreso de stock"}
        </h4>

        <div className="tabla-articulos-container">
          <table className="tabla-articulos">
            <thead>
              <tr>
                <th
                  style={{
                    width: "150px",
                  }}
                >
                  Código
                </th>

                <th>Descripción</th>

                <th
                  style={{
                    width: "170px",
                  }}
                >
                  Proveedor
                </th>

                <th
                  style={{
                    width: "120px",
                    textAlign: "right",
                  }}
                >
                  Stock depósito
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
                  Cantidad{" "}
                  {tipoAjuste === "EGRESO" ? "a egresar" : "a ingresar"}
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

                          proveedor: "",

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

                  <td>
                    <input
                      type="text"
                      value={item.proveedor || ""}
                      readOnly
                      placeholder="Proveedor"
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
              confirmando || !depositoId || !motivoId || !hayItemsConDatos
            }
          >
            {confirmando
              ? "Confirmando..."
              : `Confirmar ${tipoAjuste === "EGRESO" ? "egreso" : "ingreso"}`}
          </button>
        </div>
      </div>
    </div>
  );
}
