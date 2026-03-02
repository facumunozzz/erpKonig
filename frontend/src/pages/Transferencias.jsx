// frontend/src/pages/Transferencias.jsx
import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api/axiosConfig';
import './../styles/transferencias.css';

function Transferencias() {
  const navigate = useNavigate();

  const [transferencias, setTransferencias] = useState([]);
  const [filtro, setFiltro] = useState('');

  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [gotoPage, setGotoPage] = useState('');

  const fetchTransferencias = () => {
    api.get('/transferencias')
      .then(res => setTransferencias(res.data || []))
      .catch(err => console.error(err));
  };

  useEffect(() => {
    fetchTransferencias();
  }, []);

  // ==========================
  // Filtro global
  // ==========================
  const transferenciasFiltradas = transferencias.filter(t =>
    Object.values(t).some(val =>
      String(val ?? '').toLowerCase().includes(filtro.toLowerCase())
    )
  );

  // ==========================
  // Paginado
  // ==========================
  const totalPages = Math.ceil(transferenciasFiltradas.length / pageSize) || 1;

  const paginated = transferenciasFiltradas.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize
  );

  const irPagina = p => {
    if (p < 1 || p > totalPages) return;
    setCurrentPage(p);
  };

  const from = (currentPage - 1) * pageSize + 1;
  const to = Math.min(currentPage * pageSize, transferenciasFiltradas.length);

  return (
    <div className="transferencias-page">
      <h2 className="module-title">Transferencias</h2>

      <div className="acciones">
        <button onClick={() => navigate('/transferencias/nueva')}>
          Nueva transferencia
        </button>
        <input
          type="text"
          placeholder="Filtrar transferencias"
          value={filtro}
          onChange={e => { setFiltro(e.target.value); setCurrentPage(1); }}
        />
      </div>

      <table className="tabla-transferencias">
        <thead>
          <tr>
            <th>Fecha</th>
            <th>Origen</th>
            <th>Destino</th>
            <th>Nro Transferencia</th>
          </tr>
        </thead>
        <tbody>
          {paginated.map(t => {
            const id = t.numero_transferencia ?? t.id;
            return (
              <tr
                key={id}
                style={{ cursor: 'pointer' }}
                onClick={() => navigate(`/transferencias/${id}`)}
                title="Ver detalle"
              >
                <td>{t.fecha ? new Date(t.fecha).toLocaleString('es-AR') : ''}</td>
                <td>{t.origen}</td>
                <td>{t.destino}</td>
                <td>{id}</td>
              </tr>
            );
          })}

          {paginated.length === 0 && (
            <tr>
              <td colSpan={4}>Sin transferencias.</td>
            </tr>
          )}
        </tbody>
      </table>

      {/* =========================
           PAGINADO PRO
         ========================= */}
      <div className="paginado-pro">

        <div className="paginado-info">
          Mostrando {from}-{to} de {transferenciasFiltradas.length}
        </div>

        <div className="paginado-size">
          <select value={pageSize} onChange={e => { setPageSize(Number(e.target.value)); setCurrentPage(1); }}>
            <option value={10}>10</option>
            <option value={25}>25</option>
            <option value={50}>50</option>
            <option value={100}>100</option>
          </select>
        </div>

        <div className="paginado-goto">
          Ir a:
          <input
            type="number"
            min="1"
            max={totalPages}
            value={gotoPage}
            onChange={e => setGotoPage(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') {
                irPagina(Number(gotoPage));
                setGotoPage('');
              }
            }}
          />
        </div>

        <div className="paginado-botones">
          <button className="pg-btn" onClick={() => irPagina(1)} disabled={currentPage === 1}>⏮</button>
          <button className="pg-btn" onClick={() => irPagina(currentPage - 1)} disabled={currentPage === 1}>◀</button>

          {Array.from({ length: totalPages }, (_, i) => i + 1)
            .filter(p =>
              p === 1 ||
              p === totalPages ||
              Math.abs(p - currentPage) <= 1
            )
            .map((p, i, arr) => (
              <React.Fragment key={p}>
                {i > 0 && p - arr[i - 1] > 1 && <span className="pg-dots">…</span>}
                <button
                  className={`pg-btn ${currentPage === p ? 'activo' : ''}`}
                  onClick={() => irPagina(p)}
                >
                  {p}
                </button>
              </React.Fragment>
            ))}

          <button className="pg-btn" onClick={() => irPagina(currentPage + 1)} disabled={currentPage === totalPages}>▶</button>
          <button className="pg-btn" onClick={() => irPagina(totalPages)} disabled={currentPage === totalPages}>⏭</button>
        </div>
      </div>
    </div>
  );
}

export default Transferencias;
