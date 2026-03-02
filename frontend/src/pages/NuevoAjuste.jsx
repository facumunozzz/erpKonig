// src/pages/NuevoAjuste.jsx
import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../api/axiosConfig";
import "./../styles/transferencias.css";

// ID estable por item (evita bugs con key={idx})
const newId = () =>
  globalThis.crypto?.randomUUID?.() ??
  `${Date.now()}_${Math.random().toString(16).slice(2)}`;

export default function NuevoAjuste() {
  const navigate = useNavigate();

  const [depositos, setDepositos] = useState([]);
  const [depositoId, setDepositoId] = useState("");

  const [ubicaciones, setUbicaciones] = useState([]);
  const [ubicacionId, setUbicacionId] = useState(""); // id_ubicacion
  const [errorUbicaciones, setErrorUbicaciones] = useState("");

  const [codigo, setCodigo] = useState("");
  const [descripcion, setDescripcion] = useState("");
  const [cantidad, setCantidad] = useState(""); // puede ser negativa

  const [motivo, setMotivo] = useState("");
  const [items, setItems] = useState([]);
  const [errorMsg, setErrorMsg] = useState("");
  const [errorDepositos, setErrorDepositos] = useState("");

  const bloqueadoCabecera = items.length > 0;

  const depositoSeleccionado = useMemo(() => {
    const id = Number(depositoId);
    return depositos.find((d) => Number(d.id_deposito) === id) || null;
  }, [depositoId, depositos]);

  const ubicacionSeleccionada = useMemo(() => {
    if (!ubicacionId) return null;
    return (
      ubicaciones.find(
        (u) => String(u.id_ubicacion) === String(ubicacionId)
      ) || null
    );
  }, [ubicacionId, ubicaciones]);

  // =========================
  // Cargar depósitos (con cancelación)
  // =========================
  useEffect(() => {
    let alive = true;

    (async () => {
      try {
        const res = await api.get("/depositos");
        if (!alive) return;
        setDepositos(res.data || []);
        setErrorDepositos("");
      } catch (err) {
        if (!alive) return;
        console.error(err);
        setErrorDepositos("No se pudo cargar la lista de depósitos.");
      }
    })();

    return () => {
      alive = false;
    };
  }, []);

  // =========================
  // Cuando cambia depósito => cargar ubicaciones (con cancelación)
  // =========================
  useEffect(() => {
    let alive = true;

    const dId = Number(depositoId);
    setUbicaciones([]);
    setUbicacionId("");
    setErrorUbicaciones("");

    if (!dId) return () => { alive = false; };

    (async () => {
      try {
        // Reutilizamos endpoint de transferencias
        const res = await api.get(`/transferencias/ubicaciones/${dId}`);
        if (!alive) return;

        const list = res.data || [];
        setUbicaciones(list);

        // Auto-seleccionar GENERAL si existe
        const general = list.find(
          (u) => String(u.nombre || "").trim().toUpperCase() === "GENERAL"
        );
        if (general) setUbicacionId(String(general.id_ubicacion));
      } catch (err) {
        if (!alive) return;
        console.error(err);
        setErrorUbicaciones(
          "No se pudo cargar la lista de ubicaciones del depósito."
        );
      }
    })();

    return () => {
      alive = false;
    };
  }, [depositoId]);

  // =========================
  // Resolver descripción por código (debounce + cancel)
  // =========================
  useEffect(() => {
    let alive = true;

    const c = (codigo || "").trim();
    if (!c) {
      setDescripcion("");
      return () => { alive = false; };
    }

    const t = setTimeout(async () => {
      try {
        let res;
        try {
          res = await api.get(`/articulos/codigo/${encodeURIComponent(c)}`);
        } catch {
          res = await api.get(
            `/articulos/articulo?codigo=${encodeURIComponent(c)}`
          );
        }

        if (!alive) return;
        const desc = res.data?.descripcion;
        setDescripcion(desc ? desc : "Artículo no encontrado");
      } catch {
        if (!alive) return;
        setDescripcion("Artículo no encontrado");
      }
    }, 250);

    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [codigo]);

  // =========================
  // Agregar item (id estable)
  // =========================
  const cargarYContinuar = () => {
    setErrorMsg("");

    const dId = Number(depositoId);
    if (!dId) return setErrorMsg("Seleccioná el DEPÓSITO.");

    // Si el depósito tiene ubicaciones, exigir selección (GENERAL suele autoseleccionarse)
    if (ubicaciones.length > 0 && !Number(ubicacionId)) {
      return setErrorMsg("Seleccioná la UBICACIÓN (o dejá GENERAL).");
    }

    const c = (codigo || "").trim().toUpperCase();
    const q = Number(cantidad);

    if (!c) return setErrorMsg("Ingresá el CÓDIGO.");
    if (!Number.isFinite(q) || q === 0) {
      return setErrorMsg(
        "La CANTIDAD no puede ser 0 (puede ser negativa o positiva)."
      );
    }

    setItems((prev) => [
      ...prev,
      { id: newId(), cod_articulo: c, descripcion: descripcion || "", cantidad: q },
    ]);

    setCodigo("");
    setDescripcion("");
    setCantidad("");
  };

  const quitarItem = (id) => {
    setItems((prev) => prev.filter((x) => x.id !== id));
  };

  // =========================
  // Confirmar ajuste
  // =========================
  const confirmar = async () => {
    try {
      setErrorMsg("");

      const dId = Number(depositoId);
      if (!dId) return setErrorMsg("Seleccioná el DEPÓSITO.");
      if (items.length === 0)
        return setErrorMsg('Agregá ítems con "Cargar y continuar".');

      const ubId = ubicacionId ? Number(ubicacionId) : null;

      const body = {
        deposito_id: dId,
        // si no mandás id_ubicacion, el backend puede resolver GENERAL
        id_ubicacion: ubId || null,
        motivo: motivo || null,
        items: items.map((it) => ({
          cod_articulo: it.cod_articulo,
          cantidad: it.cantidad,
        })),
      };

      const res = await api.post("/ajustes", body);

      alert(
        "Ajuste creado: " +
          (res.data?.ajuste?.numero_ajuste || res.data?.message || "OK")
      );

      navigate("/ajustes");
    } catch (err) {
      console.error(err);
      const msg =
        err.response?.data?.error ||
        (typeof err.response?.data?.detalle === "string"
          ? err.response.data.detalle
          : null) ||
        err.message ||
        "Error al confirmar el ajuste";
      setErrorMsg(msg);
    }
  };

  return (
    <div className="nueva-transferencia-page">
      <div className="nt-header">
        <h2 className="module-title">Nuevo Ajuste</h2>
        <button className="nt-volver" onClick={() => navigate("/ajustes")}>
          ← Volver
        </button>
      </div>

      {errorDepositos && <div className="nt-error">{errorDepositos}</div>}
      {errorUbicaciones && <div className="nt-error">{errorUbicaciones}</div>}
      {errorMsg && <div className="nt-error">{errorMsg}</div>}

      <div className="nt-card">
        <div className="nt-row">
          <div className="nt-field">
            <label>Depósito</label>
            <select
              value={depositoId}
              onChange={(e) => setDepositoId(e.target.value)}
              disabled={bloqueadoCabecera}
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
            <label>Ubicación</label>
            <select
              value={ubicacionId}
              onChange={(e) => setUbicacionId(e.target.value)}
              disabled={bloqueadoCabecera || !depositoId || ubicaciones.length === 0}
              title={!depositoId ? "Primero elegí depósito" : ""}
            >
              <option value="">
                {ubicaciones.length === 0
                  ? "-- (sin ubicaciones) --"
                  : "-- Seleccioná ubicación --"}
              </option>
              {ubicaciones.map((u) => (
                <option key={u.id_ubicacion} value={u.id_ubicacion}>
                  {u.nombre}
                </option>
              ))}
            </select>

            {depositoId && ubicaciones.length > 0 && !ubicacionId && (
              <small style={{ opacity: 0.75 }}>
                Si no elegís una, el sistema intentará usar <b>GENERAL</b>.
              </small>
            )}
          </div>

          <div className="nt-field grow">
            <label>Motivo</label>
            <input
              type="text"
              value={motivo}
              placeholder="Escribí el motivo del ajuste…"
              onChange={(e) => setMotivo(e.target.value)}
            />
          </div>
        </div>

        <div className="nt-row">
          <div className="nt-field">
            <label>Código</label>
            <input
              type="text"
              value={codigo}
              placeholder="Ingresá código…"
              onChange={(e) => setCodigo(e.target.value)}
            />
          </div>

          <div className="nt-field">
            <label>Descripción</label>
            <input
              type="text"
              value={descripcion}
              readOnly
              placeholder="Se completa desde el código"
            />
          </div>

          <div className="nt-field small">
            <label>Cantidad (+/-)</label>
            <input
              type="number"
              step="1"
              value={cantidad}
              onChange={(e) => {
                const v = e.target.value;
                if (/^-?\d*$/.test(v)) setCantidad(v);
              }}
            />
          </div>

          <div className="nt-actions">
            <button className="btn-light" onClick={cargarYContinuar}>
              Cargar y continuar
            </button>
            <button
              className="btn-primary"
              onClick={confirmar}
              disabled={!depositoId || items.length === 0}
              title={
                !depositoId
                  ? "Seleccioná depósito"
                  : items.length === 0
                  ? "Cargá al menos un ítem"
                  : ""
              }
            >
              Confirmar
            </button>
          </div>
        </div>

        {depositoSeleccionado && (
          <div style={{ marginTop: 10, opacity: 0.8 }}>
            Trabajando en: <b>{depositoSeleccionado.nombre}</b>
            {ubicacionSeleccionada ? ` / ${ubicacionSeleccionada.nombre}` : ""}
          </div>
        )}
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
                  <td colSpan="4">No hay ítems. Usá "Cargar y continuar".</td>
                </tr>
              ) : (
                items.map((it) => (
                  <tr key={it.id}>
                    <td>{it.cod_articulo}</td>
                    <td>{it.descripcion}</td>
                    <td style={{ textAlign: "right" }}>{it.cantidad}</td>
                    <td>
                      <button
                        className="borrar-btn"
                        onClick={() => quitarItem(it.id)}
                      >
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
