import React, { useEffect, useMemo, useState } from "react";
import api from "../api/axiosConfig";
import { toast } from "react-toastify";
import "./../styles/observaciones.css";

export default function Observaciones() {
  const [observaciones, setObservaciones] = useState([]);
  const [nuevaObservacion, setNuevaObservacion] = useState("");

  const [loading, setLoading] = useState(false);
  const [guardando, setGuardando] = useState(false);

  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [goTo, setGoTo] = useState("");

  const cargarObservaciones = async () => {
    setLoading(true);

    try {
      const res = await api.get("/observaciones");

      setObservaciones(Array.isArray(res.data) ? res.data : []);
    } catch (err) {
      console.error("Error cargando observaciones:", err);

      toast.error(err.response?.data?.error || "Error al cargar observaciones");

      setObservaciones([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    cargarObservaciones();
  }, []);

  const guardarObservacion = async (e) => {
    e.preventDefault();

    const texto = String(nuevaObservacion || "").trim();

    if (!texto) {
      toast.warning("Ingrese una observación");
      return;
    }

    setGuardando(true);

    try {
      await api.post("/observaciones", {
        observacion: texto,
      });

      toast.success("Observación guardada");

      setNuevaObservacion("");
      setCurrentPage(1);

      await cargarObservaciones();
    } catch (err) {
      console.error("Error guardando observación:", err);

      toast.error(
        err.response?.data?.error || "Error al guardar la observación",
      );
    } finally {
      setGuardando(false);
    }
  };

  const totalItems = observaciones.length;

  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));

  const paginated = useMemo(() => {
    const desde = (currentPage - 1) * pageSize;
    const hasta = desde + pageSize;

    return observaciones.slice(desde, hasta);
  }, [observaciones, currentPage, pageSize]);

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [currentPage, totalPages]);

  const clampPage = (page) => {
    const n = Number(page);

    if (!Number.isFinite(n)) return 1;

    return Math.min(Math.max(1, n), totalPages);
  };

  const gotoPage = (page) => {
    setCurrentPage(clampPage(page));
  };

  const buildPageButtons = () => {
    const pages = [];
    const windowSize = 2;

    const start = Math.max(2, currentPage - windowSize);

    const end = Math.min(totalPages - 1, currentPage + windowSize);

    pages.push(1);

    if (start > 2) {
      pages.push("…");
    }

    for (let p = start; p <= end; p += 1) {
      pages.push(p);
    }

    if (end < totalPages - 1) {
      pages.push("…");
    }

    if (totalPages > 1) {
      pages.push(totalPages);
    }

    return pages;
  };

  const pageButtons = buildPageButtons();

  return (
    <div className="observaciones-container">
      <h2 className="module-title">Observaciones</h2>

      <div className="observaciones-card">
        <div className="observaciones-card-header">
          <div>
            <h3>Nueva observación</h3>
            <p>
              Registre novedades, comentarios o situaciones relacionadas con
              Gestión de Producción.
            </p>
          </div>
        </div>

        <form className="observaciones-form" onSubmit={guardarObservacion}>
          <textarea
            value={nuevaObservacion}
            onChange={(e) => setNuevaObservacion(e.target.value)}
            placeholder="Escriba la observación..."
            rows={4}
            maxLength={4000}
            disabled={guardando}
          />

          <div className="observaciones-form-footer">
            <span className="observaciones-contador">
              {nuevaObservacion.length} / 4000
            </span>

            <button type="submit" className="btn-primario" disabled={guardando}>
              {guardando ? "Guardando..." : "Guardar observación"}
            </button>
          </div>
        </form>
      </div>

      <div className="observaciones-listado">
        <div className="observaciones-listado-header">
          <h3>Historial de observaciones</h3>

          <button
            type="button"
            className="btn-secundario"
            onClick={cargarObservaciones}
            disabled={loading}
          >
            {loading ? "Actualizando..." : "Actualizar"}
          </button>
        </div>

        <div className="tabla-observaciones-container">
          <table className="tabla-observaciones">
            <thead>
              <tr>
                <th className="col-fecha">Fecha</th>
                <th className="col-usuario">Usuario</th>
                <th>Observación</th>
              </tr>
            </thead>

            <tbody>
              {loading && observaciones.length === 0 ? (
                <tr>
                  <td colSpan={3} className="tabla-mensaje">
                    Cargando observaciones...
                  </td>
                </tr>
              ) : paginated.length === 0 ? (
                <tr>
                  <td colSpan={3} className="tabla-mensaje">
                    No hay observaciones registradas.
                  </td>
                </tr>
              ) : (
                paginated.map((item) => (
                  <tr key={item.id_observacion}>
                    <td className="col-fecha">{item.fecha_formateada || ""}</td>

                    <td className="col-usuario">{item.usuario || ""}</td>

                    <td className="col-observacion">
                      {item.observacion || ""}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="paginado-pro">
          <div className="paginado-info">
            Total <b>{totalItems}</b> registros
          </div>

          <div className="paginado-info">
            Pág. <b>{currentPage}</b>/<b>{totalPages}</b>
          </div>

          <div className="paginado-size">
            <select
              value={pageSize}
              onChange={(e) => {
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
              onChange={(e) => setGoTo(e.target.value.replace(/[^\d]/g, ""))}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  gotoPage(goTo);
                }
              }}
            />
          </div>

          <div className="paginado-botones">
            <button
              className="pg-btn"
              onClick={() => gotoPage(1)}
              disabled={currentPage === 1}
            >
              «
            </button>

            <button
              className="pg-btn"
              onClick={() => gotoPage(currentPage - 1)}
              disabled={currentPage === 1}
            >
              ‹
            </button>

            {pageButtons.map((page, index) =>
              page === "…" ? (
                <span key={`dots-${index}`} className="pg-dots">
                  …
                </span>
              ) : (
                <button
                  key={page}
                  className={`pg-btn ${currentPage === page ? "activo" : ""}`}
                  onClick={() => gotoPage(page)}
                >
                  {page}
                </button>
              ),
            )}

            <button
              className="pg-btn"
              onClick={() => gotoPage(currentPage + 1)}
              disabled={currentPage === totalPages}
            >
              ›
            </button>

            <button
              className="pg-btn"
              onClick={() => gotoPage(totalPages)}
              disabled={currentPage === totalPages}
            >
              »
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
