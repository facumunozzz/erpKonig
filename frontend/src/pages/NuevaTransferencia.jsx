import React, { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../api/axiosConfig";
import "./../styles/transferencias.css";

export default function NuevaTransferencia() {
  const navigate = useNavigate();

  const [depositos, setDepositos] = useState([]);
  const [referentes, setReferentes] = useState([]);

  const [origenId, setOrigenId] = useState("");
  const [destinoId, setDestinoId] = useState("");

  const [remitoReferencia, setRemitoReferencia] = useState("");
  const [referenteId, setReferenteId] = useState("");
  const [fechaReal, setFechaReal] = useState(() => {
    return new Date().toISOString().slice(0, 10);
  });

  const [items, setItems] = useState([
    { codigo: "", descripcion: "", stock: "", cantidad: "" },
  ]);

  const [errorMsg, setErrorMsg] = useState("");
  const [errorDepositos, setErrorDepositos] = useState("");
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
        setErrorDepositos("");

        const panolId = getPanolId(lista);
        if (panolId) {
          setOrigenId((prev) => prev || panolId);
        }
      })
      .catch((err) => {
        console.error(err);
        setErrorDepositos("No se pudo cargar la lista de depósitos.");
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

  const actualizarItem = (index, cambios) => {
    setItems((prev) =>
      prev.map((it, i) => (i === index ? { ...it, ...cambios } : it))
    );
  };

  const consultarStock = async (codigo, index) => {
    const c = String(codigo || "").trim().toUpperCase();

    if (!c || !origenId) {
      actualizarItem(index, { stock: "" });
      return;
    }

    try {
      const res = await api.get("/transferencias/stock-articulo", {
        params: {
          codigo: c,
          deposito_id: origenId,
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
    const c = String(codigo || "").trim().toUpperCase();

    if (!c) {
      actualizarItem(index, {
        descripcion: "",
        stock: "",
      });

      return false;
    }

    try {
      let res;

      try {
        res = await api.get(`/articulos/codigo/${encodeURIComponent(c)}`);
      } catch {
        res = await api.get(
          `/transferencias/articulo?codigo=${encodeURIComponent(c)}`
        );
      }

      const art = res.data || {};

      actualizarItem(index, {
        codigo: art.codigo || c,
        descripcion: art.descripcion || "",
      });

      await consultarStock(c, index);

      return true;
    } catch (err) {
      console.error("No se encontró artículo:", err);

      actualizarItem(index, {
        codigo: c,
        descripcion: "Artículo no encontrado",
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

    const c = String(items[index]?.codigo || "").trim().toUpperCase();

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
        : [{ codigo: "", descripcion: "", stock: "", cantidad: "" }];
    });
  };

  const agregarFila = () => {
    setItems((prev) => [
      ...prev,
      { codigo: "", descripcion: "", stock: "", cantidad: "" },
    ]);

    setTimeout(() => {
      codigoRefs.current[items.length]?.focus();
    }, 80);
  };

  const confirmar = async () => {
    try {
      setErrorMsg("");

      const oId = Number(origenId);
      const dId = Number(destinoId);

      if (!oId || !dId) {
        return setErrorMsg("Seleccioná ORIGEN y DESTINO.");
      }

      if (oId === dId) {
        return setErrorMsg("El depósito origen y destino deben ser distintos.");
      }

      const itemsValidos = items
        .map((it) => ({
          codigo: String(it.codigo || "").trim().toUpperCase(),
          descripcion: String(it.descripcion || "").trim(),
          cantidad: Number(it.cantidad),
        }))
        .filter((it) => it.codigo);

      if (!itemsValidos.length) {
        return setErrorMsg("Cargá al menos un código.");
      }

      const noEncontrados = itemsValidos.filter(
        (it) =>
          !it.descripcion ||
          it.descripcion.toUpperCase().includes("NO ENCONTRADO")
      );

      if (noEncontrados.length) {
        return setErrorMsg(
          "Hay códigos sin validar o no encontrados. Revisá la tabla antes de confirmar."
        );
      }

      const sinCantidad = itemsValidos.filter(
        (it) => !it.cantidad || it.cantidad <= 0
      );

      if (sinCantidad.length) {
        return setErrorMsg(
          "Todos los códigos cargados deben tener cantidad mayor a 0."
        );
      }

      const body = {
        origen_id: oId,
        destino_id: dId,
        remito_referencia: remitoReferencia.trim() || null,
        id_referente: referenteId ? Number(referenteId) : null,
        fecha_real: fechaReal || null,

        items: itemsValidos.map((it) => ({
          codigo: it.codigo,
          cantidad: it.cantidad,
        })),
      };

      const res = await api.post("/transferencias", body);

      alert(
        "Transferencia creada: " +
          (res.data?.cabecera?.numero_transferencia ||
            res.data?.transferencia?.numero_transferencia ||
            res.data?.message ||
            "OK")
      );

      navigate("/transferencias");
    } catch (err) {
      const msg =
        err.response?.data?.error ||
        err.response?.data?.detalle ||
        err.message ||
        "Error al confirmar la transferencia";

      setErrorMsg(typeof msg === "string" ? msg : JSON.stringify(msg));
    }
  };

  const sameDeposito =
    Number(origenId) &&
    Number(destinoId) &&
    Number(origenId) === Number(destinoId);

  const hayItemsConDatos = items.some((it) =>
    String(it.codigo || "").trim()
  );

  return (
    <div className="nueva-transferencia-page">
      <div className="nt-header">
        <h2 className="module-title">Nueva Transferencia</h2>

        <button
          className="nt-volver"
          onClick={() => navigate("/transferencias")}
        >
          ← Volver
        </button>
      </div>

      {errorDepositos && <div className="nt-error">{errorDepositos}</div>}
      {errorMsg && <div className="nt-error">{errorMsg}</div>}
      {sameDeposito && (
        <div className="nt-error">
          El depósito origen y destino deben ser distintos.
        </div>
      )}

      <div className="nt-card">
        <div className="nt-row">
          <div className="nt-field">
            <label>Origen</label>

            <select
              value={origenId}
              onChange={(e) => setOrigenId(e.target.value)}
            >
              <option value="">-- Seleccioná depósito origen --</option>

              {depositos.map((d) => (
                <option key={d.id_deposito} value={d.id_deposito}>
                  {d.nombre}
                </option>
              ))}
            </select>
          </div>

          <div className="nt-field">
            <label>Destino</label>

            <select
              value={destinoId}
              onChange={(e) => setDestinoId(e.target.value)}
            >
              <option value="">-- Seleccioná depósito destino --</option>

              {depositos.map((d) => (
                <option key={d.id_deposito} value={d.id_deposito}>
                  {d.nombre}
                </option>
              ))}
            </select>
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

        </div>

      </div>

      <div className="nt-card">
        <h4>Ítems a transferir</h4>

        <div className="tabla-articulos-container">
          <table className="tabla-articulos">
            <thead>
              <tr>
                <th style={{ width: "180px" }}>Código</th>
                <th>Descripción</th>
                <th style={{ width: "120px", textAlign: "right" }}>
                  Stock origen
                </th>
                <th style={{ width: "140px", textAlign: "right" }}>
                  Cantidad
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
            disabled={!origenId || !destinoId || !hayItemsConDatos || sameDeposito}
          >
            Confirmar transferencia
          </button>
        </div>
      </div>
    </div>
  );
}