import React, { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import "./excelFilters.css";

const EMPTY_KEY = "__EMPTY__";

const norm = (value) =>
  String(value ?? "")
    .trim()
    .toLocaleLowerCase("es");

const displayValue = (value) => {
  if (value === null || value === undefined || value === "") return "(Vacíos)";
  return String(value);
};

const rawKey = (value) => {
  if (value === null || value === undefined || value === "") return EMPTY_KEY;
  return String(value);
};

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

function parseDateValue(value) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;

  if (typeof value === "number") {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  const text = String(value ?? "").trim();
  if (!text) return null;

  // Formatos ISO: 2026-07-30, 2026-07-30T10:15:00, etc.
  const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) {
    const date = new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]));
    return Number.isNaN(date.getTime()) ? null : date;
  }

  // Formatos argentinos: 30/07/2026 o 30/07/2026, 10:15:00
  const ar = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (ar) {
    const date = new Date(Number(ar[3]), Number(ar[2]) - 1, Number(ar[1]));
    return Number.isNaN(date.getTime()) ? null : date;
  }

  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function compareValues(a, b, dir, isDateColumn = false) {
  let result = 0;

  if (isDateColumn) {
    const ad = parseDateValue(a);
    const bd = parseDateValue(b);

    if (ad && bd) result = ad.getTime() - bd.getTime();
    else if (ad) result = -1;
    else if (bd) result = 1;
    else result = String(a ?? "").localeCompare(String(b ?? ""), "es", {
      numeric: true,
      sensitivity: "base",
    });
  } else {
    const av = String(a ?? "").toLocaleLowerCase("es");
    const bv = String(b ?? "").toLocaleLowerCase("es");
    const an = Number(av.replace(",", "."));
    const bn = Number(bv.replace(",", "."));

    if (!Number.isNaN(an) && !Number.isNaN(bn) && av !== "" && bv !== "") {
      result = an - bn;
    } else {
      result = av.localeCompare(bv, "es", {
        numeric: true,
        sensitivity: "base",
      });
    }
  }

  return dir === "desc" ? -result : result;
}

function isDateColumn(column) {
  if (column?.type === "date") return true;
  if (column?.type === "datetime") return true;
  return /fecha|date/i.test(String(column?.key ?? ""));
}

