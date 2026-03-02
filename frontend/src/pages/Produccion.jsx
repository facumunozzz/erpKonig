import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api/axiosConfig';
import './../styles/articulos.css';

export default function Produccion() {
  const navigate = useNavigate();

  const [articulos, setArticulos] = useState([]);
  const [filtered, setFiltered] = useState([]);

  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [goTo, setGoTo] = useState("");

  // 🔁 Filtros reales según dbo.articulos
  const [filtros, setFiltros] = useState({
    codigo: '',
    descripcion: '',
    folio: '',
    proveedor: '',
    ubicacion: '',
    cantidad: '',
    punto_pedido: '',
    traspasa: '',
    almacen: '',
    tipo: ''
  });

  const [seleccion, setSeleccion] = useState(null);
  const [formula, setFormula] = useState([]);
  const [loadingFormula, setLoadingFormula] = useState(false);
  const [errorFormula, setErrorFormula] = useState('');

  useEffect(() => {
    api.get('/articulos')
      .then(res => {
        setArticulos(res.data || []);
        setFiltered(res.data || []);
      })
      .catch(err => console.error(err));
  }, []);

  const onFilterChange = (key, val) => {
    const nf = { ...filtros, [key]: (val ?? '').toLowerCase() };
    setFiltros(nf);
    const f = (articulos || []).filter(a =>
      Object.keys(nf).every(k =>
        String(a[k] ?? '').toLowerCase().includes(nf[k])
      )
    );
    setFiltered(f);
    setCurrentPage(1);
  };

  // ================= PAGINADO PRO =================
  const totalItems = filtered.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));

  const paginated = filtered.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize
  );

  const clampPage = (p) => {
    const n = Number(p);
    if (!Number.isFinite(n)) return 1;
    return Math.min(Math.max(1, n), totalPages);
  };

  const gotoPage = (p) => setCurrentPage(clampPage(p));

  const buildPageButtons = () => {
    const pages = [];
    const windowSize = 2;

    const start = Math.max(2, currentPage - windowSize);
    const end = Math.min(totalPages - 1, currentPage + windowSize);

    pages.push(1);
    if (start > 2) pages.push("…");

    for (let p = start; p <= end; p++) pages.push(p);

    if (end < totalPages - 1) pages.push("…");
    if (totalPages > 1) pages.push(totalPages);

    return pages;
  };

  const pageButtons = buildPageButtons();

  const verFormula = async (art) => {
    setSeleccion({ cod_articulo: art.codigo, descripcion: art.descripcion });
    setLoadingFormula(true);
    setErrorFormula('');
    setFormula([]);
    try {
      const res = await api.get(`/produccion/formulas/${encodeURIComponent(art.codigo)}`);
      const detalle = Array.isArray(res.data?.detalle) ? res.data.detalle : [];
      setFormula(detalle);
      setErrorFormula(detalle.length === 0 ? 'No existe fórmula para este código' : '');
    } catch (err) {
      const msg = err?.response?.data?.error || err.message || 'Error al obtener la fórmula';
      setErrorFormula(msg);
    } finally {
      setLoadingFormula(false);
    }
  };

  return (
    <div className="articulos-container">
      <h2 className="module-title">Fórmulas de Producción</h2>

      <div className="acciones" style={{ marginBottom: 12, display: 'flex', gap: 8 }}>
        <button onClick={() => navigate('/produccion/crear')}>Crear fórmula</button>
        <button onClick={() => navigate('/produccion/editar')}>Editar fórmula</button>
      </div>

      {/* ================= TABLA ================= */}
      <div className="tabla-articulos-container">
        <table className="tabla-articulos">
          <thead>
            <tr>
              <th>Código<br /><input onChange={e => onFilterChange('codigo', e.target.value)} /></th>
              <th>Descripción<br /><input onChange={e => onFilterChange('descripcion', e.target.value)} /></th>
              <th>Folio<br /><input onChange={e => onFilterChange('folio', e.target.value)} /></th>
              <th>Proveedor<br /><input onChange={e => onFilterChange('proveedor', e.target.value)} /></th>
              <th>Tipo<br /><input onChange={e => onFilterChange('tipo', e.target.value)} /></th>
            </tr>
          </thead>
          <tbody>
            {paginated.length === 0 ? (
              <tr><td colSpan={5}>Sin artículos.</td></tr>
            ) : paginated.map((a, idx) => (
              <tr key={idx} style={{ cursor: 'pointer' }} onClick={() => verFormula(a)}>
                <td>{a.codigo}</td>
                <td>{a.descripcion}</td>
                <td>{a.folio}</td>
                <td>{a.proveedor}</td>
                <td>{a.tipo}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ================= PAGINADO PRO ================= */}
      <div className="paginado-pro">

        <div className="paginado-info">
          Total <b>{totalItems}</b> resultados
        </div>

        <div className="paginado-info">
          Pág. <b>{currentPage}</b>/<b>{totalPages}</b>
        </div>

        <div className="paginado-size">
          <select
            value={pageSize}
            onChange={e => {
              setPageSize(Number(e.target.value));
              setCurrentPage(1);
            }}
          >
            <option value={10}>10 / pág</option>
            <option value={25}>25 / pág</option>
            <option value={50}>50 / pág</option>
            <option value={100}>100 / pág</option>
          </select>
        </div>

        <div className="paginado-goto">
          <span>Ir a</span>
          <input
            value={goTo}
            onChange={e => setGoTo(e.target.value.replace(/[^\d]/g, ""))}
            onKeyDown={e => e.key === "Enter" && gotoPage(goTo)}
          />
        </div>

        <div className="paginado-botones">
          <button className="pg-btn" onClick={() => gotoPage(1)} disabled={currentPage === 1}>«</button>
          <button className="pg-btn" onClick={() => gotoPage(currentPage - 1)} disabled={currentPage === 1}>‹</button>

          {pageButtons.map((p, i) =>
            p === "…" ? (
              <span key={i} className="pg-dots">…</span>
            ) : (
              <button
                key={p}
                className={`pg-btn ${currentPage === p ? "activo" : ""}`}
                onClick={() => gotoPage(p)}
              >
                {p}
              </button>
            )
          )}

          <button className="pg-btn" onClick={() => gotoPage(currentPage + 1)} disabled={currentPage === totalPages}>›</button>
          <button className="pg-btn" onClick={() => gotoPage(totalPages)} disabled={currentPage === totalPages}>»</button>
        </div>
      </div>

      {/* ================= FORMULA ================= */}
      <div className="nt-card" style={{ marginTop: 16 }}>
        <h3>
          {seleccion
            ? `Fórmula para ${seleccion.cod_articulo} — ${seleccion.descripcion}`
            : 'Seleccioná un artículo para ver su fórmula'}
        </h3>

        {loadingFormula && <div>Cargando fórmula…</div>}
        {!loadingFormula && seleccion && (
          errorFormula ? <div className="nt-error">{errorFormula}</div> :
            <table className="tabla-articulos">
              <thead>
                <tr>
                  <th>Componente</th>
                  <th>Descripción</th>
                  <th style={{ textAlign: 'right' }}>Cantidad</th>
                </tr>
              </thead>
              <tbody>
                {formula.map((c, i) => (
                  <tr key={i}>
                    <td>{c.cod_articulo}</td>
                    <td>{c.descripcion}</td>
                    <td style={{ textAlign: 'right' }}>{c.cantidad}</td>
                  </tr>
                ))}
              </tbody>
            </table>
        )}
      </div>

    </div>
  );
}
