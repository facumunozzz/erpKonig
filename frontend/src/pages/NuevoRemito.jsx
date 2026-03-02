import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import api from "../api/axiosConfig";
import "./../styles/transferencias.css";

const up = (v) => String(v ?? "").trim().toUpperCase();

export default function NuevoRemito() {
  const navigate = useNavigate();
  const { displayName } = useAuth(); // usuario logueado (NO se muestra, se envía)

  const [nroRemito, setNroRemito] = useState("");
  const [tipo, setTipo] = useState("ENTRADA");

  // Guardamos depósito como ID + nombre (para poder pedir ubicaciones por ID
  // y seguir enviando deposito_nombre como tu backend actual espera)
  const [depositoId, setDepositoId] = useState("");
  const [depositoNombre, setDepositoNombre] = useState("");

  const [observacion, setObservacion] = useState("");

  // Form de ítem (agrega 1 a la vez como tu UI original)
  const [codigo, setCodigo] = useState("");
  const [descripcion, setDescripcion] = useState("");
  const [cantidad, setCantidad] = useState("");
  const [idUbicacion, setIdUbicacion] = useState(""); // 👈 ubicación del ítem actual

  const [items, setItems] = useState([]);
  const [depositos, setDepositos] = useState([]);
  const [ubicaciones, setUbicaciones] = useState([]);

  // -------------------------
  // Init: depósitos
  // -------------------------
  useEffect(() => {
    (async () => {
      try {
        const r = await api.get("/depositos");
        const arr = r.data || [];
        setDepositos(arr);

        // Setear primero por defecto
        if (arr.length) {
          setDepositoId(String(arr[0].id_deposito));
          setDepositoNombre(arr[0].nombre);
        }
      } catch (e) {
        console.error(e);
        alert("No se pudieron cargar los depósitos.");
      }
    })();
  }, []);

  // -------------------------
  // Al cambiar depósito: cargar ubicaciones
  // -------------------------
  useEffect(() => {
    const depId = Number(depositoId);
    if (!Number.isFinite(depId) || depId <= 0) {
      setUbicaciones([]);
      setIdUbicacion("");
      return;
    }

    (async () => {
      try {
        const r = await api.get("/ubicaciones", { params: { deposito_id: depId } });
        const arr = r.data || [];
        setUbicaciones(arr);

        // Default GENERAL si existe
        const general = arr.find((u) => up(u.nombre) === "GENERAL");
        const def = general ? String(general.id_ubicacion) : (arr[0] ? String(arr[0].id_ubicacion) : "");
        setIdUbicacion(def);
      } catch (e) {
        console.error(e);
        setUbicaciones([]);
        setIdUbicacion("");
      }
    })();
  }, [depositoId]);

  const ubicacionLabel = useMemo(() => {
    const u = ubicaciones.find((x) => String(x.id_ubicacion) === String(idUbicacion));
    return u?.nombre || "";
  }, [ubicaciones, idUbicacion]);

  // -------------------------
  // Buscar descripción al salir del campo código
  // -------------------------
  const buscarDescripcion = async () => {
    const c = up(codigo);
    if (!c) return;

    try {
      const res = await api.get(`/articulos/codigo/${c}`);
      setDescripcion(res.data?.descripcion || "");
    } catch {
      setDescripcion("❌ Código inexistente");
    }
  };

  // -------------------------
  // Agregar ítem (con ubicación)
  // -------------------------
  const agregarItem = () => {
    const c = up(codigo);
    const q = Number(cantidad);
    const ubIdNum = Number(idUbicacion);

    if (!c) return alert("Código es obligatorio");
    if (!descripcion || descripcion.startsWith("❌")) return alert("Código inválido");
    if (!Number.isFinite(q) || q <= 0) return alert("Cantidad válida es obligatoria");
    if (!Number.isFinite(ubIdNum) || ubIdNum <= 0) return alert("Ubicación es obligatoria");

    setItems((prev) => [
      ...prev,
      {
        cod_articulo: c,
        descripcion,
        cantidad: q,
        id_ubicacion: ubIdNum,
        ubicacion_nombre: ubicacionLabel || "", // solo para mostrar en UI
      },
    ]);

    setCodigo("");
    setDescripcion("");
    setCantidad("");
    // dejamos la ubicación seleccionada para acelerar carga
  };

  const quitarItem = (idx) => {
    setItems((prev) => prev.filter((_, i) => i !== idx));
  };

  // -------------------------
  // Confirmar (usuario NO se muestra, se envía solo)
  // -------------------------
  const confirmar = async () => {
    if (!nroRemito.trim()) return alert("Debe ingresar número de remito");
    if (!depositoNombre) return alert("Debe seleccionar depósito");
    if (!items.length) return alert("Debe ingresar al menos un ítem");

    // Seguridad: validar id_ubicacion en todos (tu DB lo exige)
    const sinUb = items.find((it) => !Number.isFinite(it.id_ubicacion) || it.id_ubicacion <= 0);
    if (sinUb) return alert("Todos los ítems deben tener ubicación.");

    try {
      await api.post("/remitos", {
        nro_remito: nroRemito.trim(),
        tipo,
        deposito_nombre: depositoNombre, // compat con tu backend actual
        // deposito_id: Number(depositoId) || null, // si tu backend lo admite, podés descomentar
        usuario: displayName || null,     // 👈 se envía solo, NO se edita, NO se muestra
        observacion: observacion?.trim() || null,
        items: items.map((it) => ({
          cod_articulo: it.cod_articulo,
          descripcion: it.descripcion,
          cantidad: it.cantidad,
          id_ubicacion: it.id_ubicacion,
        })),
      });

      alert("Remito creado correctamente");
      navigate("/remitos");
    } catch (err) {
      console.error(err);
      alert(err.response?.data?.error || err.response?.data?.detalle || "Error al crear el remito");
    }
  };

  return (
  <div className="transferencias-page">

    {/* HEADER */}
    <div className="nt-header">
      <h2 className="module-title">Nuevo Remito</h2>
      <div className="nt-actions">
        <button
          className="nt-btn-secondary"
          onClick={() => navigate("/remitos")}
        >
          ← Volver
        </button>
      </div>
    </div>

    {/* ================= CABECERA ================= */}
    <div className="nt-card">
      <div className="nt-row">

        <div className="nt-field">
          <label>N° Remito</label>
          <input
            value={nroRemito}
            onChange={(e) => setNroRemito(e.target.value)}
          />
        </div>

        <div className="nt-field">
          <label>Tipo</label>
          <select
            value={tipo}
            onChange={(e) => setTipo(e.target.value)}
          >
            <option value="ENTRADA">ENTRADA</option>
            <option value="SALIDA">SALIDA</option>
          </select>
        </div>

        <div className="nt-field">
          <label>Depósito</label>
          <select
            value={depositoId}
            onChange={(e) => {
              const id = e.target.value;
              setDepositoId(id);
              const dep = depositos.find(
                (d) => String(d.id_deposito) === String(id)
              );
              setDepositoNombre(dep?.nombre || "");
            }}
          >
            <option value="">-- Seleccionar --</option>
            {depositos.map((d) => (
              <option key={d.id_deposito} value={d.id_deposito}>
                {d.nombre}
              </option>
            ))}
          </select>
        </div>

      </div>

      <div className="nt-row">
        <div className="nt-field full">
          <label>Observación</label>
          <input
            value={observacion}
            onChange={(e) => setObservacion(e.target.value)}
          />
        </div>
      </div>
    </div>

    {/* ================= AGREGAR ITEM ================= */}
    <div className="nt-card">
      <h4 className="nt-subtitle">Agregar ítem</h4>

      <div className="nt-row">

        <div className="nt-field">
          <label>Código</label>
          <input
            value={codigo}
            onChange={(e) => setCodigo(e.target.value)}
            onBlur={buscarDescripcion}
          />
        </div>

        <div className="nt-field">
          <label>Descripción</label>
          <input value={descripcion} readOnly />
        </div>

        <div className="nt-field">
          <label>Ubicación</label>
          <select
            value={idUbicacion}
            onChange={(e) => setIdUbicacion(e.target.value)}
            disabled={!ubicaciones.length}
          >
            {ubicaciones.length === 0 ? (
              <option value="">(Sin ubicaciones)</option>
            ) : (
              ubicaciones.map((u) => (
                <option key={u.id_ubicacion} value={u.id_ubicacion}>
                  {u.nombre}
                </option>
              ))
            )}
          </select>
        </div>

        <div className="nt-field small">
          <label>Cantidad</label>
          <input
            type="number"
            min="1"
            value={cantidad}
            onChange={(e) => setCantidad(e.target.value)}
          />
        </div>

        <div className="nt-field actions">
          <label>&nbsp;</label>
          <button
            className="nt-btn-primary"
            onClick={agregarItem}
          >
            Agregar
          </button>
        </div>

      </div>
    </div>

    {/* ================= RESUMEN ================= */}
    <div className="nt-card">
      <h4 className="nt-subtitle">Resumen</h4>

      <div className="tabla-articulos-container">
        <table className="tabla-articulos">
          <thead>
            <tr>
              <th>Código</th>
              <th>Descripción</th>
              <th>Ubicación</th>
              <th style={{ textAlign: "right" }}>Cantidad</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 && (
              <tr>
                <td colSpan="5">Sin ítems</td>
              </tr>
            )}

            {items.map((it, i) => (
              <tr key={i}>
                <td>{it.cod_articulo}</td>
                <td>{it.descripcion}</td>
                <td>{it.ubicacion_nombre || it.id_ubicacion}</td>
                <td style={{ textAlign: "right" }}>
                  {it.cantidad}
                </td>
                <td style={{ textAlign: "right" }}>
                  <button
                    className="nt-btn-danger"
                    onClick={() => quitarItem(i)}
                  >
                    Quitar
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>

    {/* ================= FOOTER ================= */}
    <div className="nt-footer">
      <button
        className="nt-btn-primary"
        onClick={confirmar}
      >
        Confirmar remito
      </button>

      <button
        className="nt-btn-secondary"
        onClick={() => navigate("/remitos")}
      >
        Cancelar
      </button>
    </div>

  </div>
);}
