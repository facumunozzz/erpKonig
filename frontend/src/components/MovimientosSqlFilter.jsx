import React, { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import movimientosLocalDb from "../services/movimientosLocalDb";
import "./excelFilters.css";

const EMPTY_KEY = "__EMPTY__";

const MONTHS = [
  "Enero",
  "Febrero",
  "Marzo",
  "Abril",
  "Mayo",
  "Junio",
  "Julio",
  "Agosto",
  "Septiembre",
  "Octubre",
  "Noviembre",
  "Diciembre",
];

function norm(value) {
  return String(value ?? "")
    .trim()
    .toLocaleLowerCase("es");
}

function isDateColumn(column) {
  if (column?.type === "date" || column?.type === "datetime") return true;
  return /fecha|date/i.test(String(column?.key ?? ""));
}

function parseDateValue(value) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;

  const text = String(value ?? "").trim();
  if (!text) return null;

  const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) {
    const date = new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]));
    return Number.isNaN(date.getTime()) ? null : date;
  }

  const ar = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (ar) {
    const date = new Date(Number(ar[3]), Number(ar[2]) - 1, Number(ar[1]));
    return Number.isNaN(date.getTime()) ? null : date;
  }

  const date = new Date(text);
  return Number.isNaN(date.getTime()) ? null : date;
}

function compareValues(a, b, isDate = false) {
  if (isDate) {
    const ad = parseDateValue(a);
    const bd = parseDateValue(b);

    if (ad && bd) return ad.getTime() - bd.getTime();
    if (ad) return -1;
    if (bd) return 1;
  }

  return String(a ?? "").localeCompare(String(b ?? ""), "es", {
    numeric: true,
    sensitivity: "base",
  });
}

