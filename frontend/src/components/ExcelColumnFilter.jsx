import React, { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import "./excelFilters.css";

const norm = (v) =>
  String(v ?? "")
    .trim()
    .toLowerCase();

const displayValue = (v) => {
  if (v === null || v === undefined || v === "") return "(Vacíos)";
  return String(v);
};

const rawKey = (v) => {
  if (v === null || v === undefined || v === "") return "__EMPTY__";
  return String(v);
};

function compareValues(a, b, dir) {
  const av = String(a ?? "").toLowerCase();
  const bv = String(b ?? "").toLowerCase();

  const an = Number(av.replace(",", "."));
  const bn = Number(bv.replace(",", "."));

  let result;

  if (!Number.isNaN(an) && !Number.isNaN(bn) && av !== "" && bv !== "") {
    result = an - bn;
  } else {
    result = av.localeCompare(bv, "es", { numeric: true });
  }

  return dir === "desc" ? -result : result;
}

export function useExcelFilters(rows, columns, options = {}) {
  const [filters, setFilters] = useState({});
  const [sort, setSort] = useState(null);

  const getColumn = (key) => columns.find((c) => c.key === key);

  const getValue = (row, key) => {
    const col = getColumn(key);
    if (col?.getValue) return col.getValue(row);
    return row?.[key];
  };

  const applyFilters = (sourceRows, exceptKey = null) => {
    return (sourceRows || []).filter((row) => {
      return Object.entries(filters).every(([key, filter]) => {
        if (key === exceptKey) return true;
        if (!filter) return true;

        const value = getValue(row, key);
        const valueText = norm(displayValue(value));
        const valueKey = rawKey(value);

        const search = norm(filter.search);

        if (search && !valueText.includes(search)) return false;

        if (filter.selectedKeys && filter.selectedKeys.length > 0) {
          return filter.selectedKeys.includes(valueKey);
        }

        return true;
      });
    });
  };

  const filteredRows = useMemo(() => {
    let out = applyFilters(rows);

    if (sort?.key) {
      out = [...out].sort((a, b) =>
        compareValues(getValue(a, sort.key), getValue(b, sort.key), sort.dir)
      );
    }

    return out;
  }, [rows, filters, sort, columns]);

  const getAvailableValues = (columnKey) => {
    const baseRows = applyFilters(rows, columnKey);

    const map = new Map();

    for (const row of baseRows || []) {
      const v = getValue(row, columnKey);
      const k = rawKey(v);

      if (!map.has(k)) {
        map.set(k, {
          key: k,
          label: displayValue(v),
          raw: v,
        });
      }
    }

    return Array.from(map.values()).sort((a, b) =>
      String(a.label).localeCompare(String(b.label), "es", { numeric: true })
    );
  };

  const setColumnFilter = (columnKey, patch) => {
    setFilters((prev) => {
      const current = prev[columnKey] || {
        search: "",
        selectedKeys: [],
      };

      const nextFilter = {
        ...current,
        ...patch,
      };

      const next = {
        ...prev,
        [columnKey]: nextFilter,
      };

      const noSearch = !String(nextFilter.search || "").trim();
      const noSelected =
        !nextFilter.selectedKeys || nextFilter.selectedKeys.length === 0;

      if (noSearch && noSelected) {
        delete next[columnKey];
      }

      return next;
    });

    options.onChange?.();
  };

  const clearColumnFilter = (columnKey) => {
    setFilters((prev) => {
      const next = { ...prev };
      delete next[columnKey];
      return next;
    });

    options.onChange?.();
  };

  const clearAllFilters = () => {
    setFilters({});
    setSort(null);
    options.onChange?.();
  };

  const sortAsc = (columnKey) => {
    setSort({ key: columnKey, dir: "asc" });
    options.onChange?.();
  };

  const sortDesc = (columnKey) => {
    setSort({ key: columnKey, dir: "desc" });
    options.onChange?.();
  };

  const hasFilter = (columnKey) => Boolean(filters[columnKey]);
  const hasSort = (columnKey) => sort?.key === columnKey;

  return {
    rows: filteredRows,
    filters,
    sort,
    setColumnFilter,
    clearColumnFilter,
    clearAllFilters,
    sortAsc,
    sortDesc,
    getAvailableValues,
    hasFilter,
    hasSort,
  };
}

export function ExcelFilterButton({ columnKey, label, excel }) {
  const [open, setOpen] = useState(false);
  const [menuPos, setMenuPos] = useState({ top: 0, left: 0, width: 280 });
  const [localSearch, setLocalSearch] = useState("");
  const btnRef = useRef(null);
  const menuRef = useRef(null);

  const currentFilter = excel.filters[columnKey] || {
    search: "",
    selectedKeys: [],
  };

  const values = excel.getAvailableValues(columnKey);

  const visibleValues = values.filter((v) =>
    String(v.label || "")
      .toLowerCase()
      .includes(String(localSearch || "").toLowerCase())
  );

  const selectedKeys = currentFilter.selectedKeys || [];

  const allVisibleSelected =
    visibleValues.length > 0 &&
    visibleValues.every((v) => selectedKeys.includes(v.key));

  useEffect(() => {
    if (!open) return;

    setLocalSearch(currentFilter.search || "");

    const r = btnRef.current?.getBoundingClientRect();

    if (r) {
      setMenuPos({
        top: r.bottom + 4,
        left: Math.min(r.left, window.innerWidth - 310),
        width: 285,
      });
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

    window.addEventListener("mousedown", onMouseDown);
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("scroll", () => setOpen(false), true);
    window.addEventListener("resize", () => setOpen(false));

    return () => {
      window.removeEventListener("mousedown", onMouseDown);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("scroll", () => setOpen(false), true);
      window.removeEventListener("resize", () => setOpen(false));
    };
  }, [open]);

  const toggleValue = (key) => {
    let next;

    if (selectedKeys.includes(key)) {
      next = selectedKeys.filter((x) => x !== key);
    } else {
      next = [...selectedKeys, key];
    }

    excel.setColumnFilter(columnKey, {
      selectedKeys: next,
      search: localSearch,
    });
  };

  const toggleAllVisible = () => {
    let next;

    if (allVisibleSelected) {
      const visibleSet = new Set(visibleValues.map((v) => v.key));
      next = selectedKeys.filter((k) => !visibleSet.has(k));
    } else {
      const set = new Set(selectedKeys);
      visibleValues.forEach((v) => set.add(v.key));
      next = Array.from(set);
    }

    excel.setColumnFilter(columnKey, {
      selectedKeys: next,
      search: localSearch,
    });
  };

  const aplicarBusqueda = (value) => {
    setLocalSearch(value);
    excel.setColumnFilter(columnKey, {
      search: value,
      selectedKeys,
    });
  };

  const limpiarColumna = () => {
    setLocalSearch("");
    excel.clearColumnFilter(columnKey);
    setOpen(false);
  };

  const active = excel.hasFilter(columnKey) || excel.hasSort(columnKey);

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        className={`excel-filter-trigger ${active ? "active" : ""}`}
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
              onClick={() => {
                excel.sortAsc(columnKey);
                setOpen(false);
              }}
            >
              Ordenar de A a Z
            </button>

            <button
              type="button"
              className="excel-filter-action"
              onClick={() => {
                excel.sortDesc(columnKey);
                setOpen(false);
              }}
            >
              Ordenar de Z a A
            </button>

            <button
              type="button"
              className="excel-filter-action"
              onClick={limpiarColumna}
            >
              Limpiar filtro de &quot;{label}&quot;
            </button>

            <div className="excel-filter-search">
              <input
                value={localSearch}
                onChange={(e) => aplicarBusqueda(e.target.value)}
                placeholder="Buscar"
                autoFocus
              />
            </div>

            <div className="excel-filter-checks">
              <label className="excel-filter-check">
                <input
                  type="checkbox"
                  checked={allVisibleSelected}
                  onChange={toggleAllVisible}
                />
                <span>(Seleccionar todo)</span>
              </label>

              {visibleValues.map((v) => (
                <label key={v.key} className="excel-filter-check">
                  <input
                    type="checkbox"
                    checked={selectedKeys.includes(v.key)}
                    onChange={() => toggleValue(v.key)}
                  />
                  <span>{v.label}</span>
                </label>
              ))}

              {!visibleValues.length && (
                <div className="excel-filter-empty">Sin valores</div>
              )}
            </div>

            <div className="excel-filter-footer">
              <button
                type="button"
                className="excel-filter-ok"
                onClick={() => setOpen(false)}
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