import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import api from "../api/axiosConfig";
import "./../styles/transferencias.css";

const up = (v) =>
  String(v ?? "")
    .trim()
    .toUpperCase();

const getProveedorNombre = (p) => {
  return p?.nombre ?? "";
};

export default function NuevoRemito() {
  const navigate = useNavigate();
  const { displayName } = useAuth();

  const [nroRemito, setNroRemito] = useState("");
  const [nroEntrega, setNroEntrega] = useState("");
  const [pedido, setPedido] = useState("");
  const [proveedor, setProveedor] = useState("");
  const [observacion, setObservacion] = useState("");

  const [proveedores, setProveedores] = useState([]);

  const [codigo, setCodigo] = useState("");
  const [descripcion, setDescripcion] = useState("");
  const [cantidad, setCantidad] = useState("");

  const [items, setItems] = useState([]);

  useEffect(() => {
    cargarProveedores();
  }, []);

  const cargarProveedores = async () => {
    try {
      const res = await api.get("/remitos/proveedores");
      setProveedores(Array.isArray(res.data) ? res.data : []);
    } catch (err) {
      console.error("Error cargando proveedores:", err);
      alert(
        err.response?.data?.error ||
          err.response?.data?.detalle ||
          "No se pudieron cargar los proveedores.",
      );
      setProveedores([]);
    }
  };

  const buscarDescripcion = async () => {
    const c = up(codigo);
    if (!c) return;

    try {
      const res = await api.get("/remitos/articulo", {
        params: { codigo: c },
      });

      setDescripcion(res.data?.descripcion || "");
    } catch {
      setDescripcion("❌ Código inexistente");
    }
  };

  const agregarItem = () => {
    const c = up(codigo);
    const q = Number(cantidad);

    if (!c) return alert("Código es obligatorio");

    if (!descripcion || descripcion.startsWith("❌")) {
      return alert("Código inválido");
    }

    if (!Number.isFinite(q) || q <= 0) {
      return alert("Cantidad válida es obligatoria");
    }

    setItems((prev) => [
      ...prev,
      {
        codigo: c,
        descripcion,
        cantidad: q,
      },
    ]);

    setCodigo("");
    setDescripcion("");
    setCantidad("");
  };

  const quitarItem = (idx) => {
    setItems((prev) => prev.filter((_, i) => i !== idx));
  };

  const confirmar = async () => {
    if (!nroRemito.trim()) return alert("Debe ingresar número de remito");
    if (!proveedor.trim()) return alert("Debe seleccionar proveedor");
    if (!items.length) return alert("Debe ingresar al menos un ítem");

    try {
      await api.post("/remitos", {
        nro_remito: nroRemito.trim(),
        nro_entrega: nroEntrega.trim() || null,
        pedido: pedido.trim() || null,
        proveedor: proveedor.trim(),

        // Fijos, no visibles en pantalla
        tipo: "ENTRADA",
        deposito_nombre: "RECEPCION",

        usuario: displayName || null,
        observacion: observacion?.trim() || null,

        items: items.map((it) => ({
          codigo: it.codigo,
          cantidad: it.cantidad,
        })),
      });

      alert("Remito creado correctamente");
      navigate("/remitos");
    } catch (err) {
      console.error(err);

      const data = err.response?.data;
      let msg = data?.error || data?.detalle || "Error al crear el remito";

      if (Array.isArray(data?.detalle)) {
        msg += "\n\n" + data.detalle.join("\n");
      } else if (data?.detalle) {
        msg += "\n\n" + String(data.detalle);
      }

      alert(msg);
    }
  };

  return (
    <div className="transferencias-page nueva-transferencia-page">
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
            <label>N° Entrega</label>
            <input
              value={nroEntrega}
              onChange={(e) => setNroEntrega(e.target.value)}
            />
          </div>

          <div className="nt-field">
            <label>Pedido</label>
            <input value={pedido} onChange={(e) => setPedido(e.target.value)} />
          </div>

          <div className="nt-field">
            <label>Proveedor</label>
            <select
              value={proveedor}
              onChange={(e) => setProveedor(e.target.value)}
            >
              <option value="">-- Seleccionar proveedor --</option>

              {proveedores.map((p) => (
                <option key={p.id_proveedor} value={p.nombre}>
                  {p.nombre}
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
              onChange={(e) => {
                setCodigo(e.target.value);
                setDescripcion("");
              }}
              onBlur={buscarDescripcion}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  buscarDescripcion();
                }
              }}
            />
          </div>

          <div className="nt-field">
            <label>Descripción</label>
            <input value={descripcion} readOnly />
          </div>

          <div className="nt-field small">
            <label>Cantidad</label>
            <input
              type="number"
              min="1"
              value={cantidad}
              onChange={(e) => setCantidad(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  agregarItem();
                }
              }}
            />
          </div>

          <div className="nt-field actions">
            <label>&nbsp;</label>
            <button className="nt-btn-primary" onClick={agregarItem}>
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
                <th style={{ textAlign: "right" }}>Cantidad</th>
                <th></th>
              </tr>
            </thead>

            <tbody>
              {items.length === 0 && (
                <tr>
                  <td colSpan="4">Sin ítems</td>
                </tr>
              )}

              {items.map((it, i) => (
                <tr key={i}>
                  <td>{it.codigo}</td>
                  <td>{it.descripcion}</td>
                  <td style={{ textAlign: "right" }}>{it.cantidad}</td>
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
        <button className="nt-btn-primary" onClick={confirmar}>
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
  );
}
