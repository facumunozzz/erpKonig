// src/components/TransferenciaDetalle.jsx
import React, { useEffect, useState } from 'react';
import PropTypes from 'prop-types';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../api/axiosConfig';
import './../styles/transferencias.css';

function TransferenciaDetalle({ transferenciaId: propId }) {
  const params = useParams();
  const navigate = useNavigate();

  const id = Number(propId ?? params.id); // soporta prop o /transferencias/:id

  const [cabecera, setCabecera] = useState(null);
  const [detalle, setDetalle] = useState([]);
  const [filtered, setFiltered] = useState([]);
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 25;

  useEffect(() => {
    if (!Number.isFinite(id)) return;
    api.get(`/transferencias/${id}`)
      .then(res => {
        const { cabecera, detalle } = res.data || {};
        setCabecera(cabecera || null);
        setDetalle(detalle || []);
        setFiltered(detalle || []);
        setCurrentPage(1);
      })
      .catch(err => console.error(err));
  }, [id]);

  const handleFilter = (e, key) => {
    const value = e.target.value.toLowerCase();
    setFiltered(
      (detalle || []).filter(item =>
        String(item?.[key] ?? '').toLowerCase().includes(value)
      )
    );
    setCurrentPage(1);
  };

  const paginated = filtered.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);
  const totalPages = Math.ceil((filtered.length || 0) / itemsPerPage);

  if (!Number.isFinite(id)) return null;

  return (
    <div className="detalle-transferencia">
      <div className="nt-header" style={{ marginBottom: 12 }}>
        <h3 className="module-title" style={{ margin: 0 }}>
          Detalle de Transferencia #{id}
        </h3>
        <button className="nt-volver" onClick={() => navigate('/transferencias')}>← Volver</button>
      </div>

      {/* Cabecera */}
      {cabecera && (
        <div className="nt-card" style={{ marginBottom: 16 }}>
          <div className="nt-row">
            <div className="nt-field">
              <label>Nro Transferencia</label>
              <input value={cabecera.numero_transferencia ?? id} readOnly />
            </div>
            <div className="nt-field">
              <label>Fecha</label>
              <input
                value={cabecera.fecha ? new Date(cabecera.fecha).toLocaleString('es-AR') : ''}
                readOnly
              />
            </div>
            <div className="nt-field">
              <label>Origen</label>
              <input value={cabecera.origen ?? ''} readOnly />
            </div>
            <div className="nt-field">
              <label>Destino</label>
              <input value={cabecera.destino ?? ''} readOnly />
            </div>
          </div>
        </div>
      )}

      {/* Detalle */}
      <div className="nt-card">
        <h4>Ítems</h4>
        <div className="tabla-articulos-container">
          <table className="tabla-transferencias">
            <thead>
              <tr>
                <th>
                  Código<br />
                  <input type="text" onChange={e => handleFilter(e, 'codigo')} placeholder="Filtrar" />
                </th>
                <th>
                  Descripción<br />
                  <input type="text" onChange={e => handleFilter(e, 'descripcion')} placeholder="Filtrar" />
                </th>
                <th style={{ textAlign: 'right' }}>
                  Cantidad<br />
                  <input type="text" onChange={e => handleFilter(e, 'cantidad')} placeholder="Filtrar" />
                </th>
              </tr>
            </thead>
            <tbody>
              {paginated.length === 0 ? (
                <tr><td colSpan="3">Sin ítems.</td></tr>
              ) : paginated.map((item, idx) => (
                <tr key={idx}>
                  <td>{item.codigo}</td>
                  <td>{item.descripcion}</td>
                  <td style={{ textAlign: 'right' }}>{item.cantidad}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="paginado">
          {Array.from({ length: totalPages }, (_, i) => (
            <button
              key={i}
              className={currentPage === i + 1 ? 'activo' : ''}
              onClick={() => setCurrentPage(i + 1)}
            >
              {i + 1}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

TransferenciaDetalle.propTypes = {
  transferenciaId: PropTypes.oneOfType([PropTypes.number, PropTypes.string]),
};

export default TransferenciaDetalle;
