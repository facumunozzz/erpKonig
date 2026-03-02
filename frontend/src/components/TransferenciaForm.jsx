// src/components/TransferenciaForm.jsx
import React, { useEffect, useMemo, useState } from 'react';
import api from '../api/axiosConfig';
import './../styles/transferencias.css';

const toInt = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : 0;
};

function TransferenciaForm({ onClose, onCreated }) {
  const [depositos, setDepositos] = useState([]);
  const [origenId, setOrigenId] = useState('');
  const [destinoId, setDestinoId] = useState('');

  const [ubicOrigenList, setUbicOrigenList] = useState([]);
  const [ubicDestinoList, setUbicDestinoList] = useState([]);
  const [ubicOrigenId, setUbicOrigenId] = useState('');
  const [ubicDestinoId, setUbicDestinoId] = useState('');

  const [items, setItems] = useState([{ codigo: '', cantidad: 1 }]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // Cargar depósitos
  useEffect(() => {
    api.get('/depositos')
      .then(r => setDepositos(r.data || []))
      .catch(() => setDepositos([]));
  }, []);

  // Helpers: elegir GENERAL si existe
  const pickGeneral = (list) => {
    const g = (list || []).find(u => String(u.nombre || '').trim().toUpperCase() === 'GENERAL');
    return g ? String(g.id_ubicacion) : (list?.[0] ? String(list[0].id_ubicacion) : '');
  };

  // Cargar ubicaciones de ORIGEN
  useEffect(() => {
    const dep = toInt(origenId);
    if (!dep) { setUbicOrigenList([]); setUbicOrigenId(''); return; }

    api.get(`/transferencias/ubicaciones/${dep}`)
      .then(r => {
        const list = r.data || [];
        setUbicOrigenList(list);
        setUbicOrigenId(prev => prev || pickGeneral(list));
      })
      .catch(() => { setUbicOrigenList([]); setUbicOrigenId(''); });
  }, [origenId]);

  // Cargar ubicaciones de DESTINO
  useEffect(() => {
    const dep = toInt(destinoId);
    if (!dep) { setUbicDestinoList([]); setUbicDestinoId(''); return; }

    api.get(`/transferencias/ubicaciones/${dep}`)
      .then(r => {
        const list = r.data || [];
        setUbicDestinoList(list);
        setUbicDestinoId(prev => prev || pickGeneral(list));
      })
      .catch(() => { setUbicDestinoList([]); setUbicDestinoId(''); });
  }, [destinoId]);

  const canSubmit = useMemo(() => {
    if (!toInt(origenId) || !toInt(destinoId)) return false;
    if (!toInt(ubicOrigenId) || !toInt(ubicDestinoId)) return false;
    const validItems = items.filter(it => String(it.codigo || '').trim() && toInt(it.cantidad) > 0);
    return validItems.length > 0;
  }, [origenId, destinoId, ubicOrigenId, ubicDestinoId, items]);

  const addItem = () => setItems(prev => [...prev, { codigo: '', cantidad: 1 }]);
  const removeItem = (idx) => setItems(prev => prev.filter((_, i) => i !== idx));
  const updateItem = (idx, key, value) => {
    setItems(prev => prev.map((it, i) => (i === idx ? { ...it, [key]: value } : it)));
  };

  const submit = async () => {
    setError('');
    if (!canSubmit) { setError('Completá depósitos, ubicaciones y al menos un ítem válido.'); return; }

    const payload = {
      origen_id: toInt(origenId),
      destino_id: toInt(destinoId),
      id_ubicacion_origen: toInt(ubicOrigenId),
      id_ubicacion_destino: toInt(ubicDestinoId),
      items: items
        .map(it => ({ codigo: String(it.codigo || '').trim().toUpperCase(), cantidad: toInt(it.cantidad) }))
        .filter(it => it.codigo && it.cantidad > 0)
    };

    try {
      setLoading(true);
      const r = await api.post('/transferencias', payload);
      onCreated?.(r.data);
      onClose?.();
    } catch (e) {
      const msg = e?.response?.data?.error || e?.response?.data?.detalle || 'Error al crear transferencia';
      // si devuelve faltantes, los mostramos bonito
      const falt = e?.response?.data?.faltantes;
      if (Array.isArray(falt) && falt.length) {
        setError(`${msg}\n${falt.map(f => `${f.codigo}: requerido ${f.requerido} / disponible ${f.disponible}`).join('\n')}`);
      } else {
        setError(msg);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay">
      <div className="modal-content" style={{ maxWidth: 920 }}>
        <h3>Nueva Transferencia</h3>

        {error && <div className="error-message" style={{ whiteSpace: 'pre-line' }}>{error}</div>}

        <div className="nt-row" style={{ gap: 12 }}>
          <div className="nt-field" style={{ flex: 1 }}>
            <label>Depósito Origen</label>
            <select value={origenId} onChange={e => { setOrigenId(e.target.value); setUbicOrigenId(''); }}>
              <option value="">-- Seleccionar --</option>
              {depositos.map(d => (
                <option key={d.id_deposito} value={d.id_deposito}>{d.nombre}</option>
              ))}
            </select>
          </div>

          <div className="nt-field" style={{ flex: 1 }}>
            <label>Ubicación Origen</label>
            <select value={ubicOrigenId} onChange={e => setUbicOrigenId(e.target.value)} disabled={!toInt(origenId)}>
              <option value="">-- Seleccionar --</option>
              {ubicOrigenList.map(u => (
                <option key={u.id_ubicacion} value={u.id_ubicacion}>{u.nombre}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="nt-row" style={{ gap: 12, marginTop: 10 }}>
          <div className="nt-field" style={{ flex: 1 }}>
            <label>Depósito Destino</label>
            <select value={destinoId} onChange={e => { setDestinoId(e.target.value); setUbicDestinoId(''); }}>
              <option value="">-- Seleccionar --</option>
              {depositos.map(d => (
                <option key={d.id_deposito} value={d.id_deposito}>{d.nombre}</option>
              ))}
            </select>
          </div>

          <div className="nt-field" style={{ flex: 1 }}>
            <label>Ubicación Destino</label>
            <select value={ubicDestinoId} onChange={e => setUbicDestinoId(e.target.value)} disabled={!toInt(destinoId)}>
              <option value="">-- Seleccionar --</option>
              {ubicDestinoList.map(u => (
                <option key={u.id_ubicacion} value={u.id_ubicacion}>{u.nombre}</option>
              ))}
            </select>
          </div>
        </div>

        <hr style={{ margin: '14px 0' }} />

        <h4>Ítems</h4>
        <div className="tabla-articulos-container">
          <table className="tabla-transferencias">
            <thead>
              <tr>
                <th style={{ width: 220 }}>Código</th>
                <th style={{ width: 160, textAlign: 'right' }}>Cantidad</th>
                <th style={{ width: 120 }}>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {items.map((it, idx) => (
                <tr key={idx}>
                  <td>
                    <input
                      value={it.codigo}
                      onChange={e => updateItem(idx, 'codigo', e.target.value)}
                      placeholder="CODIGO"
                    />
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    <input
                      type="number"
                      value={it.cantidad}
                      onChange={e => updateItem(idx, 'cantidad', e.target.value)}
                      min={1}
                      style={{ textAlign: 'right' }}
                    />
                  </td>
                  <td>
                    <button className="btn-secondary" onClick={() => removeItem(idx)} disabled={items.length === 1}>
                      Quitar
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div style={{ marginTop: 10, display: 'flex', gap: 10, justifyContent: 'space-between' }}>
          <button className="btn-secondary" onClick={addItem}>+ Agregar ítem</button>

          <div style={{ display: 'flex', gap: 10 }}>
            <button className="btn-secondary" onClick={onClose} disabled={loading}>Cancelar</button>
            <button className="btn-primary" onClick={submit} disabled={loading || !canSubmit}>
              {loading ? 'Creando...' : 'Crear Transferencia'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default TransferenciaForm;
