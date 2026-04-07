import { useMemo, useState } from "react";
import ObraDashboardCard from "./ObraDashboardCard";
import "./styles/Dashboard.css";

const STORAGE_KEY = "obras_ocultas_dashboard";

function readHidden() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

function saveHidden(arr) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(arr));
}

export default function Dashboard({ obras = [], onRefresh }) {
  const [hiddenObras, setHiddenObras] = useState(readHidden);
  const [search, setSearch] = useState("");
  const [filtroCumplimiento, setFiltroCumplimiento] = useState("TODOS");

  const obrasSeguras = Array.isArray(obras) ? obras : [];

  const visibles = useMemo(() => {
    return obrasSeguras.filter((o) => !hiddenObras.includes(o.obra));
  }, [obrasSeguras, hiddenObras]);

  const visiblesFiltradas = useMemo(() => {
    const texto = search.trim().toLowerCase();

    return visibles.filter((o) => {
      const obraTexto = String(o?.obra || "").toLowerCase();
      const cumplimiento = Number(o?.cumplimiento || 0);

      const cumpleBusqueda = !texto || obraTexto.includes(texto);

      let cumpleFiltroCumplimiento = true;

      switch (filtroCumplimiento) {
        case "COMPLETADAS":
          cumpleFiltroCumplimiento = cumplimiento >= 100;
          break;
        case "ALTA":
          cumpleFiltroCumplimiento = cumplimiento >= 80 && cumplimiento < 100;
          break;
        case "MEDIA":
          cumpleFiltroCumplimiento = cumplimiento >= 50 && cumplimiento < 80;
          break;
        case "BAJA":
          cumpleFiltroCumplimiento = cumplimiento < 50;
          break;
        default:
          cumpleFiltroCumplimiento = true;
      }

      return cumpleBusqueda && cumpleFiltroCumplimiento;
    });
  }, [visibles, search, filtroCumplimiento]);

  function ocultarObra(obra) {
    const next = [...new Set([...hiddenObras, obra])];
    setHiddenObras(next);
    saveHidden(next);
  }

  function restaurarOcultas() {
    setHiddenObras([]);
    saveHidden([]);
  }

  return (
    <div className="dashboard-container">
      <div className="header-logos">
        <h1>Estado de Obras</h1>
      </div>

      <div className="dashboard-toolbar">
        <p>
          Mostrando <strong>{visiblesFiltradas.length}</strong> obras
          {hiddenObras.length > 0 && (
            <>
              {" "}
              | Ocultas: <strong>{hiddenObras.length}</strong>
            </>
          )}
        </p>

        <div className="dashboard-toolbar-actions">
          <input
            type="text"
            placeholder="Buscar código/obra..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="dashboard-search-input"
          />

          <select
            value={filtroCumplimiento}
            onChange={(e) => setFiltroCumplimiento(e.target.value)}
            className="dashboard-select"
          >
            <option value="TODOS">Cumplimiento: Todos</option>
            <option value="COMPLETADAS">Completadas</option>
            <option value="ALTA">Alta (80% a 99%)</option>
            <option value="MEDIA">Media (50% a 79%)</option>
            <option value="BAJA">Baja (0% a 49%)</option>
          </select>

          <button
            type="button"
            onClick={() => {
              setSearch("");
              setFiltroCumplimiento("TODOS");
            }}
            className="dashboard-clear-btn"
          >
            Limpiar filtros
          </button>

          <button
            type="button"
            onClick={restaurarOcultas}
            className="dashboard-restore-btn"
            disabled={hiddenObras.length === 0}
          >
            Mostrar obras ocultas
          </button>

          <button
            type="button"
            onClick={onRefresh}
            className="dashboard-refresh-btn"
          >
            Actualizar
          </button>
        </div>
      </div>

      <div className="dashboard">
        {visiblesFiltradas.length === 0 ? (
          <p>No hay obras para mostrar.</p>
        ) : (
          visiblesFiltradas.map((obra) => (
            <ObraDashboardCard
              key={obra.id || obra.obra}
              obra={obra}
              onHide={ocultarObra}
            />
          ))
        )}
      </div>
    </div>
  );
}