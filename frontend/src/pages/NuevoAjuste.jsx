import React, { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../api/axiosConfig";
import "./../styles/transferencias.css";

const normalizarMotivo = (v) =>
  String(v ?? "")
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

export default function NuevoAjuste() {
  const navigate = useNavigate();

  const [depositos, setDepositos] = useState([]);
  const [motivos, setMotivos] = useState([]);
  const [referentes, setReferentes] = useState([]);

  const [depositoId, setDepositoId] = useState("");
  const [motivoId, setMotivoId] = useState("");
  const [referenteId, setReferenteId] = useState("");

  const [remitoReferencia, setRemitoReferencia] = useState("");
  const [fechaReal, setFechaReal] = useState(() => {
    return new Date().toISOString().slice(0, 10);
  });

  const [obra, setObra] = useState("");
  const [version, setVersion] = useState("");

  const [tipoAjuste, setTipoAjuste] = useState("INGRESO");

  const [items, setItems] = useState([
    {
      codigo: "",
      descripcion: "",
      proveedor: "",
      stock: "",
      cantidad: "",
    },
  ]);

  const [errorMsg, setErrorMsg] = useState("");
  const [loadingReferentes, setLoadingReferentes] = useState(false);

  const codigoRefs = useRef([]);
  const cantidadRefs = useRef([]);

  const getPanolId = (lista) => {
    const panol = (lista || []).find(
      (d) => String(d.nombre || "").trim().toUpperCase() === "PAÑOL"
    );

    return panol ? String(panol.id_deposito) : "";
  };

  useEffect(() => {
    api
      .get("/depositos")
      .then((res) => {
        const lista = res.data || [];
        setDepositos(lista);

        const panolId = getPanolId(lista);
        if (panolId) {
          setDepositoId((prev) => prev || panolId);
        }
      })
      .catch((err) => {
        console.error(err);
        setErrorMsg("No se pudieron cargar los depósitos.");
      });

    api
      .get("/ajustes/motivos")
      .then((res) =>
        setMotivos(
          (res.data || []).filter(
            (m) => m.activo && !esMotivoOculto(m.nombre)
          )
        )
      )
      .catch((err) => {
        console.error(err);
        setErrorMsg("No se pudieron cargar los motivos.");
      });

    cargarReferentes();
  }, []);

  const cargarReferentes = async () => {
    try {
      setLoadingReferentes(true);

      const res = await api.get("/referentes");
      const list = res.data || [];

      setReferentes(list.filter((r) => r.activo));
    } catch (err) {
      console.error("Error cargando referentes:", err);
      setErrorMsg("No se pudieron cargar los referentes.");
    } finally {
      setLoadingReferentes(false);
    }
  };

  useEffect(() => {
    setItems((prev) =>
      prev.map((it) => ({
        ...it,
        stock: "",
      }))
    );
  }, [depositoId]);

  const actualizarItem = (index, cambios) => {
    setItems((prev) =>
      prev.map((it, i) => (i === index ? { ...it, ...cambios } : it))
    );
  };

  const consultarStock = async (codigo, index) => {
    const c = String(codigo || "")
      .trim()
      .toUpperCase();

    if (!c || !depositoId) {
      actualizarItem(index, { stock: "" });
      return;
    }

    try {
      const res = await api.get("/transferencias/stock-articulo", {
        params: {
          codigo: c,
          deposito_id: depositoId,
        },
      });

      actualizarItem(index, {
        stock: res.data?.stock ?? 0,
      });
    } catch (err) {
      console.error("Error consultando stock:", err);
      actualizarItem(index, { stock: "Error" });
    }
  };

  const buscarArticulo = async (codigo, index) => {
    const c = String(codigo || "")
      .trim()
      .toUpperCase();

    if (!c) {
      actualizarItem(index, {
        descripcion: "",
        proveedor: "",
        stock: "",
      });
      return false;
    }

    try {
      const res = await api.get(`/articulos/codigo/${encodeURIComponent(c)}`);

      const descripcion = res.data?.descripcion || "";

      if (!descripcion) {
        actualizarItem(index, {
          codigo: c,
          descripcion: "Artículo no encontrado",
          proveedor: "",
          stock: "",
        });

        return false;
      }

      actualizarItem(index, {
        codigo: res.data?.codigo || c,
        descripcion,
        proveedor: res.data?.proveedor || "",
      });

      await consultarStock(c, index);

      return true;
    } catch (err) {
      console.error("No se encontró artículo:", err);

      actualizarItem(index, {
        codigo: c,
        descripcion: "Artículo no encontrado",
        proveedor: "",
        stock: "",
      });

      return false;
    }
  };

  const asegurarFilaSiguiente = (index, focusCol = "codigo") => {
    setItems((prev) => {
      const nuevo = [...prev];

      if (index === nuevo.length - 1) {
        nuevo.push({
          codigo: "",
          descripcion: "",
          proveedor: "",
          stock: "",
          cantidad: "",
        });
      }

      return nuevo;
    });

    setTimeout(() => {
      if (focusCol === "cantidad") {
        cantidadRefs.current[index + 1]?.focus();
      } else {
        codigoRefs.current[index + 1]?.focus();
      }
    }, 80);
  };

  const handleCodigoKeyDown = async (e, index) => {
    if (e.key !== "Enter") return;

    e.preventDefault();

    const c = String(items[index]?.codigo || "")
      .trim()
      .toUpperCase();

    if (!c) return;

    await buscarArticulo(c, index);
    asegurarFilaSiguiente(index, "codigo");
  };

  const handleCantidadKeyDown = (e, index) => {
    if (e.key !== "Enter") return;

    e.preventDefault();
    asegurarFilaSiguiente(index, "cantidad");
  };

  const quitarItem = (idx) => {
    setItems((prev) => {
      const nuevo = prev.filter((_, i) => i !== idx);

      return nuevo.length
        ? nuevo
        : [
            {
              codigo: "",
              descripcion: "",
              proveedor: "",
              stock: "",
              cantidad: "",
            },
          ];
    });
  };

  const agregarFila = () => {
    setItems((prev) => [
      ...prev,
      {
        codigo: "",
        descripcion: "",
        proveedor: "",
        stock: "",
        cantidad: "",
      },
    ]);

    setTimeout(() => {
      codigoRefs.current[items.length]?.focus();
    }, 80);
  };

  const confirmar = async () => {
    try {
      setErrorMsg("");

      if (!depositoId) return setErrorMsg("Seleccioná un depósito.");
      if (!motivoId) return setErrorMsg("Seleccioná un motivo.");

      const itemsValidos = items
        .map((it) => ({
          cod_articulo: String(it.codigo || "")
            .trim()
            .toUpperCase(),
          descripcion: String(it.descripcion || "").trim(),
          cantidad: Number(it.cantidad),
        }))
        .filter((it) => it.cod_articulo);

      if (!itemsValidos.length) {
        return setErrorMsg("Cargá al menos un código.");
      }

      const noEncontrados = itemsValidos.filter(
        (it) =>
          !it.descripcion ||
          it.descripcion.toUpperCase().includes("NO ENCONTRADO")
      );

      if (noEncontrados.length) {
        return setErrorMsg("Hay códigos sin validar o no encontrados.");
      }

      const sinCantidad = itemsValidos.filter(
        (it) => !it.cantidad || it.cantidad <= 0
      );

      if (sinCantidad.length) {
        return setErrorMsg("Todos los códigos deben tener cantidad mayor a 0.");
      }

      const body = {
        deposito_id: Number(depositoId),
        id_ubicacion: null,
        motivo_id: Number(motivoId),
        obra: obra === "" ? null : Number(obra),
        version: version === "" ? null : Number(version),

        remito_referencia: remitoReferencia.trim() || null,
        id_referente: referenteId ? Number(referenteId) : null,
        fecha_real: fechaReal || null,

        items: itemsValidos.map((it) => ({
          cod_articulo: it.cod_articulo,
          cantidad:
            tipoAjuste === "EGRESO"
              ? Math.abs(it.cantidad) * -1
              : Math.abs(it.cantidad),
        })),
      };

      const res = await api.post("/ajustes", body);

      alert(
        "Ajuste creado: " +
          (res.data?.ajuste?.numero_ajuste ||
            res.data?.ajuste?.id ||
            res.data?.message ||
            "OK")
      );

      navigate("/ajustes");
    } catch (err) {
      const msg =
        err.response?.data?.error ||
        err.response?.data?.detalle ||
        err.message ||
        "Error al crear ajuste";

      setErrorMsg(typeof msg === "string" ? msg : JSON.stringify(msg));
    }
  };

  const hayItemsConDatos = items.some((it) => String(it.codigo || "").trim());


  return (
    <div className="nueva-transferencia-page">
      <div className="nt-header">
        <h2 className="module-title">Nuevo Ajuste</h2>

        <button className="nt-volver" onClick={() => navigate("/ajustes")}>
          ← Volver
        </button>
      </div>

      {errorMsg && <div className="nt-error">{errorMsg}</div>}

      <div className="nt-card">
        <div className="nt-row">
          <div className="nt-field">
            <label>Depósito</label>

            <select
              value={depositoId}
              onChange={(e) => setDepositoId(e.target.value)}
            >
              <option value="">-- Seleccioná depósito --</option>

              {depositos.map((d) => (
                <option key={d.id_deposito} value={d.id_deposito}>
                  {d.nombre}
                </option>
              ))}
            </select>
          </div>


          <div className="nt-field">
            <label>Motivo</label>

            <select
              value={motivoId}
              onChange={(e) => setMotivoId(e.target.value)}
            >
              <option value="">-- Seleccioná motivo --</option>

              {motivos.map((m) => (
                <option key={m.id_motivo} value={m.id_motivo}>
                  {m.nombre}
                </option>
              ))}
            </select>
          </div>

          <div className="nt-field">
            <label>Tipo de ajuste</label>

            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <button
                type="button"
                className={`btn-light ${
                  tipoAjuste === "INGRESO" ? "activo" : ""
                }`}
                onClick={() => setTipoAjuste("INGRESO")}
              >
                INGRESO
              </button>

              <button
                type="button"
                className={`btn-light ${
                  tipoAjuste === "EGRESO" ? "activo" : ""
                }`}
                onClick={() => setTipoAjuste("EGRESO")}
              >
                EGRESO
              </button>
            </div>
          </div>

          <div className="nt-field">
            <label>Remito / Referencia</label>

            <input
              type="text"
              value={remitoReferencia}
              onChange={(e) => setRemitoReferencia(e.target.value)}
              placeholder="Remito, comprobante o referencia..."
            />
          </div>

          <div className="nt-field">
            <label>Actuante</label>

            <select
              value={referenteId}
              onChange={(e) => setReferenteId(e.target.value)}
              disabled={loadingReferentes}
            >
              <option value="">
                {loadingReferentes
                  ? "Cargando referentes..."
                  : "-- Seleccioná referente --"}
              </option>

              {referentes.map((r) => (
                <option key={r.id_referente} value={r.id_referente}>
                  {r.nombre}
                </option>
              ))}
            </select>
          </div>

          <div className="nt-field small">
            <label>Fecha real</label>

            <input
              type="date"
              value={fechaReal}
              onChange={(e) => setFechaReal(e.target.value)}
            />
          </div>

          <div className="nt-field obra-version-field">
            <div className="mini-field">
              <label>Obra</label>

              <input
                type="number"
                value={obra}
                onChange={(e) =>
                  setObra(e.target.value.replace(/[^0-9]/g, ""))
                }
              />
            </div>

            <div className="mini-field">
              <label>Versión</label>

              <input
                type="number"
                value={version}
                onChange={(e) =>
                  setVersion(e.target.value.replace(/[^0-9]/g, ""))
                }
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
                <th style={{ width: "160px" }}>Código</th>
                <th>Descripción</th>
                <th style={{ width: "180px" }}>Proveedor</th>
                <th style={{ width: "120px", textAlign: "right" }}>Stock</th>
                <th style={{ width: "140px", textAlign: "right" }}>
                  Cantidad{" "}
                  {tipoAjuste === "EGRESO" ? "a egresar" : "a ingresar"}
                </th>
                <th style={{ width: "110px" }}>Acción</th>
              </tr>
            </thead>

            <tbody>
              {items.map((it, idx) => (
                <tr key={idx}>
                  <td>
                    <input
                      ref={(el) => (codigoRefs.current[idx] = el)}
                      type="text"
                      value={it.codigo}
                      placeholder="Código..."
                      onChange={(e) =>
                        actualizarItem(idx, {
                          codigo: e.target.value.toUpperCase(),
                          descripcion: "",
                          proveedor: "",
                          stock: "",
                        })
                      }
                      onBlur={() => buscarArticulo(it.codigo, idx)}
                      onKeyDown={(e) => handleCodigoKeyDown(e, idx)}
                      style={{ width: "100%" }}
                    />
                  </td>

                  <td>
                    <input
                      type="text"
                      value={it.descripcion}
                      readOnly
                      placeholder="Se completa automáticamente"
                      style={{ width: "100%" }}
                    />
                  </td>

                  <td>
                    <input
                      type="text"
                      value={it.proveedor || ""}
                      readOnly
                      placeholder="Proveedor"
                      style={{ width: "100%" }}
                    />
                  </td>

                  <td style={{ textAlign: "right" }}>{it.stock ?? ""}</td>

                  <td>
                    <input
                      ref={(el) => (cantidadRefs.current[idx] = el)}
                      type="number"
                      min="1"
                      step="1"
                      value={it.cantidad}
                      onChange={(e) =>
                        actualizarItem(idx, {
                          cantidad: e.target.value.replace(/[^0-9]/g, ""),
                        })
                      }
                      onKeyDown={(e) => handleCantidadKeyDown(e, idx)}
                      style={{ width: "100%", textAlign: "right" }}
                    />
                  </td>

                  <td>
                    <button
                      className="borrar-btn"
                      onClick={() => quitarItem(idx)}
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
          <button className="btn-light" onClick={agregarFila}>
            Agregar fila
          </button>

          <button
            className="btn-primary"
            onClick={confirmar}
            disabled={!depositoId || !motivoId || !hayItemsConDatos}
          >
            Confirmar {tipoAjuste === "EGRESO" ? "egreso" : "ingreso"}
          </button>
        </div>
      </div>
    </div>
  );
}