function buildDateTree(values) {
  const years = new Map();
  const undated = [];

  values.forEach((item) => {
    const date = parseDateValue(item.raw);

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

  const tree = Array.from(years.values())
    .sort((a, b) => b.label.localeCompare(a.label, "es", { numeric: true }))
    .map((yearNode) => ({
      ...yearNode,
      months: Array.from(yearNode.months.values())
        .sort((a, b) => a.month - b.month)
        .map((monthNode) => ({
          ...monthNode,
          days: Array.from(monthNode.days.values()).sort((a, b) => a.day - b.day),
        })),
    }));

  return { tree, undated };
}

function selectionState(keys, selectedSet) {
  if (!keys.length) return { checked: false, indeterminate: false };

  const selectedCount = keys.reduce(
    (total, key) => total + (selectedSet.has(key) ? 1 : 0),
    0
  );

  return {
    checked: selectedCount === keys.length,
    indeterminate: selectedCount > 0 && selectedCount < keys.length,
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

export function useExcelFilters(rows, columns, options = {}) {
  const [filters, setFilters] = useState({});
  const [sort, setSort] = useState(null);

  const getColumn = (key) => columns.find((column) => column.key === key);

  const getValue = (row, key) => {
    const column = getColumn(key);
    if (column?.getValue) return column.getValue(row);
    return row?.[key];
  };

  const applyFilters = (sourceRows, exceptKey = null) =>
    (sourceRows || []).filter((row) =>
      Object.entries(filters).every(([key, filter]) => {
        if (key === exceptKey || !filter) return true;

        const value = getValue(row, key);
        const valueText = norm(displayValue(value));
        const valueKey = rawKey(value);
        const search = norm(filter.search);

        if (search && !valueText.includes(search)) return false;

        // null/undefined significa todos seleccionados.
        // Un array vacío significa ninguno seleccionado.
        if (Array.isArray(filter.selectedKeys)) {
          return filter.selectedKeys.includes(valueKey);
        }

        return true;
      })
    );

  const filteredRows = useMemo(() => {
    let output = applyFilters(rows);

    if (sort?.key) {
      const column = getColumn(sort.key);
      output = [...output].sort((a, b) =>
        compareValues(
          getValue(a, sort.key),
          getValue(b, sort.key),
          sort.dir,
          isDateColumn(column)
        )
      );
    }

    return output;
  }, [rows, filters, sort, columns]);

  const getAvailableValues = (columnKey) => {
    const baseRows = applyFilters(rows, columnKey);
    const map = new Map();

    baseRows.forEach((row) => {
      const raw = getValue(row, columnKey);
      const key = rawKey(raw);

      if (!map.has(key)) {
        map.set(key, {
          key,
          label: displayValue(raw),
          raw,
        });
      }
    });

    const column = getColumn(columnKey);

    return Array.from(map.values()).sort((a, b) =>
      compareValues(a.raw, b.raw, "asc", isDateColumn(column))
    );
  };

  const setColumnFilter = (columnKey, patch) => {
    setFilters((previous) => {
      const current = previous[columnKey] || {
        search: "",
        selectedKeys: null,
      };

      const nextFilter = { ...current, ...patch };
      const next = { ...previous, [columnKey]: nextFilter };

      const noSearch = !String(nextFilter.search || "").trim();
      const allSelected = nextFilter.selectedKeys == null;

      if (noSearch && allSelected) delete next[columnKey];

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

  return {
    rows: filteredRows,
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

export function ExcelFilterButton({ columnKey, label, excel }) {
  const [open, setOpen] = useState(false);
  const [menuPos, setMenuPos] = useState({ top: 0, left: 0, width: 300 });
  const [localSearch, setLocalSearch] = useState("");
  const [draftSelectedKeys, setDraftSelectedKeys] = useState([]);
  const [expanded, setExpanded] = useState({});

  const btnRef = useRef(null);
  const menuRef = useRef(null);

  const currentFilter = excel.filters[columnKey] || {
    search: "",
    selectedKeys: null,
  };

  const column = excel.columns?.find((item) => item.key === columnKey);
  const dateColumn = isDateColumn(column || { key: columnKey });
  const values = excel.getAvailableValues(columnKey);
  const allKeys = values.map((value) => value.key);

  const visibleValues = useMemo(() => {
    const search = norm(localSearch);
    if (!search) return values;
    return values.filter((value) => norm(value.label).includes(search));
  }, [values, localSearch]);

  const selectedSet = useMemo(
    () => new Set(draftSelectedKeys),
    [draftSelectedKeys]
  );

  const visibleKeys = visibleValues.map((value) => value.key);
  const visibleSelection = selectionState(visibleKeys, selectedSet);
  const dateTree = useMemo(() => buildDateTree(visibleValues), [visibleValues]);

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

  useEffect(() => {
    if (!open) return;

    setLocalSearch(currentFilter.search || "");
    setDraftSelectedKeys(
      Array.isArray(currentFilter.selectedKeys)
        ? currentFilter.selectedKeys
        : allKeys
    );
    setExpanded({});
    positionMenu();
  }, [open]);

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

    // En scroll externo se reposiciona, pero el scroll interno del menú no lo cierra.
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
    setDraftSelectedKeys((previous) => {
      const next = new Set(previous);
      keys.forEach((key) => {
        if (checked) next.add(key);
        else next.delete(key);
      });
      return Array.from(next);
    });
  };

  const toggleSingleValue = (key) => {
    setDraftSelectedKeys((previous) =>
      previous.includes(key)
        ? previous.filter((item) => item !== key)
        : [...previous, key]
    );
  };

  const toggleExpanded = (key) => {
    setExpanded((previous) => ({ ...previous, [key]: !previous[key] }));
  };

  const applyFilter = () => {
    const allSelected =
      draftSelectedKeys.length === allKeys.length &&
      allKeys.every((key) => draftSelectedKeys.includes(key));

    excel.setColumnFilter(columnKey, {
      search: "", // La búsqueda sirve para localizar valores, no para filtrar filas.
      selectedKeys: allSelected ? null : draftSelectedKeys,
    });

    setOpen(false);
  };

  const clearColumn = () => {
    excel.clearColumnFilter(columnKey);
    setLocalSearch("");
    setDraftSelectedKeys(allKeys);
    setOpen(false);
  };

  const active = excel.hasFilter(columnKey) || excel.hasSort(columnKey);

  const renderDateChecks = () => (
    <>
      {dateTree.tree.map((year) => {
        const yearState = selectionState(year.keys, selectedSet);
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
                onChange={(event) => setKeysChecked(year.keys, event.target.checked)}
              />
              <span>{year.label}</span>
            </div>

            {yearOpen && (
              <div className="excel-filter-tree-children">
                {year.months.map((month) => {
                  const monthState = selectionState(month.keys, selectedSet);
                  const monthOpen = Boolean(expanded[month.key]);

                  return (
                    <div key={month.key} className="excel-filter-tree-node">
                      <div className="excel-filter-check excel-filter-tree-row">
                        <button
                          type="button"
                          className="excel-filter-expand"
                          onClick={() => toggleExpanded(month.key)}
                          aria-label={monthOpen ? "Contraer mes" : "Expandir mes"}
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
                            const dayState = selectionState(day.keys, selectedSet);

                            return (
                              <label
                                key={day.key}
                                className="excel-filter-check excel-filter-day"
                              >
                                <FilterCheckbox
                                  checked={dayState.checked}
                                  indeterminate={dayState.indeterminate}
                                  onChange={(event) =>
                                    setKeysChecked(day.keys, event.target.checked)
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
            checked={selectedSet.has(value.key)}
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
              {dateColumn ? "Ordenar de más antiguo a más reciente" : "Ordenar de A a Z"}
            </button>

            <button
              type="button"
              className="excel-filter-action"
              onClick={() => {
                excel.sortDesc(columnKey);
                setOpen(false);
              }}
            >
              {dateColumn ? "Ordenar de más reciente a más antiguo" : "Ordenar de Z a A"}
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

              {dateColumn ? (
                renderDateChecks()
              ) : (
                visibleValues.map((value) => (
                  <label key={value.key} className="excel-filter-check">
                    <FilterCheckbox
                      checked={selectedSet.has(value.key)}
                      onChange={() => toggleSingleValue(value.key)}
                    />
                    <span>{value.label}</span>
                  </label>
                ))
              )}

              {!visibleValues.length && (
                <div className="excel-filter-empty">Sin valores</div>
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
          document.body
        )}
    </>
  );
}