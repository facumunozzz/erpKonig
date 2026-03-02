import React, { useEffect, useMemo, useState } from "react";
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

  const [codigo, setCodigo] = useState("");
  const [descripcion, setDescripcion] = useState("");
  const [cantidad, setCantidad] = useState("");

  const [items, setItems] = useState([]);
  const [errorMsg, setErrorMsg] = useState("");
  const [errorDepositos, setErrorDepositos] = useState("");
  const [loadingUbicOrigen, setLoadingUbicOrigen] = useState(false);
  const [loadingUbicDestino, setLoadingUbicDestino] = useState(false);

  const bloqueadoCabecera = items.length > 0;

  useEffect(() => {
    api
      .get("/depositos")
      .then((res) => {
        setDepositos(res.data || []);
        setErrorDepositos("");
      })
      .catch((err) => {
        console.error(err);
        setErrorDepositos("No se pudo cargar la lista de depósitos.");
      });
  }, []);

  useEffect(() => {
    const c = (codigo || "").trim();
    if (!c) {
      setDescripcion("");
      return;
    }
    const t = setTimeout(async () => {
      try {
        const res = await api.get(`/articulos/codigo/${c}`);
        const desc = res.data?.descripcion;
        setDescripcion(desc ? desc : "Artículo no encontrado");
      } catch {
        setDescripcion("Artículo no encontrado");
      }
    }, 250);
    return () => clearTimeout(t);
  }, [codigo]);

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

      const general = list.find((u) => String(u.nombre || "").trim().toUpperCase() === "GENERAL");
      if (general) setterSelected(String(general.id_ubicacion));
    } catch (err) {
      console.error(err);
      setErrorMsg("No se pudieron cargar ubicaciones para el depósito seleccionado.");
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
    if (origenId) cargarUbicaciones(origenId, setUbicacionesOrigen, setUbicacionOrigenId, setLoadingUbicOrigen);
    if (destinoId) cargarUbicaciones(destinoId, setUbicacionesDestino, setUbicacionDestinoId, setLoadingUbicDestino);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [usarUbicaciones]);

  useEffect(() => {
    if (!usarUbicaciones) return;
    if (origenId) cargarUbicaciones(origenId, setUbicacionesOrigen, setUbicacionOrigenId, setLoadingUbicOrigen);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [origenId]);

  useEffect(() => {
    if (!usarUbicaciones) return;
    if (destinoId) cargarUbicaciones(destinoId, setUbicacionesDestino, setUbicacionDestinoId, setLoadingUbicDestino);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [destinoId]);

  const origenNombre = useMemo(() => {
    const d = depositos.find((x) => String(x.id_deposito) === String(origenId));
    return d?.nombre || "";
  }, [depositos, origenId]);

  const destinoNombre = useMemo(() => {
    const d = depositos.find((x) => String(x.id_deposito) === String(destinoId));
    return d?.nombre || "";
  }, [depositos, destinoId]);

  const grabarYContinuar = () => {
    setErrorMsg("");

    const oId = Number(origenId);
    const dId = Number(destinoId);

    if (!oId || !dId) return setErrorMsg("Seleccioná ORIGEN y DESTINO.");

    // ✅ permite mismo depósito SOLO si usarUbicaciones y ubicaciones distintas
    if (oId === dId) {
      if (!usarUbicaciones) {
        return setErrorMsg(
          "Si Origen y Destino son el mismo depósito, activá 'Transferencia entre ubicaciones' y elegí ubicaciones distintas."
        );
      }
      const uO = Number(ubicacionOrigenId);
      const uD = Number(ubicacionDestinoId);
      if (!uO || !uD) return setErrorMsg("Seleccioná UBICACIÓN ORIGEN y UBICACIÓN DESTINO.");
      if (uO === uD) return setErrorMsg("Si el depósito es el mismo, la UBICACIÓN ORIGEN y DESTINO deben ser distintas.");
    }

    if (usarUbicaciones) {
      const uO = Number(ubicacionOrigenId);
      const uD = Number(ubicacionDestinoId);
      if (!uO || !uD) return setErrorMsg("Seleccioná UBICACIÓN ORIGEN y UBICACIÓN DESTINO.");
    }

    const c = (codigo || "").trim().toUpperCase();
    const q = Number(cantidad);

    if (!c) return setErrorMsg("Ingresá el CÓDIGO.");
    if (!q || q <= 0) return setErrorMsg("La CANTIDAD debe ser mayor que 0.");

    if ((descripcion || "").toUpperCase().includes("NO ENCONTRADO")) {
      return setErrorMsg("El código no existe. Verificá el artículo antes de grabar.");
    }

    setItems((prev) => [...prev, { codigo: c, descripcion: descripcion || "", cantidad: q }]);

    setCodigo("");
    setDescripcion("");
    setCantidad("");
  };

  const quitarItem = (idx) => {
    setItems((prev) => prev.filter((_, i) => i !== idx));
  };

  const confirmar = async () => {
    try {
      setErrorMsg("");

      const oId = Number(origenId);
      const dId = Number(destinoId);

      if (!oId || !dId) return setErrorMsg("Seleccioná ORIGEN y DESTINO.");
      if (items.length === 0) return setErrorMsg('Agregá ítems con "Grabar y continuar".');

      const uO = usarUbicaciones ? Number(ubicacionOrigenId) : null;
      const uD = usarUbicaciones ? Number(ubicacionDestinoId) : null;

      // ✅ NUEVO: misma regla también en Confirmar
      if (oId === dId) {
        if (!usarUbicaciones) {
          return setErrorMsg(
            "Si Origen y Destino son el mismo depósito, activá 'Transferencia entre ubicaciones' y elegí ubicaciones distintas."
          );
        }
        if (!uO || !uD) return setErrorMsg("Seleccioná UBICACIÓN ORIGEN y UBICACIÓN DESTINO.");
        if (uO === uD) return setErrorMsg("Si el depósito es el mismo, la UBICACIÓN ORIGEN y DESTINO deben ser distintas.");
      }

      const body = {
        origen_id: oId,
        destino_id: dId,
        ...(usarUbicaciones ? { id_ubicacion_origen: uO, id_ubicacion_destino: uD } : {}),
        items: items.map((it) => ({ codigo: it.codigo, cantidad: it.cantidad })),
      };

      const res = await api.post("/transferencias", body);

      alert(
        "Transferencia creada: " +
          (res.data?.transferencia?.numero_transferencia ||
            res.data?.cabecera?.numero_transferencia ||
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

  // ✅ NUEVO: regla para deshabilitar Confirmar si mismo depósito pero ubicaciones inválidas/iguales
  const sameDeposito = Number(origenId) && Number(destinoId) && Number(origenId) === Number(destinoId);
  const sameUbicWhenSameDeposito =
    sameDeposito &&
    (!usarUbicaciones ||
      !ubicacionOrigenId ||
      !ubicacionDestinoId ||
      Number(ubicacionOrigenId) === Number(ubicacionDestinoId));

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
            <select value={origenId} onChange={(e) => setOrigenId(e.target.value)} disabled={bloqueadoCabecera}>
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
            <select value={destinoId} onChange={(e) => setDestinoId(e.target.value)} disabled={bloqueadoCabecera}>
              <option value="">-- Seleccioná depósito destino --</option>
              {depositos.map((d) => (
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
                  setUsarUbicaciones((v) => !v);
                }}
                disabled={bloqueadoCabecera}
                title={bloqueadoCabecera ? "Quitá los ítems para cambiar esta opción" : ""}
              >
                {usarUbicaciones ? "SI" : "NO"}
              </button>
              <small style={{ opacity: 0.8 }}>
                {usarUbicaciones ? "Elegí ubicaciones (si no, se usa GENERAL)." : "Se usará GENERAL automáticamente."}
              </small>
            </div>
          </div>
        </div>

        {usarUbicaciones && (
          <div className="nt-row">
            <div className="nt-field">
              <label>Ubicación Origen {origenNombre ? `(${origenNombre})` : ""}</label>
              <select
                value={ubicacionOrigenId}
                onChange={(e) => setUbicacionOrigenId(e.target.value)}
                disabled={bloqueadoCabecera || !origenId || loadingUbicOrigen}
              >
                <option value="">
                  {origenId ? "-- Seleccioná ubicación origen --" : "Seleccioná un depósito origen primero"}
                </option>
                {ubicacionesOrigen.map((u) => (
                  <option key={u.id_ubicacion} value={u.id_ubicacion}>
                    {u.nombre}
                  </option>
                ))}
              </select>
            </div>

            <div className="nt-field">
              <label>Ubicación Destino {destinoNombre ? `(${destinoNombre})` : ""}</label>
              <select
                value={ubicacionDestinoId}
                onChange={(e) => setUbicacionDestinoId(e.target.value)}
                disabled={bloqueadoCabecera || !destinoId || loadingUbicDestino}
              >
                <option value="">
                  {destinoId ? "-- Seleccioná ubicación destino --" : "Seleccioná un depósito destino primero"}
                </option>
                {ubicacionesDestino.map((u) => (
                  <option key={u.id_ubicacion} value={u.id_ubicacion}>
                    {u.nombre}
                  </option>
                ))}
              </select>
            </div>
          </div>
        )}

        <div className="nt-row">
          <div className="nt-field">
            <label>Código</label>
            <input type="text" value={codigo} placeholder="Ingresá código…" onChange={(e) => setCodigo(e.target.value)} />
          </div>

          <div className="nt-field">
            <label>Descripción</label>
            <input type="text" value={descripcion} readOnly placeholder="Se completa desde el código" />
          </div>

          <div className="nt-field small">
            <label>Cantidad</label>
            <input
              type="number"
              min="1"
              step="1"
              value={cantidad}
              onChange={(e) => setCantidad(e.target.value.replace(/[^0-9]/g, ""))}
            />
          </div>

          <div className="nt-actions">
            <button className="btn-light" onClick={grabarYContinuar}>
              Grabar y continuar
            </button>

            <button
              className="btn-primary"
              onClick={confirmar}
              disabled={!origenId || !destinoId || items.length === 0 || (usarUbicaciones && (!ubicacionOrigenId || !ubicacionDestinoId)) || sameUbicWhenSameDeposito}
              title={sameUbicWhenSameDeposito ? "Si el depósito es el mismo, las ubicaciones deben ser distintas." : ""}
            >
              Confirmar
            </button>
          </div>
        </div>
      </div>

      <div className="nt-card">
        <h4>Ítems cargados</h4>
        <div className="tabla-articulos-container">
          <table className="tabla-articulos">
            <thead>
              <tr>
                <th>Código</th>
                <th>Descripción</th>
                <th style={{ textAlign: "right" }}>Cantidad</th>
                <th>Acción</th>
              </tr>
            </thead>
            <tbody>
              {items.length === 0 ? (
                <tr>
                  <td colSpan="4">No hay ítems. Usá "Grabar y continuar".</td>
                </tr>
              ) : (
                items.map((it, idx) => (
                  <tr key={idx}>
                    <td>{it.codigo}</td>
                    <td>{it.descripcion}</td>
                    <td style={{ textAlign: "right" }}>{it.cantidad}</td>
                    <td>
                      <button className="borrar-btn" onClick={() => quitarItem(idx)}>
                        Quitar
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}