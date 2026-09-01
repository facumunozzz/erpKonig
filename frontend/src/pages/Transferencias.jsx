// frontend/src/pages/Transferencias.jsx
import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../api/axiosConfig";
import "./../styles/transferencias.css";
import ReferentesModal from "../components/ReferentesModal";
import {
  useExcelFilters,
  ExcelFilterButton,
} from "../components/ExcelColumnFilter";

const TRANSFERENCIA_COLUMNS = [
  ["fecha", "Fecha"],
  ["fecha_real", "Fecha real"],
  ["origen", "Origen"],
  ["destino", "Destino"],
  ["referente", "Referente"],
  ["remito_referencia", "Remito / Ref."],
  ["numero_transferencia", "Nro Transferencia"],
];

function Transferencias() {
  const navigate = useNavigate();

  const [transferencias, setTransferencias] = useState([]);
  const [filtros, setFiltros] = useState({});
  const [showReferentes, setShowReferentes] = useState(false);

  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [gotoPage, setGotoPage] = useState("");

  const fetchTransferencias = () => {
    api
      .get("/transferencias")
      .then((res) => setTransferencias(res.data || []))
      .catch((err) => console.error(err));
  };

  useEffect(() => {
    fetchTransferencias();
  }, []);

  const getTransferenciaValue = (t, key) => {
    if (key === "fecha") {
      return t.fecha ? new Date(t.fecha).toLocaleString("es-AR") : "";
    }

    if (key === "fecha_real") {
      return t.fecha_real
        ? new Date(t.fecha_real).toLocaleDateString("es-AR")
        : "";
    }

    if (key === "numero_transferencia") {
      return t.numero_transferencia ?? t.id ?? "";
    }

    return t?.[key] ?? "";
  };

  const excelColumns = useMemo(
    () =>
      TRANSFERENCIA_COLUMNS.map(([key, label]) => ({
        key,
        label,
        getValue: (row) => getTransferenciaValue(row, key),
      })),
    [],
  );

  const excel = useExcelFilters(transferencias, excelColumns, {
    onChange: () => setCurrentPage(1),
  });

  // ==========================
  // Filtro global
  // ==========================
  const transferenciasFiltradas = excel.rows.filter((t) =>
    TRANSFERENCIA_COLUMNS.every(([key]) => {
      const filtroColumna = String(filtros[key] ?? "")
        .trim()
        .toLowerCase();

      if (!filtroColumna) {
        return true;
      }

      return String(getTransferenciaValue(t, key) ?? "")
        .toLowerCase()
        .includes(filtroColumna);
    }),
  );

  // ==========================
  // Paginado
  // ==========================
  const totalPages = Math.ceil(transferenciasFiltradas.length / pageSize) || 1;

  const paginated = transferenciasFiltradas.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize,
  );

  const irPagina = (p) => {
    if (p < 1 || p > totalPages) return;
    setCurrentPage(p);
  };

  const from =
    transferenciasFiltradas.length === 0 ? 0 : (currentPage - 1) * pageSize + 1;

  const to = Math.min(currentPage * pageSize, transferenciasFiltradas.length);

  return (
    <div className="transferencias-page">
      <h2 className="module-title">Transferencias</h2>

      <div className="acciones">
        <button onClick={() => navigate("/transferencias/nueva")}>
          Nueva transferencia
        </button>

        <button onClick={() => setShowReferentes(true)}>👤 Actuantes</button>

        <button
          onClick={() => {
            setFiltros({});
            excel.clearAllFilters();
            setCurrentPage(1);
          }}
        >
          Limpiar filtros
        </button>
      </div>

      <table className="tabla-transferencias">
        <thead>
          <tr>
            {TRANSFERENCIA_COLUMNS.map(([key, label]) => (
              <th key={key} style={{ overflow: "visible" }}>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: "6px",
                  }}
                >
                  <span>{label}</span>

                  <ExcelFilterButton
                    columnKey={key}
                    label={label}
                    excel={excel}
                  />
                </div>
              </th>
            ))}
          </tr>

          <tr>
            {TRANSFERENCIA_COLUMNS.map(([key]) => (
              <th key={`filtro-${key}`}>
                <input
                  type="text"
                  value={filtros[key] || ""}
                  placeholder="Filtrar..."
                  onChange={(e) => {
                    setFiltros((prev) => ({
                      ...prev,
                      [key]: e.target.value,
                    }));

                    setCurrentPage(1);
                  }}
                  style={{
                    width: "100%",
                    boxSizing: "border-box",
                    padding: "5px 7px",
                  }}
                />
              </th>
            ))}
          </tr>
        </thead>

        <tbody>
          {paginated.map((t) => {
            const id = t.numero_transferencia ?? t.id;

            return (
              <tr
                key={id}
                style={{ cursor: "pointer" }}
                onClick={() => navigate(`/transferencias/${id}`)}
                title="Ver detalle"
              >
                <td>
                  {t.fecha ? new Date(t.fecha).toLocaleString("es-AR") : ""}
                </td>

                <td>
                  {t.fecha_real
                    ? new Date(t.fecha_real).toLocaleDateString("es-AR")
                    : ""}
                </td>

                <td>{t.origen}</td>
                <td>{t.destino}</td>
                <td>{t.referente || ""}</td>
                <td>{t.remito_referencia || ""}</td>
                <td>{id}</td>
              </tr>
            );
          })}

          {paginated.length === 0 && (
            <tr>
              <td colSpan={7}>Sin transferencias.</td>
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
          <select
            value={pageSize}
            onChange={(e) => {
              setPageSize(Number(e.target.value));
              setCurrentPage(1);
            }}
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
            onChange={(e) => setGotoPage(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                irPagina(Number(gotoPage));
                setGotoPage("");
              }
            }}
          />
        </div>

        <div className="paginado-botones">
          <button
            className="pg-btn"
            onClick={() => irPagina(1)}
            disabled={currentPage === 1}
          >
            ⏮
          </button>

          <button
            className="pg-btn"
            onClick={() => irPagina(currentPage - 1)}
            disabled={currentPage === 1}
          >
            ◀
          </button>

          {Array.from({ length: totalPages }, (_, i) => i + 1)
            .filter(
              (p) =>
                p === 1 || p === totalPages || Math.abs(p - currentPage) <= 1,
            )
            .map((p, i, arr) => (
              <React.Fragment key={p}>
                {i > 0 && p - arr[i - 1] > 1 && (
                  <span className="pg-dots">…</span>
                )}

                <button
                  className={`pg-btn ${currentPage === p ? "activo" : ""}`}
                  onClick={() => irPagina(p)}
                >
                  {p}
                </button>
              </React.Fragment>
            ))}

          <button
            className="pg-btn"
            onClick={() => irPagina(currentPage + 1)}
            disabled={currentPage === totalPages}
          >
            ▶
          </button>

          <button
            className="pg-btn"
            onClick={() => irPagina(totalPages)}
            disabled={currentPage === totalPages}
          >
            ⏭
          </button>
        </div>
      </div>

      <ReferentesModal
        abierto={showReferentes}
        onClose={() => setShowReferentes(false)}
        onChanged={() => {
          fetchTransferencias();
        }}
      />
    </div>
  );
}

export default Transferencias;
