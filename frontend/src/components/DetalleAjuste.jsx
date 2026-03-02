//components/DetalleAjuste
import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../api/axiosConfig';

export default function DetalleAjuste() {
  const { id } = useParams();             // id = numero_ajuste
  const navigate = useNavigate();
  const [cab, setCab] = useState(null);
  const [det, setDet] = useState([]);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancel = false;
    (async () => {
      try {
        setError('');
        const res = await api.get(`/ajustes/${id}`);
        if (cancel) return;
        setCab(res.data?.cabecera || null);
        setDet(res.data?.detalle || []);
      } catch (err) {
        if (cancel) return;
        const msg = err.response?.data?.error || err.message || 'Error al cargar el ajuste';
        setError(msg);
      }
    })();
    return () => { cancel = true; };
  }, [id]);

  return (
    <div className="nueva-transferencia-page">
      <div className="nt-header">
        <h2 className="module-title">Detalle de Ajuste #{id}</h2>
        <button className="nt-volver" onClick={() => navigate('/ajustes')}>← Volver</button>
      </div>

      {error && <div className="nt-error">{error}</div>}

      {cab && (
        <div className="nt-card">
          <div className="nt-row">
            <div className="nt-field">
              <label>Número</label>
              <input type="text" value={cab.numero_ajuste} readOnly />
            </div>
            <div className="nt-field">
              <label>Depósito</label>
              <input type="text" value={cab.deposito} readOnly />
            </div>
            <div className="nt-field">
              <label>Fecha</label>
              <input
                type="text"
                value={cab.fecha ? new Date(cab.fecha).toLocaleString('es-AR') : ''}
                readOnly
              />
            </div>
            <div className="nt-field grow">
              <label>Motivo</label>
              <input type="text" value={cab.motivo || ''} readOnly />
            </div>
          </div>
        </div>
      )}

      <div className="nt-card">
        <h4>Ítems del ajuste</h4>
        <div className="tabla-articulos-container">
          <table className="tabla-articulos">
            <thead>
              <tr>
                <th>Código</th>
                <th>Descripción</th>
                <th style={{ textAlign: 'right' }}>Cantidad</th>
              </tr>
            </thead>
            <tbody>
              {det.length === 0 ? (
                <tr>
                  <td colSpan="3">Este ajuste no tiene ítems.</td>
                </tr>
              ) : (
                det.map((it, idx) => (
                  <tr key={idx}>
                    <td>{it.cod_articulo}</td>
                    <td>{it.descripcion}</td>
                    <td style={{ textAlign: 'right' }}>{it.cantidad}</td>
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
