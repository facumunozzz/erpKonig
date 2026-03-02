import React, { useEffect, useState } from 'react';
import api from '../api/axiosConfig';
import * as XLSX from 'xlsx';
import './../styles/transferencias.css';

function Movimientos() {

  const [rows, setRows] = useState([]);
  const [filtered, setFiltered] = useState([]);

  // paginado PRO
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [gotoPage, setGotoPage] = useState("");

  const [filtros, setFiltros] = useState({
    fecha: '',
    codigo: '',
    descripcion: '',
    cantidad: '',
    deposito: '',
    usuario: '',
    movimiento: '',
    num_movimiento: '',
  });

  useEffect(() => {
    api.get('/movimientos')
      .then(res => {
        setRows(res.data || []);
        setFiltered(res.data || []);
      })
      .catch(err => console.error(err));
  }, []);

  const onFilterChange = (key, val) => {
    const value = (val ?? '').toLowerCase();
    const nf = { ...filtros, [key]: value };
    setFiltros(nf);

    const f = (rows || []).filter(r => {
      const v = {
        fecha: r.fecha ? new Date(r.fecha).toLocaleString('es-AR') : '',
        codigo: r.codigo ?? '',
        descripcion: r.descripcion ?? '',
        cantidad: String(r.cantidad ?? ''),
        deposito: r.deposito ?? '',
        usuario: r.usuario ?? '',
        movimiento: r.movimiento ?? '',
        num_movimiento: r.num_movimiento ?? '',
      };
      return Object.keys(nf).every(k =>
        String(v[k]).toLowerCase().includes(nf[k])
      );
    });

    setFiltered(f);
    setCurrentPage(1);
  };

  // =======================
  // Paginado PRO
  // =======================
  const totalPages = Math.ceil(filtered.length / pageSize) || 1;

  const paginated = filtered.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize
  );

  const irPagina = (p) => {
    if (p < 1 || p > totalPages) return;
    setCurrentPage(p);
  };

  const from = (currentPage - 1) * pageSize + 1;
  const to = Math.min(currentPage * pageSize, filtered.length);

  // ===== Exportar a Excel =====
  const exportarExcel = () => {
    const data = (filtered.length ? filtered : rows).map(r => ({
      Fecha: r.fecha ? new Date(r.fecha).toLocaleString('es-AR') : '',
      Código: r.codigo ?? '',
      Descripción: r.descripcion ?? '',
      Cantidad: r.cantidad ?? '',
      Depósito: r.deposito ?? '',
      Usuario: r.usuario ?? '',
      Movimiento: r.movimiento ?? '',
      'Num. Movimiento': r.num_movimiento ?? '',
    }));

    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Movimientos');
    XLSX.writeFile(wb, 'movimientos.xlsx');
  };

  return (
    <div className="transferencias-page">
      <h2 className="module-title">Movimientos</h2>

      <div className="acciones" style={{ marginBottom: 12, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button onClick={exportarExcel}>Exportar a Excel</button>
      </div>

      <div className="tabla-articulos-container">
        <table className="tabla-movimientos">
          <thead>
            <tr>
              <th>Fecha<br /><input onChange={e => onFilterChange('fecha', e.target.value)} /></th>
              <th>Código<br /><input onChange={e => onFilterChange('codigo', e.target.value)} /></th>
              <th>Descripción<br /><input onChange={e => onFilterChange('descripcion', e.target.value)} /></th>
              <th style={{ textAlign: 'right' }}>Cantidad<br /><input onChange={e => onFilterChange('cantidad', e.target.value)} /></th>
              <th>Depósito<br /><input onChange={e => onFilterChange('deposito', e.target.value)} /></th>
              <th>Usuario<br /><input onChange={e => onFilterChange('usuario', e.target.value)} /></th>
              <th>Movimiento<br /><input onChange={e => onFilterChange('movimiento', e.target.value)} /></th>
              <th>Num. Movimiento<br /><input onChange={e => onFilterChange('num_movimiento', e.target.value)} /></th>
            </tr>
          </thead>
          <tbody>
            {paginated.length === 0 ? (
              <tr><td colSpan={8}>Sin movimientos.</td></tr>
            ) : paginated.map((r, i) => (
              <tr key={i}>
                <td>{r.fecha ? new Date(r.fecha).toLocaleString('es-AR') : ''}</td>
                <td>{r.codigo}</td>
                <td>{r.descripcion}</td>
                <td style={{ textAlign: 'right' }}>{r.cantidad}</td>
                <td>{r.deposito}</td>
                <td>{r.usuario ?? ''}</td>
                <td>{r.movimiento}</td>
                <td>{r.num_movimiento}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* =========================
           PAGINADO PRO
         ========================= */}
      <div className="paginado-pro">

        <div className="paginado-info">
          Mostrando {from}-{to} de {filtered.length}
        </div>

        <div className="paginado-size">
          <select
            value={pageSize}
            onChange={e => { setPageSize(Number(e.target.value)); setCurrentPage(1); }}
          >
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
              if (e.key === "Enter") {
                irPagina(Number(gotoPage));
                setGotoPage("");
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
                  className={`pg-btn ${currentPage === p ? "activo" : ""}`}
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

export default Movimientos;
