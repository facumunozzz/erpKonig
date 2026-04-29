import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../api/axiosConfig";
import "./../styles/transferencias.css";

export default function Ajustes() {
  const navigate = useNavigate();

  const [ajustes, setAjustes] = useState([]);
  const [filtro, setFiltro] = useState("");

  // Motivos (ABM modal)
  const [showMotivos, setShowMotivos] = useState(false);
  const [motivos, setMotivos] = useState([]);
  const [nuevoMotivo, setNuevoMotivo] = useState("");
  const [motivosError, setMotivosError] = useState("");

  const consumirProduccion = async () => {
    try {
      const res = await api.post("/ajustes/consumir-produccion");
      alert(
        `Proceso finalizado. Ajustados: ${res.data.ajustados || 0}\nFallidos: ${
          res.data.fallidos || 0
        }`
      );
      fetchAjustes();
    } catch (err) {
      alert(err.response?.data?.error || "Error al consumir producción");
    }
  };

  // Paginado
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [gotoPage, setGotoPage] = useState("");

  const fetchAjustes = () => {
    api
      .get("/ajustes")
      .then((res) => setAjustes(res.data || []))
      .catch((err) => console.error(err));
  };

  useEffect(() => {
    fetchAjustes();
  }, []);

  // =========================
  // Descargar plantilla Excel
  // =========================
  const descargarPlantilla = async () => {
    try {
      const res = await api.get("/ajustes/plantilla", { responseType: "blob" });
      const url = window.URL.createObjectURL(res.data);
      const a = document.createElement("a");
      a.href = url;
      a.download = "Plantilla_Ajustes.xlsx";
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error(err);
      alert("Error al descargar la plantilla");
    }
  };

  // =========================
  // Importar Excel
  // =========================
  const importarExcel = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const formData = new FormData();
    formData.append("file", file);

    try {
      await api.post("/ajustes/importar", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      fetchAjustes();
      alert("Ajustes importados correctamente");
    } catch (err) {
      console.error(err);
      const msg =
        err.response?.data?.error ||
        (err.response?.data?.errores ? "Hay errores en el Excel" : null) ||
        "Error al importar ajustes";
      alert(msg);
    } finally {
      e.target.value = "";
    }
  };

  // =========================
  // Motivos ABM
  // =========================
  const fetchMotivos = async () => {
    const res = await api.get("/ajustes/motivos");
    setMotivos(res.data || []);
  };

  const abrirMotivos = async () => {
    // ✅ Abrir SIEMPRE el modal
    setShowMotivos(true);
    setMotivosError("");
    setMotivos([]);
    setNuevoMotivo("");

    // luego intentar cargar; si falla, mostramos el error dentro del modal
    try {
      await fetchMotivos();
    } catch (e) {
      console.error("fetchMotivos:", e);
      setMotivosError(
        e.response?.data?.error ||
          e.message ||
          "No se pudieron cargar los motivos (revisar backend / rutas)."
      );
    }
  };

  const crearMotivo = async () => {
    const n = (nuevoMotivo || "").trim();
    if (!n) return;

    try {
      await api.post("/ajustes/motivos", { nombre: n });
      setNuevoMotivo("");
      await fetchMotivos();
      setMotivosError("");
    } catch (e) {
      alert(e.response?.data?.error || "Error al crear motivo");
    }
  };

  const editarMotivo = async (id, actual) => {
    const nuevo = prompt("Editar motivo:", actual);
    if (nuevo == null) return;
    const n = nuevo.trim();
    if (!n) return;

    try {
      await api.put(`/ajustes/motivos/${id}`, { nombre: n });
      await fetchMotivos();
      setMotivosError("");
    } catch (e) {
      alert(e.response?.data?.error || "Error al editar motivo");
    }
  };

  const toggleMotivo = async (id, activo) => {
    try {
      await api.put(`/ajustes/motivos/${id}`, { activo: !activo });
      await fetchMotivos();
      setMotivosError("");
    } catch (e) {
      alert(e.response?.data?.error || "Error al cambiar estado");
    }
  };

  const borrarMotivo = async (id) => {
    if (!confirm("¿Borrar motivo? (solo si nunca fue usado)")) return;

    try {
      await api.delete(`/ajustes/motivos/${id}`);
      await fetchMotivos();
      setMotivosError("");
    } catch (e) {
      alert(e.response?.data?.error || "Error al borrar motivo");
    }
  };

  // =========================
  // Filtro
  // =========================
  const filtrados = ajustes.filter((a) =>
    Object.values(a).some((v) =>
      String(v ?? "").toLowerCase().includes(filtro.toLowerCase())
    )
  );

  // =========================
  // Paginado
  // =========================
  const totalPages = Math.ceil(filtrados.length / pageSize) || 1;

  const paginated = filtrados.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize
  );

  const irPagina = (p) => {
    if (p < 1 || p > totalPages) return;
    setCurrentPage(p);
  };

  const from = filtrados.length === 0 ? 0 : (currentPage - 1) * pageSize + 1;
  const to = Math.min(currentPage * pageSize, filtrados.length);

  return (
    <div className="transferencias-page">
      <h2 className="module-title">Ajustes</h2>

      <div className="acciones">
        <button onClick={() => navigate("/ajustes/nuevo")}>Nuevo ajuste</button>

        <button onClick={abrirMotivos}>🧾 Motivos</button>

        <button onClick={descargarPlantilla}>📤 Descargar plantilla</button>

        <label style={{ cursor: "pointer" }}>
          📥 Importar Excel
          <input
            type="file"
            accept=".xlsx,.xls"
            onChange={importarExcel}
            style={{ display: "none" }}
          />
        </label>

        <input
          type="text"
          placeholder="Filtrar ajustes"
          value={filtro}
          onChange={(e) => {
            setFiltro(e.target.value);
            setCurrentPage(1);
          }}
        />

      <button className="btn-primary btn-ajuste-produccion" onClick={consumirProduccion}>
        ⚙️ Ajustar Registro de Producción
      </button>

      </div>

      <table className="tabla-transferencias">
        <thead>
          <tr>
            <th>Fecha</th>
            <th>Depósito</th>
            <th>Motivo</th>
            <th>Nro Ajuste</th>
          </tr>
        </thead>
        <tbody>
          {paginated.map((a) => {
            const id = a.numero_ajuste ?? a.id;
            return (
              <tr
                key={id}
                style={{ cursor: "pointer" }}
                onClick={() => navigate(`/ajustes/${id}`)}
                title="Ver detalle"
              >
                <td>{a.fecha ? new Date(a.fecha).toLocaleString("es-AR") : ""}</td>
                <td>{a.deposito}</td>
                <td>{a.motivo || ""}</td>
                <td>{id}</td>
              </tr>
            );
          })}

          {paginated.length === 0 && (
            <tr>
              <td colSpan={4}>Sin ajustes.</td>
            </tr>
          )}
        </tbody>
      </table>

      <div className="paginado-pro">
        <div className="paginado-info">
          Mostrando {from}-{to} de {filtrados.length}
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
          <button className="pg-btn" onClick={() => irPagina(1)} disabled={currentPage === 1}>
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
            .filter((p) => p === 1 || p === totalPages || Math.abs(p - currentPage) <= 1)
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

      {/* =========================
           MODAL MOTIVOS
         ========================= */}
      {showMotivos && (
        <div
          className="modal-backdrop"
          style={{ position: "fixed", inset: 0, zIndex: 999999 }}
          onMouseDown={(e) => {
            // cerrar si clickeás el fondo
            if (e.target.classList.contains("modal-backdrop")) setShowMotivos(false);
          }}
        >
          <div className="modal-card" style={{ position: "relative", zIndex: 999999 }}>
            <div className="modal-head">
              <h3>Motivos de Ajuste</h3>
              <button onClick={() => setShowMotivos(false)}>✕</button>
            </div>

            {motivosError && (
              <div className="nt-error" style={{ marginTop: 10 }}>
                {motivosError}
              </div>
            )}

            <div className="modal-row">
              <input
                value={nuevoMotivo}
                onChange={(e) => setNuevoMotivo(e.target.value)}
                placeholder="Nuevo motivo…"
              />
              <button className="btn-primary" onClick={crearMotivo}>
                Agregar
              </button>
              <button onClick={fetchMotivos}>↻ Recargar</button>
            </div>

            <div style={{ maxHeight: 420, overflow: "auto", marginTop: 10 }}>
              <table className="tabla-transferencias">
                <thead>
                  <tr>
                    <th>Nombre</th>
                    <th>Activo</th>
                    <th>Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {motivos.map((m) => (
                    <tr key={m.id_motivo}>
                      <td>{m.nombre}</td>
                      <td>{m.activo ? "SI" : "NO"}</td>
                      <td style={{ display: "flex", gap: 8 }}>
                        <button className="borrar-btn" onClick={() => borrarMotivo(m.id_motivo)}>
                          Borrar
                        </button>
                      </td>
                    </tr>
                  ))}
                  {motivos.length === 0 && (
                    <tr>
                      <td colSpan={3}>Sin motivos.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className="modal-foot">
              <button onClick={() => setShowMotivos(false)}>Cerrar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}