function buildDateTree(values) {
  const years = new Map();
  const undated = [];

  values.forEach((item) => {
    const date = parseDateValue(item.value);

    if (!date) {
      undated.push(item);
      return;
    }

    const year = date.getFullYear();
    const month = date.getMonth();
    const day = date.getDate();

    if (!years.has(year)) {
      years.set(year, {
        key: `year-${year}`,
        label: String(year),
        keys: [],
        months: new Map(),
      });
    }

    const yearNode = years.get(year);
    yearNode.keys.push(item.key);

    if (!yearNode.months.has(month)) {
      yearNode.months.set(month, {
        key: `month-${year}-${month}`,
        label: MONTHS[month],
        month,
        keys: [],
        days: new Map(),
      });
    }

    const monthNode = yearNode.months.get(month);
    monthNode.keys.push(item.key);

    if (!monthNode.days.has(day)) {
      monthNode.days.set(day, {
        key: `day-${year}-${month}-${day}`,
        label: String(day).padStart(2, "0"),
        day,
        keys: [],
      });
    }

    monthNode.days.get(day).keys.push(item.key);
  });

  return {
    tree: Array.from(years.values())
      .sort((a, b) => Number(b.label) - Number(a.label))
      .map((year) => ({
        ...year,
        months: Array.from(year.months.values())
          .sort((a, b) => a.month - b.month)
          .map((month) => ({
            ...month,
            days: Array.from(month.days.values()).sort((a, b) => a.day - b.day),
          })),
      })),
    undated,
  };
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

  const [filters, setFilters] = useState({});
  const [sort, setSort] = useState(null);

  const setColumnFilter = (columnKey, filter) => {
    setFilters((previous) => {
      const next = { ...previous };

      if (!filter || filter.mode === "all") delete next[columnKey];
      else next[columnKey] = filter;

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

  const getAvailableValues = async (columnKey, search = "") => {
    return movimientosLocalDb.getDistinctValues({
      columnKey,
      search,
      excelFilters: filters,
      textFilters: options.getTextFilters?.() || {},
    });
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
  const [menuPos, setMenuPos] = useState({ top: 0, left: 0, width: 300 });
  const [localSearch, setLocalSearch] = useState("");
  const [values, setValues] = useState([]);
  const [loadingValues, setLoadingValues] = useState(false);
  const [truncated, setTruncated] = useState(false);
  const [draftMode, setDraftMode] = useState("all");
  const [draftValues, setDraftValues] = useState([]);
  const [expanded, setExpanded] = useState({});

  const btnRef = useRef(null);
  const menuRef = useRef(null);

  const currentFilter = excel.filters[columnKey] || null;
  const column = excel.columns?.find((item) => item.key === columnKey);
  const dateColumn = isDateColumn(column || { key: columnKey });

  const draftSet = useMemo(() => new Set(draftValues), [draftValues]);
  const visibleKeys = values.map((item) => item.key);
  const dateTree = useMemo(() => buildDateTree(values), [values]);

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

    const width = 300;
    const margin = 8;
    const maxLeft = Math.max(margin, window.innerWidth - width - margin);
    const left = Math.max(margin, Math.min(rect.left, maxLeft));

    setMenuPos({
      top: Math.min(rect.bottom + 4, window.innerHeight - 80),
      left,
      width,
    });
  };

  const resetDraftFromCurrent = () => {
    if (!currentFilter) {
      setDraftMode("all");
      setDraftValues([]);
      return;
    }

    setDraftMode(currentFilter.mode || "all");
    setDraftValues(
      Array.isArray(currentFilter.values) ? currentFilter.values : [],
    );
  };

  useEffect(() => {
    if (!open) return;

    setLocalSearch("");
    setExpanded({});
    resetDraftFromCurrent();
    positionMenu();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;

    let cancelled = false;

    const timer = setTimeout(async () => {
      try {
        setLoadingValues(true);

        const result = await excel.getAvailableValues(columnKey, localSearch);

        if (cancelled) return;

        const nextValues = Array.isArray(result?.values) ? result.values : [];

        nextValues.sort((a, b) => compareValues(a.value, b.value, dateColumn));

        setValues(nextValues);
        setTruncated(Boolean(result?.truncated));
      } catch (err) {
        if (!cancelled) {
          console.error("Error cargando valores del filtro:", err);
          setValues([]);
          setTruncated(false);
        }
      } finally {
        if (!cancelled) setLoadingValues(false);
      }
    }, 220);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
    // Los filtros externos se vuelven a leer al reabrir el menú.
    // Evitamos depender del objeto excel completo porque cambia de identidad
    // en cada render y provocaría consultas repetidas.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, localSearch, columnKey, dateColumn]);

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

    if (
      !localSearch &&
      !truncated &&
      uniqueKeys.length === visibleKeys.length
    ) {
      if (checked) {
        setDraftMode("all");
        setDraftValues([]);
      } else {
        setDraftMode("in");
        setDraftValues([]);
      }
      return;
    }

    setDraftValues((previous) => {
      const next = new Set(previous);
      let mode = draftMode;

      if (mode === "all" && !checked) {
        mode = "notIn";
      }

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

  const toggleSingleValue = (key) => {
    setKeysChecked([key], !isChecked(key));
  };

  const toggleExpanded = (key) => {
    setExpanded((previous) => ({
      ...previous,
      [key]: !previous[key],
    }));
  };

  const applyFilter = () => {
    if (draftMode === "all") {
      excel.clearColumnFilter(columnKey);
    } else {
      excel.setColumnFilter(columnKey, {
        mode: draftMode,
        values: draftValues,
      });
    }

    setOpen(false);
  };

  const clearColumn = () => {
    excel.clearColumnFilter(columnKey);
    setDraftMode("all");
    setDraftValues([]);
    setLocalSearch("");
    setOpen(false);
  };

  const active = excel.hasFilter(columnKey) || excel.hasSort(columnKey);

  const renderDateChecks = () => (
    <>
      {dateTree.tree.map((year) => {
        const yearState = selectionState(year.keys);
        const yearOpen = Boolean(expanded[year.key]);

        return (
          <div key={year.key} className="excel-filter-tree-node">
            <div className="excel-filter-check excel-filter-tree-row">
              <button
                type="button"
                className="excel-filter-expand"
                onClick={() => toggleExpanded(year.key)}
                aria-label={yearOpen ? "Contraer año" : "Expandir año"}
              >
                {yearOpen ? "−" : "+"}
              </button>

              <FilterCheckbox
                checked={yearState.checked}
                indeterminate={yearState.indeterminate}
                onChange={(event) =>
                  setKeysChecked(year.keys, event.target.checked)
                }
              />

              <span>{year.label}</span>
            </div>

            {yearOpen && (
              <div className="excel-filter-tree-children">
                {year.months.map((month) => {
                  const monthState = selectionState(month.keys);
                  const monthOpen = Boolean(expanded[month.key]);

                  return (
                    <div key={month.key} className="excel-filter-tree-node">
                      <div className="excel-filter-check excel-filter-tree-row">
                        <button
                          type="button"
                          className="excel-filter-expand"
                          onClick={() => toggleExpanded(month.key)}
                          aria-label={
                            monthOpen ? "Contraer mes" : "Expandir mes"
                          }
                        >
                          {monthOpen ? "−" : "+"}
                        </button>

                        <FilterCheckbox
                          checked={monthState.checked}
                          indeterminate={monthState.indeterminate}
                          onChange={(event) =>
                            setKeysChecked(month.keys, event.target.checked)
                          }
                        />

                        <span>{month.label}</span>
                      </div>

                      {monthOpen && (
                        <div className="excel-filter-tree-children">
                          {month.days.map((day) => {
                            const dayState = selectionState(day.keys);

                            return (
                              <label
                                key={day.key}
                                className="excel-filter-check excel-filter-day"
                              >
                                <FilterCheckbox
                                  checked={dayState.checked}
                                  indeterminate={dayState.indeterminate}
                                  onChange={(event) =>
                                    setKeysChecked(
                                      day.keys,
                                      event.target.checked,
                                    )
                                  }
                                />
                                <span>{day.label}</span>
                              </label>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}

      {dateTree.undated.map((value) => (
        <label key={value.key} className="excel-filter-check">
          <FilterCheckbox
            checked={isChecked(value.key)}
            onChange={() => toggleSingleValue(value.key)}
          />
          <span>{value.label}</span>
        </label>
      ))}
    </>
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
            style={{
              top: menuPos.top,
              left: menuPos.left,
              width: menuPos.width,
            }}
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
              {dateColumn
                ? "Ordenar de más antiguo a más reciente"
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
              {dateColumn
                ? "Ordenar de más reciente a más antiguo"
                : "Ordenar de Z a A"}
            </button>

            <button
              type="button"
              className="excel-filter-action"
              onClick={clearColumn}
            >
              Limpiar filtro de &quot;{label}&quot;
            </button>

            <div className="excel-filter-search">
              <input
                value={localSearch}
                onChange={(event) => setLocalSearch(event.target.value)}
                placeholder="Buscar"
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
              ) : dateColumn ? (
                renderDateChecks()
              ) : (
                values.map((value) => (
                  <label key={value.key} className="excel-filter-check">
                    <FilterCheckbox
                      checked={isChecked(value.key)}
                      onChange={() => toggleSingleValue(value.key)}
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
