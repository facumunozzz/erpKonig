import React, { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import api from "../api/axiosConfig";
import "./excelFilters.css";

const EMPTY_KEY = "__EMPTY__";

function cloneFilters(source) {
  if (!source || typeof source !== "object") return {};

  return Object.fromEntries(
    Object.entries(source).map(([key, value]) => [
      key,
      value && typeof value === "object"
        ? {
            ...value,
            ...(Array.isArray(value.values) ? { values: [...value.values] } : {}),
          }
        : value,
    ]),
  );
}

function getFilterKind(column) {
  if (column?.filterKind) return column.filterKind;
  if (column?.type === "date" || column?.type === "datetime") return "date";
  if (column?.type === "number") return "number";
  return "search";
}

function compareValues(a, b) {
  return String(a ?? "").localeCompare(String(b ?? ""), "es", {
    numeric: true,
    sensitivity: "base",
  });
}

function FilterCheckbox({ checked, indeterminate, onChange, title }) {
  const ref = useRef(null);

  useEffect(() => {
    if (ref.current) ref.current.indeterminate = Boolean(indeterminate);
  }, [indeterminate]);

  return (
    <input
      ref={ref}
      type="checkbox"
      checked={checked}
      onChange={onChange}
      title={title}
    />
  );
}

export function useMovimientosSqlFilters(rows, columns, options = {}) {
  void rows;

  const [filters, setFilters] = useState(() =>
    cloneFilters(options.initialFilters),
  );
  const [sort, setSort] = useState(null);

  const setColumnFilter = (columnKey, filter) => {
    setFilters((previous) => {
      const next = { ...previous };

      if (!filter || filter.mode === "all") {
        delete next[columnKey];
      } else {
        next[columnKey] = filter;
      }

      return next;
    });

    options.onChange?.();
  };

  const clearColumnFilter = (columnKey) => {
    setFilters((previous) => {
      const next = { ...previous };
      delete next[columnKey];
      return next;
    });

    options.onChange?.();
  };

  const clearAllFilters = () => {
    setFilters(cloneFilters(options.initialFilters));
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

  const getAvailableValues = async (columnKey, search = "", signal) => {
    const response = await api.get("/movimientos/distinct", {
      params: {
        column: columnKey,
        search,
        filters: JSON.stringify(filters),
      },
      signal,
      timeout: 120000,
    });

    const received = Array.isArray(response.data)
      ? response.data
      : Array.isArray(response.data?.values)
        ? response.data.values
        : [];

    const limit = 500;

    const values = received.slice(0, limit).map((item) => {
      const text = item?.value == null ? "" : String(item.value);

      return {
        key: text === "" ? EMPTY_KEY : text,
        value: text,
        label: text === "" ? "(Vacíos)" : String(item?.label ?? text),
      };
    });

    values.sort((a, b) => compareValues(a.value, b.value));

    return {
      values,
      truncated: received.length > limit || Boolean(response.data?.truncated),
    };
  };

  return {
    rows: [],
    filters,
    sort,
    columns,
    setColumnFilter,
    clearColumnFilter,
    clearAllFilters,
    sortAsc,
    sortDesc,
    getAvailableValues,
    hasFilter: (columnKey) => Boolean(filters[columnKey]),
    hasSort: (columnKey) => sort?.key === columnKey,
  };
}

export function MovimientosSqlFilterButton({ columnKey, label, excel }) {
  const [open, setOpen] = useState(false);
  const [menuPos, setMenuPos] = useState({ top: 0, left: 0, width: 320 });
  const [loadingValues, setLoadingValues] = useState(false);
  const [truncated, setTruncated] = useState(false);
  const [values, setValues] = useState([]);
  const [localSearch, setLocalSearch] = useState("");

  const [draftMode, setDraftMode] = useState("all");
  const [draftValues, setDraftValues] = useState([]);
  const [draftText, setDraftText] = useState("");
  const [draftFrom, setDraftFrom] = useState("");
  const [draftTo, setDraftTo] = useState("");
  const [draftNumberMode, setDraftNumberMode] = useState("numberEq");
  const [draftNumber1, setDraftNumber1] = useState("");
  const [draftNumber2, setDraftNumber2] = useState("");

  const btnRef = useRef(null);
  const menuRef = useRef(null);

  const currentFilter = excel.filters[columnKey] || null;
  const column = excel.columns?.find((item) => item.key === columnKey) || {
    key: columnKey,
  };
  const filterKind = getFilterKind(column);
  const defaultTextMode = column?.inputMode === "contains" ? "contains" : "startsWith";

  const draftSet = useMemo(() => new Set(draftValues), [draftValues]);
  const visibleKeys = useMemo(() => values.map((item) => item.key), [values]);

  const isChecked = (key) => {
    if (draftMode === "all") return true;
    if (draftMode === "in") return draftSet.has(key);
    if (draftMode === "notIn") return !draftSet.has(key);
    return true;
  };

  const selectionState = (keys) => {
    if (!keys.length) return { checked: false, indeterminate: false };

    const selectedCount = keys.reduce(
      (total, key) => total + (isChecked(key) ? 1 : 0),
      0,
    );

    return {
      checked: selectedCount === keys.length,
      indeterminate: selectedCount > 0 && selectedCount < keys.length,
    };
  };

  const visibleSelection = selectionState(visibleKeys);

  const positionMenu = () => {
    const rect = btnRef.current?.getBoundingClientRect();
    if (!rect) return;

    const width = 320;
    const margin = 8;
    const maxLeft = Math.max(margin, window.innerWidth - width - margin);

    setMenuPos({
      top: Math.min(rect.bottom + 4, window.innerHeight - 80),
      left: Math.max(margin, Math.min(rect.left, maxLeft)),
      width,
    });
  };

  useEffect(() => {
    if (!open) return;

    setLocalSearch("");
    setValues([]);
    setTruncated(false);

    if (filterKind === "list") {
      if (currentFilter?.mode === "in" || currentFilter?.mode === "notIn") {
        setDraftMode(currentFilter.mode);
        setDraftValues(
          Array.isArray(currentFilter.values) ? currentFilter.values : [],
        );
      } else {
        setDraftMode("all");
        setDraftValues([]);
      }
    }

    if (filterKind === "search") {
      const mode =
        currentFilter?.mode === "contains" || currentFilter?.mode === "startsWith"
          ? currentFilter.mode
          : defaultTextMode;

      setDraftMode(mode);
      setDraftText(String(currentFilter?.value ?? ""));
    }

    if (filterKind === "date") {
      setDraftFrom(
        currentFilter?.mode === "dateRange" ? String(currentFilter?.from ?? "") : "",
      );
      setDraftTo(
        currentFilter?.mode === "dateRange" ? String(currentFilter?.to ?? "") : "",
      );
    }

    if (filterKind === "number") {
      const allowedModes = new Set([
        "numberEq",
        "numberGt",
        "numberGte",
        "numberLt",
        "numberLte",
        "numberBetween",
      ]);

      const mode = allowedModes.has(currentFilter?.mode)
        ? currentFilter.mode
        : "numberEq";

      setDraftNumberMode(mode);
      setDraftNumber1(String(currentFilter?.value ?? currentFilter?.from ?? ""));
      setDraftNumber2(String(currentFilter?.to ?? ""));
    }

    positionMenu();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!open || filterKind !== "list") return undefined;

    const controller = new AbortController();
    let active = true;

    const timer = setTimeout(async () => {
      try {
        setLoadingValues(true);

        const result = await excel.getAvailableValues(
          columnKey,
          localSearch,
          controller.signal,
        );

        if (!active) return;

        setValues(Array.isArray(result?.values) ? result.values : []);
        setTruncated(Boolean(result?.truncated));
      } catch (err) {
        if (
          active &&
          err?.code !== "ERR_CANCELED" &&
          err?.name !== "CanceledError"
        ) {
          console.error("Error cargando valores del filtro:", err);
          setValues([]);
          setTruncated(false);
        }
      } finally {
        if (active) setLoadingValues(false);
      }
    }, 350);

    return () => {
      active = false;
      clearTimeout(timer);
      controller.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, localSearch, columnKey, filterKind]);

  useEffect(() => {
    if (!open) return undefined;

    const closeOnOutsideMouseDown = (event) => {
      if (btnRef.current?.contains(event.target)) return;
      if (menuRef.current?.contains(event.target)) return;
      setOpen(false);
    };

    const closeOnEscape = (event) => {
      if (event.key === "Escape") setOpen(false);
    };

    const handleScrollOrResize = (event) => {
      if (menuRef.current?.contains(event.target)) return;
      positionMenu();
    };

    document.addEventListener("mousedown", closeOnOutsideMouseDown);
    window.addEventListener("keydown", closeOnEscape);
    window.addEventListener("scroll", handleScrollOrResize, true);
    window.addEventListener("resize", handleScrollOrResize);

    return () => {
      document.removeEventListener("mousedown", closeOnOutsideMouseDown);
      window.removeEventListener("keydown", closeOnEscape);
      window.removeEventListener("scroll", handleScrollOrResize, true);
      window.removeEventListener("resize", handleScrollOrResize);
    };
  }, [open]);

  const setKeysChecked = (keys, checked) => {
    const uniqueKeys = Array.from(new Set(keys));
    const actingOnAllVisible =
      visibleKeys.length > 0 &&
      uniqueKeys.length === visibleKeys.length &&
      uniqueKeys.every((key) => visibleKeys.includes(key));

    if (actingOnAllVisible && !localSearch) {
      setDraftMode(checked ? "all" : "in");
      setDraftValues([]);
      return;
    }

    setDraftValues((previous) => {
      const next = new Set(previous);
      let mode = draftMode;

      if (mode === "all" && !checked) mode = "notIn";
      if (mode === "all" && checked) return previous;

      uniqueKeys.forEach((key) => {
        if (mode === "in") {
          if (checked) next.add(key);
          else next.delete(key);
        } else if (mode === "notIn") {
          if (checked) next.delete(key);
          else next.add(key);
        }
      });

      if (mode === "notIn" && next.size === 0) mode = "all";

      setDraftMode(mode);
      return Array.from(next);
    });
  };

  const applyFilter = () => {
    if (filterKind === "list") {
      if (draftMode === "all") {
        excel.clearColumnFilter(columnKey);
      } else {
        excel.setColumnFilter(columnKey, {
          mode: draftMode,
          values: draftValues,
        });
      }
    }

    if (filterKind === "search") {
      const value = draftText.trim();

      if (!value) {
        excel.clearColumnFilter(columnKey);
      } else {
        excel.setColumnFilter(columnKey, {
          mode:
            draftMode === "contains" || draftMode === "startsWith"
              ? draftMode
              : defaultTextMode,
          value,
        });
      }
    }

    if (filterKind === "date") {
      if (!draftFrom && !draftTo) {
        excel.clearColumnFilter(columnKey);
      } else {
        excel.setColumnFilter(columnKey, {
          mode: "dateRange",
          from: draftFrom,
          to: draftTo,
        });
      }
    }

    if (filterKind === "number") {
      if (draftNumberMode === "numberBetween") {
        if (draftNumber1 === "" && draftNumber2 === "") {
          excel.clearColumnFilter(columnKey);
        } else {
          excel.setColumnFilter(columnKey, {
            mode: "numberBetween",
            from: draftNumber1,
            to: draftNumber2,
          });
        }
      } else if (draftNumber1 === "") {
        excel.clearColumnFilter(columnKey);
      } else {
        excel.setColumnFilter(columnKey, {
          mode: draftNumberMode,
          value: draftNumber1,
        });
      }
    }

    setOpen(false);
  };

  const clearColumn = () => {
    excel.clearColumnFilter(columnKey);
    setDraftMode("all");
    setDraftValues([]);
    setDraftText("");
    setDraftFrom("");
    setDraftTo("");
    setDraftNumberMode("numberEq");
    setDraftNumber1("");
    setDraftNumber2("");
    setLocalSearch("");
    setOpen(false);
  };

  const active = excel.hasFilter(columnKey) || excel.hasSort(columnKey);

  const renderListFilter = () => (
    <>
      <div className="excel-filter-search">
        <input
          value={localSearch}
          onChange={(event) => setLocalSearch(event.target.value)}
          placeholder="Buscar valor..."
          autoFocus
        />
      </div>

      <div
        className="excel-filter-checks"
        onWheel={(event) => event.stopPropagation()}
        onScroll={(event) => event.stopPropagation()}
      >
        <label className="excel-filter-check excel-filter-select-all">
          <FilterCheckbox
            checked={visibleSelection.checked}
            indeterminate={visibleSelection.indeterminate}
            onChange={(event) =>
              setKeysChecked(visibleKeys, event.target.checked)
            }
          />
          <span>(Seleccionar todo)</span>
        </label>

        {loadingValues ? (
          <div className="excel-filter-empty">Buscando valores...</div>
        ) : (
          values.map((value) => (
            <label key={value.key} className="excel-filter-check">
              <FilterCheckbox
                checked={isChecked(value.key)}
                onChange={() =>
                  setKeysChecked([value.key], !isChecked(value.key))
                }
              />
              <span>{value.label}</span>
            </label>
          ))
        )}

        {!loadingValues && !values.length && (
          <div className="excel-filter-empty">Sin valores</div>
        )}

        {truncated && (
          <div className="excel-filter-empty">
            Hay más valores. Escribí en Buscar para acotar la lista.
          </div>
        )}
      </div>
    </>
  );

  const renderSearchFilter = () => (
    <div style={{ padding: "10px 12px" }}>
      <div style={{ marginBottom: 8, fontSize: 12, fontWeight: 600 }}>
        Buscar en {label}
      </div>

      <select
        value={draftMode}
        onChange={(event) => setDraftMode(event.target.value)}
        style={{ width: "100%", marginBottom: 8, padding: "6px 7px" }}
      >
        <option value="startsWith">Empieza con</option>
        <option value="contains">Contiene</option>
      </select>

      <input
        value={draftText}
        onChange={(event) => setDraftText(event.target.value)}
        placeholder={draftMode === "contains" ? "Texto contenido..." : "Comienza con..."}
        autoFocus
        onKeyDown={(event) => {
          if (event.key === "Enter") applyFilter();
        }}
        style={{ width: "100%", boxSizing: "border-box", padding: "6px 7px" }}
      />
    </div>
  );

  const renderDateFilter = () => (
    <div style={{ padding: "10px 12px" }}>
      <div style={{ marginBottom: 8, fontSize: 12, fontWeight: 600 }}>
        Rango de fechas
      </div>

      <label style={{ display: "block", marginBottom: 8 }}>
        <span style={{ display: "block", fontSize: 12, marginBottom: 4 }}>Desde</span>
        <input
          type="date"
          value={draftFrom}
          onChange={(event) => setDraftFrom(event.target.value)}
          style={{ width: "100%", boxSizing: "border-box", padding: "6px 7px" }}
        />
      </label>

      <label style={{ display: "block" }}>
        <span style={{ display: "block", fontSize: 12, marginBottom: 4 }}>Hasta</span>
        <input
          type="date"
          value={draftTo}
          onChange={(event) => setDraftTo(event.target.value)}
          style={{ width: "100%", boxSizing: "border-box", padding: "6px 7px" }}
        />
      </label>
    </div>
  );

  const renderNumberFilter = () => (
    <div style={{ padding: "10px 12px" }}>
      <div style={{ marginBottom: 8, fontSize: 12, fontWeight: 600 }}>
        Filtro numérico
      </div>

      <select
        value={draftNumberMode}
        onChange={(event) => setDraftNumberMode(event.target.value)}
        style={{ width: "100%", marginBottom: 8, padding: "6px 7px" }}
      >
        <option value="numberEq">Igual a</option>
        <option value="numberGt">Mayor que</option>
        <option value="numberGte">Mayor o igual que</option>
        <option value="numberLt">Menor que</option>
        <option value="numberLte">Menor o igual que</option>
        <option value="numberBetween">Entre</option>
      </select>

      <input
        type="number"
        value={draftNumber1}
        onChange={(event) => setDraftNumber1(event.target.value)}
        placeholder={draftNumberMode === "numberBetween" ? "Desde" : "Valor"}
        autoFocus
        style={{ width: "100%", boxSizing: "border-box", padding: "6px 7px" }}
      />

      {draftNumberMode === "numberBetween" && (
        <input
          type="number"
          value={draftNumber2}
          onChange={(event) => setDraftNumber2(event.target.value)}
          placeholder="Hasta"
          style={{
            width: "100%",
            boxSizing: "border-box",
            padding: "6px 7px",
            marginTop: 8,
          }}
        />
      )}
    </div>
  );

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        className={`excel-filter-trigger ${active ? "active" : ""}`}
        onClick={(event) => {
          event.stopPropagation();
          setOpen((previous) => !previous);
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
            style={menuPos}
            onClick={(event) => event.stopPropagation()}
            onMouseDown={(event) => event.stopPropagation()}
          >
            <button
              type="button"
              className="excel-filter-action"
              onClick={() => {
                excel.sortAsc(columnKey);
                setOpen(false);
              }}
            >
              {filterKind === "date"
                ? "Ordenar de más antiguo a más reciente"
                : filterKind === "number"
                  ? "Ordenar de menor a mayor"
                  : "Ordenar de A a Z"}
            </button>

            <button
              type="button"
              className="excel-filter-action"
              onClick={() => {
                excel.sortDesc(columnKey);
                setOpen(false);
              }}
            >
              {filterKind === "date"
                ? "Ordenar de más reciente a más antiguo"
                : filterKind === "number"
                  ? "Ordenar de mayor a menor"
                  : "Ordenar de Z a A"}
            </button>

            <button
              type="button"
              className="excel-filter-action"
              onClick={clearColumn}
            >
              Limpiar filtro de &quot;{label}&quot;
            </button>

            {filterKind === "list" && renderListFilter()}
            {filterKind === "search" && renderSearchFilter()}
            {filterKind === "date" && renderDateFilter()}
            {filterKind === "number" && renderNumberFilter()}

            <div className="excel-filter-footer">
              <button
                type="button"
                className="excel-filter-ok"
                onClick={applyFilter}
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
          document.body,
        )}
    </>
  );
}