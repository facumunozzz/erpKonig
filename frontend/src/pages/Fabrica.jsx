import React, { useEffect, useMemo, useState } from "react";
import api from "../api/axiosConfig";
import { useNavigate } from "react-router-dom";
import "./../styles/transferencias.css";

export default function Fabrica() {
  const navigate = useNavigate();

  // Depósitos
  const [depositos, setDepositos] = useState([]);
  const [depOrigen, setDepOrigen] = useState("");
  const [depDestino, setDepDestino] = useState("");

  // Producto a fabricar
  const [codigo, setCodigo] = useState("");
  const [descripcion, setDescripcion] = useState("");
  const [tieneFormula, setTieneFormula] = useState(false);

  // Cantidad
  const [cantidad, setCantidad] = useState("");

  // Mensajes
  const [errorMsg, setErrorMsg] = useState("");
  const [infoMsg, setInfoMsg] = useState("");

  useEffect(() => {
    api.get("/depositos").then(res => setDepositos(res.data || [])).catch(console.error);
  }, []);

  // Verificar fórmula al salir del código
  const verificarCodigo = async () => {
    setErrorMsg("");
    setInfoMsg("");
    const c = (codigo || "").trim().toUpperCase();
    if (!c) return setErrorMsg("Ingresá un CÓDIGO.");

    try {
      // Re-uso del endpoint de fórmulas
      const r = await api.get(`/produccion/formulas/${encodeURIComponent(c)}`);
      const comp = r.data?.detalle || r.data?.componentes || [];
      const prodDesc = r.data?.producto?.descripcion || r.data?.descripcion || "";
      setDescripcion(prodDesc);
      if (!comp.length) {
        setTieneFormula(false);
        setInfoMsg("No existe fórmula para este código.");
      } else {
        setTieneFormula(true);
      }
    } catch (err) {
      setTieneFormula(false);
      setDescripcion("");
      const msg = err.response?.data?.error || "Artículo no encontrado o error consultando fórmula";
      setErrorMsg(msg);
    }
  };

  const confirmar = async () => {
    try {
      setErrorMsg("");
      setInfoMsg("");

      const o = Number(depOrigen);
      const d = Number(depDestino);
      const c = (codigo || "").trim().toUpperCase();
      const q = Number(cantidad);

      if (!o || !d) return setErrorMsg("Seleccioná depósitos ORIGEN y DESTINO.");
      if (!c) return setErrorMsg("Ingresá el CÓDIGO del producto.");
      if (!tieneFormula) return setErrorMsg("Ese código no tiene fórmula de producción.");
      if (!q || q <= 0) return setErrorMsg("La CANTIDAD debe ser mayor que 0.");

      const body = {
        codigo: c,
        deposito_origen_id: o,
        deposito_destino_id: d,
        cantidad: q
      };

      const res = await api.post("/fabrica/ordenes", body);
      alert(`Orden de producción creada: Nº ${res.data?.orden?.numero_orden || res.data?.message || "OK"}`);
      navigate("/movimientos"); // o a donde prefieras
    } catch (err) {
      const data = err.response?.data;
      if (data?.faltantes?.length) {
        const detalle = data.faltantes.map(f => `${f.cod_articulo}: req ${f.requerido}, disp ${f.disponible}`).join('\n');
        setErrorMsg(`${data.error}\n${detalle}`);
      } else {
        setErrorMsg(data?.error || data?.detalle || err.message || "Error al crear la orden");
      }
    }
  };

  const puedeConfirmar = useMemo(
    () => !!depOrigen && !!depDestino && !!codigo.trim() && !!cantidad && tieneFormula,
    [depOrigen, depDestino, codigo, cantidad, tieneFormula]
  );

  return (
    <div className="nueva-transferencia-page">
      <div className="nt-header">
        <h2 className="module-title">Fábrica</h2>
        <button className="nt-volver" onClick={() => navigate("/produccion")}>
          ← Volver
        </button>
      </div>

      {errorMsg && <div className="nt-error" style={{ whiteSpace: 'pre-line' }}>{errorMsg}</div>}
      {infoMsg && <div className="nt-info">{infoMsg}</div>}

      <div className="nt-card">
        <div className="nt-row">
          {/* Depósitos primero */}
          <div className="nt-field">
            <label>Depósito ORIGEN (insumos)</label>
            <select value={depOrigen} onChange={e => setDepOrigen(e.target.value)}>
              <option value="">-- Seleccioná --</option>
              {depositos.map(d => (
                <option key={d.id_deposito} value={d.id_deposito}>{d.nombre}</option>
              ))}
            </select>
          </div>

          <div className="nt-field">
            <label>Depósito DESTINO (producto)</label>
            <select value={depDestino} onChange={e => setDepDestino(e.target.value)}>
              <option value="">-- Seleccioná --</option>
              {depositos.map(d => (
                <option key={d.id_deposito} value={d.id_deposito}>{d.nombre}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="nt-row">
          <div className="nt-field">
            <label>Código a fabricar</label>
            <input
              type="text"
              value={codigo}
              placeholder="Código…"
              onChange={e => { setCodigo(e.target.value); setTieneFormula(false); setDescripcion(''); }}
              onBlur={verificarCodigo}
            />
          </div>

          <div className="nt-field">
            <label>Descripción</label>
            <input type="text" value={descripcion} readOnly placeholder="Se completa si hay fórmula" />
          </div>

          <div className="nt-field small">
            <label>Cantidad a fabricar</label>
            <input
              type="number"
              min="1"
              step="1"
              value={cantidad}
              onChange={e => setCantidad(e.target.value.replace(/[^0-9]/g, ""))}
            />
          </div>

          <div className="nt-actions">
            <button className="btn-primary" onClick={confirmar} disabled={!puedeConfirmar}>
              Confirmar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
