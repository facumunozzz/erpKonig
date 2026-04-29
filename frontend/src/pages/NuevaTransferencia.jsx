import React, { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../api/axiosConfig";
import "./../styles/transferencias.css";

export default function NuevaTransferencia() {
  const navigate = useNavigate();

  const [depositos, setDepositos] = useState([]);
  const [origenId, setOrigenId] = useState("");
  const [destinoId, setDestinoId] = useState("");
  const [usarUbicaciones, setUsarUbicaciones] = useState(false);

  const [ubicacionesOrigen, setUbicacionesOrigen] = useState([]);
  const [ubicacionesDestino, setUbicacionesDestino] = useState([]);
  const [ubicacionOrigenId, setUbicacionOrigenId] = useState("");
  const [ubicacionDestinoId, setUbicacionDestinoId] = useState("");

  const [items, setItems] = useState([
    { codigo: "", descripcion: "", cantidad: "" }
  ]);

  const [errorMsg, setErrorMsg] = useState("");
  const [errorDepositos, setErrorDepositos] = useState("");
  const [loadingUbicOrigen, setLoadingUbicOrigen] = useState(false);
  const [loadingUbicDestino, setLoadingUbicDestino] = useState(false);

  const codigoRefs = useRef([]);
  const cantidadRefs = useRef([]);

  const bloqueadoCabecera = items.some(
    it => String(it.codigo || "").trim() !== "" || String(it.cantidad || "").trim() !== ""
  );

  useEffect(() => {
    api.get("/depositos")
      .then(res => {
        setDepositos(res.data || []);
        setErrorDepositos("");
      })
      .catch(err => {
        console.error(err);
        setErrorDepositos("No se pudo cargar la lista de depósitos.");
      });
  }, []);

  const actualizarItem = (index, cambios) => {
    setItems(prev =>
      prev.map((it, i) => i === index ? { ...it, ...cambios } : it)
    );
  };

  const buscarArticulo = async (codigo, index) => {
    const c = String(codigo || "").trim().toUpperCase();

    if (!c) {
      actualizarItem(index, { descripcion: "" });
      return false;
    }

    try {
      let res;

      try {
        res = await api.get(`/articulos/codigo/${encodeURIComponent(c)}`);
      } catch {
        res = await api.get(`/transferencias/articulo?codigo=${encodeURIComponent(c)}`);
      }

      const art = res.data || {};

      actualizarItem(index, {
        codigo: art.codigo || c,
        descripcion: art.descripcion || ""
      });

      return true;
    } catch (err) {
      console.error("No se encontró artículo:", err);

      actualizarItem(index, {
        codigo: c,
        descripcion: "Artículo no encontrado"
      });

      return false;
    }
  };

  const cargarUbicaciones = async (depositoId, setterList, setterSelected, setLoading) => {
    const dep = Number(depositoId);

    setterList([]);
    setterSelected("");

    if (!depositoId || !Number.isFinite(dep)) return;

    try {
      setLoading(true);

      const res = await api.get(`/transferencias/ubicaciones/${dep}`);
      const list = res.data || [];

      setterList(list);

      const general = list.find(
        u => String(u.nombre || "").trim().toUpperCase() === "GENERAL"
      );

      if (general) setterSelected(String(general.id_ubicacion));
    } catch (err) {
      console.error(err);
      setErrorMsg("No se pudieron cargar ubicaciones.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!usarUbicaciones) {
      setUbicacionesOrigen([]);
      setUbicacionesDestino([]);
      setUbicacionOrigenId("");
      setUbicacionDestinoId("");
      return;
    }

    if (origenId) {
      cargarUbicaciones(
        origenId,
        setUbicacionesOrigen,
        setUbicacionOrigenId,
        setLoadingUbicOrigen
      );
    }

    if (destinoId) {
      cargarUbicaciones(
        destinoId,
        setUbicacionesDestino,
        setUbicacionDestinoId,
        setLoadingUbicDestino
      );
    }
  }, [usarUbicaciones, origenId, destinoId]);

  const origenNombre = useMemo(() => {
    const d = depositos.find(x => String(x.id_deposito) === String(origenId));
    return d?.nombre || "";
  }, [depositos, origenId]);

  const destinoNombre = useMemo(() => {
    const d = depositos.find(x => String(x.id_deposito) === String(destinoId));
    return d?.nombre || "";
  }, [depositos, destinoId]);

  const asegurarFilaSiguiente = (index, focusCol = "codigo") => {
    setItems(prev => {
      const nuevo = [...prev];

      if (index === nuevo.length - 1) {
        nuevo.push({ codigo: "", descripcion: "", cantidad: "" });
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
    setItems(prev => {
      const nuevo = prev.filter((_, i) => i !== idx);
      return nuevo.length ? nuevo : [{ codigo: "", descripcion: "", cantidad: "" }];
    });
  };

  const agregarFila = () => {
    setItems(prev => [
      ...prev,
      { codigo: "", descripcion: "", cantidad: "" }
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

      const uO = usarUbicaciones ? Number(ubicacionOrigenId) : null;
      const uD = usarUbicaciones ? Number(ubicacionDestinoId) : null;

      if (oId === dId) {
        if (!usarUbicaciones) {
          return setErrorMsg(
            "Si Origen y Destino son el mismo depósito, activá transferencia entre ubicaciones."
          );
        }

        if (!uO || !uD) {
          return setErrorMsg("Seleccioná ubicación origen y destino.");
        }

        if (uO === uD) {
          return setErrorMsg("Las ubicaciones deben ser distintas.");
        }
      }

      if (usarUbicaciones && (!uO || !uD)) {
        return setErrorMsg("Seleccioná ubicación origen y destino.");
      }

      const itemsValidos = items
        .map(it => ({
          codigo: String(it.codigo || "").trim().toUpperCase(),
          descripcion: String(it.descripcion || "").trim(),
          cantidad: Number(it.cantidad)
        }))
        .filter(it => it.codigo);

      if (!itemsValidos.length) {
        return setErrorMsg("Cargá al menos un código.");
      }

      const noEncontrados = itemsValidos.filter(it =>
        !it.descripcion ||
        it.descripcion.toUpperCase().includes("NO ENCONTRADO")
      );

      if (noEncontrados.length) {
        return setErrorMsg("Hay códigos sin validar o no encontrados. Revisá la tabla antes de confirmar.");
      }

      const sinCantidad = itemsValidos.filter(it => !it.cantidad || it.cantidad <= 0);

      if (sinCantidad.length) {
        return setErrorMsg("Todos los códigos cargados deben tener cantidad mayor a 0.");
      }

      const body = {
        origen_id: oId,
        destino_id: dId,
        ...(usarUbicaciones
          ? {
              id_ubicacion_origen: uO,
              id_ubicacion_destino: uD
            }
          : {}),
        items: itemsValidos.map(it => ({
          codigo: it.codigo,
          cantidad: it.cantidad
        }))
      };

      const res = await api.post("/transferencias", body);

      alert(
        "Transferencia creada: " +
          (
            res.data?.cabecera?.numero_transferencia ||
            res.data?.transferencia?.numero_transferencia ||
            res.data?.message ||
            "OK"
          )
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

  const sameUbicWhenSameDeposito =
    sameDeposito &&
    (
      !usarUbicaciones ||
      !ubicacionOrigenId ||
      !ubicacionDestinoId ||
      Number(ubicacionOrigenId) === Number(ubicacionDestinoId)
    );

  const hayItemsConDatos = items.some(it => String(it.codigo || "").trim());

  return (
    <div className="nueva-transferencia-page">
      <div className="nt-header">
        <h2 className="module-title">Nueva Transferencia</h2>

        <button className="nt-volver" onClick={() => navigate("/transferencias")}>
          ← Volver
        </button>
      </div>

      {errorDepositos && <div className="nt-error">{errorDepositos}</div>}
      {errorMsg && <div className="nt-error">{errorMsg}</div>}

      <div className="nt-card">
        <div className="nt-row">
          <div className="nt-field">
            <label>Origen</label>

            <select
              value={origenId}
              onChange={e => setOrigenId(e.target.value)}
              disabled={bloqueadoCabecera}
            >
              <option value="">-- Seleccioná depósito origen --</option>

              {depositos.map(d => (
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
              onChange={e => setDestinoId(e.target.value)}
              disabled={bloqueadoCabecera}
            >
              <option value="">-- Seleccioná depósito destino --</option>

              {depositos.map(d => (
                <option key={d.id_deposito} value={d.id_deposito}>
                  {d.nombre}
                </option>
              ))}
            </select>
          </div>

          <div className="nt-field">
            <label>Transferencia entre ubicaciones</label>

            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <button
                type="button"
                className={`btn-light ${usarUbicaciones ? "activo" : ""}`}
                onClick={() => {
                  if (bloqueadoCabecera) return;
                  setUsarUbicaciones(v => !v);
                }}
                disabled={bloqueadoCabecera}
              >
                {usarUbicaciones ? "SI" : "NO"}
              </button>

              <small style={{ opacity: 0.8 }}>
                {usarUbicaciones
                  ? "Elegí ubicaciones."
                  : "Se usará GENERAL automáticamente."}
              </small>
            </div>
          </div>
        </div>

        {usarUbicaciones && (
          <div className="nt-row">
            <div className="nt-field">
              <label>
                Ubicación Origen {origenNombre ? `(${origenNombre})` : ""}
              </label>

              <select
                value={ubicacionOrigenId}
                onChange={e => setUbicacionOrigenId(e.target.value)}
                disabled={bloqueadoCabecera || !origenId || loadingUbicOrigen}
              >
                <option value="">
                  {origenId
                    ? "-- Seleccioná ubicación origen --"
                    : "Seleccioná depósito origen primero"}
                </option>

                {ubicacionesOrigen.map(u => (
                  <option key={u.id_ubicacion} value={u.id_ubicacion}>
                    {u.nombre}
                  </option>
                ))}
              </select>
            </div>

            <div className="nt-field">
              <label>
                Ubicación Destino {destinoNombre ? `(${destinoNombre})` : ""}
              </label>

              <select
                value={ubicacionDestinoId}
                onChange={e => setUbicacionDestinoId(e.target.value)}
                disabled={bloqueadoCabecera || !destinoId || loadingUbicDestino}
              >
                <option value="">
                  {destinoId
                    ? "-- Seleccioná ubicación destino --"
                    : "Seleccioná depósito destino primero"}
                </option>

                {ubicacionesDestino.map(u => (
                  <option key={u.id_ubicacion} value={u.id_ubicacion}>
                    {u.nombre}
                  </option>
                ))}
              </select>
            </div>
          </div>
        )}
      </div>

      <div className="nt-card">
        <h4>Ítems a transferir</h4>

        <div className="tabla-articulos-container">
          <table className="tabla-articulos">
            <thead>
              <tr>
                <th style={{ width: "180px" }}>Código</th>
                <th>Descripción</th>
                <th style={{ width: "140px", textAlign: "right" }}>Cantidad</th>
                <th style={{ width: "110px" }}>Acción</th>
              </tr>
            </thead>

            <tbody>
              {items.map((it, idx) => (
                <tr key={idx}>
                  <td>
                    <input
                      ref={el => codigoRefs.current[idx] = el}
                      type="text"
                      value={it.codigo}
                      placeholder="Código..."
                      onChange={e =>
                        actualizarItem(idx, {
                          codigo: e.target.value.toUpperCase(),
                          descripcion: ""
                        })
                      }
                      onBlur={() => buscarArticulo(it.codigo, idx)}
                      onKeyDown={e => handleCodigoKeyDown(e, idx)}
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
                      ref={el => cantidadRefs.current[idx] = el}
                      type="number"
                      min="1"
                      step="1"
                      value={it.cantidad}
                      onChange={e =>
                        actualizarItem(idx, {
                          cantidad: e.target.value.replace(/[^0-9]/g, "")
                        })
                      }
                      onKeyDown={e => handleCantidadKeyDown(e, idx)}
                      style={{ width: "100%", textAlign: "right" }}
                    />
                  </td>

                  <td>
                    <button className="borrar-btn" onClick={() => quitarItem(idx)}>
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
            disabled={
              !origenId ||
              !destinoId ||
              !hayItemsConDatos ||
              (usarUbicaciones && (!ubicacionOrigenId || !ubicacionDestinoId)) ||
              sameUbicWhenSameDeposito
            }
          >
            Confirmar transferencia
          </button>
        </div>
      </div>
    </div>
  );
}