import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import api from "../api/axiosConfig";
import "./excelFilters.css";

export default function ServerExcelFilterButton({
  columnKey,
  label,
  filters,
  setFilters,
  sortState,
  setSortState,
  onApply,
}) {
  const [open, setOpen] = useState(false);
  const [menuPos, setMenuPos] = useState({ top: 0, left: 0, width: 285 });

  const [search, setSearch] = useState("");
  const [values, setValues] = useState([]);
  const [selected, setSelected] = useState([]);
  const [loading, setLoading] = useState(false);

  const btnRef = useRef(null);
  const menuRef = useRef(null);
  const searchTimerRef = useRef(null);

  const currentFilter = filters[columnKey];
  const isActive = Boolean(currentFilter) || sortState.key === columnKey;

  const cargarValores = async (searchText = "") => {
    try {
      setLoading(true);

      const res = await api.get("/movimientos/distinct", {
        params: {
          column: columnKey,
          search: searchText,
          filters: JSON.stringify(filters),
        },
        timeout: 120000,
      });

      setValues(Array.isArray(res.data) ? res.data : []);
    } catch (err) {
      console.error("Error cargando valores del filtro:", err);
      setValues([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!open) return;

    const r = btnRef.current?.getBoundingClientRect();

    if (r) {
      setMenuPos({
        top: r.bottom + 4,
        left: Math.min(r.left, window.innerWidth - 310),
        width: 285,
      });
    }

    const actual = filters[columnKey];

    if (actual?.mode === "in" && Array.isArray(actual.values)) {
      setSelected(actual.values.map((x) => String(x ?? "")));
      setSearch("");
      cargarValores("");
    } else if (actual?.mode === "contains") {
      setSelected([]);
      setSearch(actual.value || "");
      cargarValores(actual.value || "");
    } else {
      setSelected([]);
      setSearch("");
      cargarValores("");
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;

    const onMouseDown = (e) => {
      if (btnRef.current?.contains(e.target)) return;
      if (menuRef.current?.contains(e.target)) return;
      setOpen(false);
    };

    const onKeyDown = (e) => {
      if (e.key === "Escape") setOpen(false);
    };

    document.addEventListener("mousedown", onMouseDown);
    document.addEventListener("keydown", onKeyDown);

    return () => {
      document.removeEventListener("mousedown", onMouseDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const toggleValue = (value) => {
    const v = String(value ?? "");

    setSelected((prev) => {
      if (prev.includes(v)) {
        return prev.filter((x) => x !== v);
      }

      return [...prev, v];
    });
  };

  const toggleAll = () => {
    const allValues = values.map((v) => String(v.value ?? ""));

    const allSelected =
      allValues.length > 0 && allValues.every((v) => selected.includes(v));

    if (allSelected) {
      setSelected([]);
    } else {
      setSelected(allValues);
    }
  };

  const aplicar = () => {
    setFilters((prev) => {
      const next = { ...prev };

      if (selected.length > 0) {
        next[columnKey] = {
          mode: "in",
          values: selected,
        };
      } else if (search.trim()) {
        next[columnKey] = {
          mode: "contains",
          value: search.trim(),
        };
      } else {
        delete next[columnKey];
      }

      return next;
    });

    setOpen(false);
    onApply?.();
  };

  const limpiar = () => {
    setFilters((prev) => {
      const next = { ...prev };
      delete next[columnKey];
      return next;
    });

    setSearch("");
    setSelected([]);
    setOpen(false);
    onApply?.();
  };

  const ordenarAsc = () => {
    setSortState({ key: columnKey, dir: "asc" });
    setOpen(false);
    onApply?.();
  };

  const ordenarDesc = () => {
    setSortState({ key: columnKey, dir: "desc" });
    setOpen(false);
    onApply?.();
  };

  const onSearchChange = (value) => {
    setSearch(value);

    if (searchTimerRef.current) {
      clearTimeout(searchTimerRef.current);
    }

    searchTimerRef.current = setTimeout(() => {
      cargarValores(value);
    }, 350);
  };

  const allVisibleSelected =
    values.length > 0 &&
    values.every((v) => selected.includes(String(v.value ?? "")));

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        className={`excel-filter-trigger ${isActive ? "active" : ""}`}
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        title={`Filtrar ${label}`}
      >
        ▼
      </button>

      {open &&
        createPortal(
          <div
            ref={menuRef}
            className="excel-filter-menu"
            style={{
              top: menuPos.top,
              left: menuPos.left,
              width: menuPos.width,
            }}
          >
            <button
              type="button"
              className="excel-filter-action"
              onClick={ordenarAsc}
            >
              Ordenar de A a Z
            </button>

            <button
              type="button"
              className="excel-filter-action"
              onClick={ordenarDesc}
            >
              Ordenar de Z a A
            </button>

            <button
              type="button"
              className="excel-filter-action"
              onClick={limpiar}
            >
              Limpiar filtro de &quot;{label}&quot;
            </button>

            <div className="excel-filter-search">
              <input
                value={search}
                onChange={(e) => onSearchChange(e.target.value)}
                placeholder="Buscar"
                autoFocus
              />
            </div>

            <div className="excel-filter-checks">
              {loading && <div className="excel-filter-empty">Cargando...</div>}

              {!loading && (
                <>
                  <label className="excel-filter-check">
                    <input
                      type="checkbox"
                      checked={allVisibleSelected}
                      onChange={toggleAll}
                    />
                    <span>(Seleccionar todo)</span>
                  </label>

                  {values.map((v) => {
                    const value = String(v.value ?? "");

                    return (
                      <label
                        key={value || "__EMPTY__"}
                        className="excel-filter-check"
                      >
                        <input
                          type="checkbox"
                          checked={selected.includes(value)}
                          onChange={() => toggleValue(value)}
                        />
                        <span>{v.label}</span>
                      </label>
                    );
                  })}

                  {!values.length && (
                    <div className="excel-filter-empty">Sin valores</div>
                  )}
                </>
              )}
            </div>

            <div className="excel-filter-footer">
              <button
                type="button"
                className="excel-filter-ok"
                onClick={aplicar}
              >
                Aceptar
              </button>

              <button
                type="button"
                className="excel-filter-cancel"
                onClick={() => setOpen(false)}
              >
                Cancelar
              </button>
            </div>
          </div>,
          document.body
        )}
    </>
  );
}