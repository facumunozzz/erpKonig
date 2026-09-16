import sqlite3InitModule from "@sqlite.org/sqlite-wasm";

const EMPTY_KEY = "__EMPTY__";

const MOVEMENT_COLUMNS = [
  "historial_id",
  "linea",
  "id_movimiento",
  "orden_movimiento",
  "numero_transaccion",
  "fecha",
  "fecha_real",
  "codigo",
  "descripcion",
  "cantidad",
  "deposito_origen",
  "ubicacion_origen",
  "deposito_destino",
  "ubicacion_destino",
  "tipo_transaccion",
  "motivo",
  "remito_referencia",
  "obra",
  "version",
  "referente",
  "id_referente",
  "proveedor",
  "ingreso_egreso",
  "usuario",
  "sync_version",
];

const FILTERABLE_COLUMNS = new Set([
  "id_movimiento",
  "orden_movimiento",
  "numero_transaccion",
  "fecha",
  "fecha_real",
  "codigo",
  "descripcion",
  "cantidad",
  "deposito_origen",
  "ubicacion_origen",
  "deposito_destino",
  "ubicacion_destino",
  "tipo_transaccion",
  "motivo",
  "remito_referencia",
  "obra",
  "version",
  "referente",
  "proveedor",
  "ingreso_egreso",
  "usuario",
]);

const DATE_COLUMNS = new Set(["fecha", "fecha_real"]);

let sqlite3 = null;
let db = null;
let storageMode = "not-initialized";

function safeText(value) {
  return String(value ?? "").trim();
}

function normalizeDateForStorage(value) {
  if (!value) return null;

  const text = String(value).trim();
  const iso = text.match(/^(\d{4}-\d{2}-\d{2})/);

  if (iso) return iso[1];

  const ar = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);

  if (ar) {
    return `${ar[3]}-${String(ar[2]).padStart(2, "0")}-${String(ar[1]).padStart(2, "0")}`;
  }

  const date = new Date(text);

  if (Number.isNaN(date.getTime())) return text;

  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function normalizeTextFilter(column, value) {
  const text = safeText(value);

  if (!text) return "";

  if (!DATE_COLUMNS.has(column)) return text;

  const arFull = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);

  if (arFull) {
    return `${arFull[3]}-${String(arFull[2]).padStart(2, "0")}-${String(arFull[1]).padStart(2, "0")}`;
  }

  const arMonthYear = text.match(/^(\d{1,2})\/(\d{4})$/);

  if (arMonthYear) {
    return `${arMonthYear[2]}-${String(arMonthYear[1]).padStart(2, "0")}`;
  }

  return text;
}

async function initializeDatabase() {
  if (db) {
    return getEngineStatus();
  }

  sqlite3 = await sqlite3InitModule({
    print: (...args) => console.log("SQLite WASM:", ...args),
    printErr: (...args) => console.error("SQLite WASM:", ...args),
  });

  let lastError = null;

  /*
   * Primera opción: OPFS con Web Locks. Permite mejor convivencia entre pestañas
   * cuando el servidor habilita SharedArrayBuffer mediante COOP/COEP.
   */
  try {
    if (sqlite3.oo1?.OpfsWlDb) {
      db = new sqlite3.oo1.OpfsWlDb("/sz_movimientos.sqlite3", "c");
      storageMode = "opfs-wl";
    }
  } catch (err) {
    lastError = err;
    db = null;
  }

  /*
   * Segunda opción: OPFS SAH Pool. Es muy rápida y persistente, y no necesita
   * COOP/COEP. Solo debe existir una conexión activa por origen.
   */
  if (!db) {
    try {
      const poolUtil = await sqlite3.installOpfsSAHPoolVfs({
        initialCapacity: 6,
      });

      db = new poolUtil.OpfsSAHPoolDb("/sz_movimientos.sqlite3", "c");
      storageMode = "opfs-sahpool";
    } catch (err) {
      lastError = err;
      db = null;
    }
  }

  /*
   * Fallback de seguridad. El ERP sigue funcionando aunque OPFS no esté
   * disponible, pero esta copia no sobrevive a un cierre del navegador.
   */
  if (!db) {
    console.warn(
      "No fue posible abrir SQLite persistente. Se usa memoria temporal.",
      lastError,
    );

    db = new sqlite3.oo1.DB(":memory:", "ct");
    storageMode = "memory-fallback";
  }

  db.exec(`
    PRAGMA foreign_keys = OFF;
    PRAGMA temp_store = MEMORY;
    PRAGMA synchronous = NORMAL;

    CREATE TABLE IF NOT EXISTS movimientos
    (
      historial_id INTEGER PRIMARY KEY,
      linea INTEGER,
      id_movimiento TEXT,
      orden_movimiento INTEGER,
      numero_transaccion TEXT,
      fecha TEXT,
      fecha_real TEXT,
      codigo TEXT,
      descripcion TEXT,
      cantidad REAL,
      deposito_origen TEXT,
      ubicacion_origen TEXT,
      deposito_destino TEXT,
      ubicacion_destino TEXT,
      tipo_transaccion TEXT,
      motivo TEXT,
      remito_referencia TEXT,
      obra TEXT,
      version TEXT,
      referente TEXT,
      id_referente INTEGER,
      proveedor TEXT,
      ingreso_egreso TEXT,
      usuario TEXT,
      sync_version TEXT
    );

    CREATE TABLE IF NOT EXISTS meta
    (
      clave TEXT PRIMARY KEY,
      valor TEXT
    );

    CREATE INDEX IF NOT EXISTS ix_mov_orden
      ON movimientos(orden_movimiento DESC, fecha DESC, historial_id DESC);

    CREATE INDEX IF NOT EXISTS ix_mov_fecha
      ON movimientos(fecha DESC, historial_id DESC);

    CREATE INDEX IF NOT EXISTS ix_mov_fecha_real
      ON movimientos(fecha_real DESC, historial_id DESC);

    CREATE INDEX IF NOT EXISTS ix_mov_codigo
      ON movimientos(codigo, fecha DESC);

    CREATE INDEX IF NOT EXISTS ix_mov_tipo
      ON movimientos(tipo_transaccion, fecha DESC);

    CREATE INDEX IF NOT EXISTS ix_mov_numero
      ON movimientos(numero_transaccion);

    CREATE INDEX IF NOT EXISTS ix_mov_referencia
      ON movimientos(remito_referencia);

    CREATE INDEX IF NOT EXISTS ix_mov_obra_version
      ON movimientos(obra, version);

    CREATE INDEX IF NOT EXISTS ix_mov_referente
      ON movimientos(referente);

    CREATE INDEX IF NOT EXISTS ix_mov_proveedor
      ON movimientos(proveedor);

    CREATE INDEX IF NOT EXISTS ix_mov_motivo
      ON movimientos(motivo);
  `);

  return getEngineStatus();
}

function getEngineStatus() {
  ensureDb();

  return {
    storageMode,
    localRows: Number(db.selectValue("SELECT COUNT(*) FROM movimientos") || 0),
    meta: getAllMeta(),
  };
}

function ensureDb() {
  if (!db) {
    throw new Error("El motor SQLite local todavía no fue inicializado.");
  }
}

function getAllMeta() {
  ensureDb();

  const rows = db.selectObjects("SELECT clave, valor FROM meta") || [];

  return Object.fromEntries(rows.map((row) => [row.clave, row.valor]));
}

function setMetaValues(values = {}) {
  ensureDb();

  const entries = Object.entries(values).filter(
    ([, value]) => value !== undefined,
  );

  if (!entries.length) return;

  const stmt = db.prepare(`
    INSERT INTO meta(clave, valor)
    VALUES(?, ?)
    ON CONFLICT(clave)
    DO UPDATE SET valor = excluded.valor
  `);

  try {
    db.transaction(() => {
      entries.forEach(([key, value]) => {
        stmt.bind([key, value == null ? "" : String(value)]).stepReset();
      });
    });
  } finally {
    stmt.finalize();
  }
}

function movementValues(row) {
  return [
    Number(row.historial_id),
    row.linea == null ? null : Number(row.linea),
    row.id_movimiento ?? null,
    row.orden_movimiento == null ? null : Number(row.orden_movimiento),
    row.numero_transaccion ?? null,
    normalizeDateForStorage(row.fecha),
    normalizeDateForStorage(row.fecha_real),
    row.codigo ?? null,
    row.descripcion ?? null,
    row.cantidad == null || row.cantidad === "" ? null : Number(row.cantidad),
    row.deposito_origen ?? null,
    row.ubicacion_origen ?? null,
    row.deposito_destino ?? null,
    row.ubicacion_destino ?? null,
    row.tipo_transaccion ?? null,
    row.motivo ?? null,
    row.remito_referencia ?? null,
    row.obra ?? null,
    row.version ?? null,
    row.referente ?? null,
    row.id_referente == null || row.id_referente === ""
      ? null
      : Number(row.id_referente),
    row.proveedor ?? null,
    row.ingreso_egreso ?? null,
    row.usuario ?? null,
    row.sync_version ?? null,
  ];
}

function applyRows(rows = [], meta = {}, allowDeletes = false) {
  ensureDb();

  const upsert = db.prepare(`
    INSERT INTO movimientos
    (
      historial_id,
      linea,
      id_movimiento,
      orden_movimiento,
      numero_transaccion,
      fecha,
      fecha_real,
      codigo,
      descripcion,
      cantidad,
      deposito_origen,
      ubicacion_origen,
      deposito_destino,
      ubicacion_destino,
      tipo_transaccion,
      motivo,
      remito_referencia,
      obra,
      version,
      referente,
      id_referente,
      proveedor,
      ingreso_egreso,
      usuario,
      sync_version
    )
    VALUES
    (
      ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
      ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
      ?, ?, ?, ?, ?
    )
    ON CONFLICT(historial_id)
    DO UPDATE SET
      linea = excluded.linea,
      id_movimiento = excluded.id_movimiento,
      orden_movimiento = excluded.orden_movimiento,
      numero_transaccion = excluded.numero_transaccion,
      fecha = excluded.fecha,
      fecha_real = excluded.fecha_real,
      codigo = excluded.codigo,
      descripcion = excluded.descripcion,
      cantidad = excluded.cantidad,
      deposito_origen = excluded.deposito_origen,
      ubicacion_origen = excluded.ubicacion_origen,
      deposito_destino = excluded.deposito_destino,
      ubicacion_destino = excluded.ubicacion_destino,
      tipo_transaccion = excluded.tipo_transaccion,
      motivo = excluded.motivo,
      remito_referencia = excluded.remito_referencia,
      obra = excluded.obra,
      version = excluded.version,
      referente = excluded.referente,
      id_referente = excluded.id_referente,
      proveedor = excluded.proveedor,
      ingreso_egreso = excluded.ingreso_egreso,
      usuario = excluded.usuario,
      sync_version = excluded.sync_version
  `);

  const remove = db.prepare("DELETE FROM movimientos WHERE historial_id = ?");

  try {
    db.transaction(() => {
      rows.forEach((row) => {
        if (allowDeletes && Number(row.eliminado || 0) === 1) {
          remove.bind([Number(row.historial_id)]).stepReset();
          return;
        }

        upsert.bind(movementValues(row)).stepReset();
      });
    });

    setMetaValues(meta);
  } finally {
    upsert.finalize();
    remove.finalize();
  }

  return {
    processed: rows.length,
    meta: getAllMeta(),
  };
}

function buildWhere({
  textFilters = {},
  excelFilters = {},
  exceptKey = null,
} = {}) {
  const clauses = [];
  const bind = [];

  Object.entries(textFilters || {}).forEach(([key, rawValue]) => {
    if (key === exceptKey || !FILTERABLE_COLUMNS.has(key)) return;

    const value = normalizeTextFilter(key, rawValue);

    if (!value) return;

    clauses.push(`LOWER(COALESCE(CAST("${key}" AS TEXT), '')) LIKE LOWER(?)`);

    bind.push(`%${value}%`);
  });

  Object.entries(excelFilters || {}).forEach(([key, filter]) => {
    if (key === exceptKey || !FILTERABLE_COLUMNS.has(key) || !filter) return;

    const mode = String(filter.mode || "");
    const values = Array.isArray(filter.values)
      ? filter.values.map((value) =>
          value === EMPTY_KEY ? "" : String(value ?? ""),
        )
      : [];

    if (mode === "in") {
      if (!values.length) {
        clauses.push("1 = 0");
        return;
      }

      clauses.push(
        `COALESCE(CAST("${key}" AS TEXT), '') IN (${values.map(() => "?").join(",")})`,
      );

      bind.push(...values);
      return;
    }

    if (mode === "notIn" && values.length) {
      clauses.push(
        `COALESCE(CAST("${key}" AS TEXT), '') NOT IN (${values.map(() => "?").join(",")})`,
      );

      bind.push(...values);
    }
  });

  return {
    sql: clauses.length ? `WHERE ${clauses.join(" AND ")}` : "",
    bind,
  };
}

function getOrderBy(sort = null) {
  const key = sort?.key;
  const dir = String(sort?.dir || "").toLowerCase() === "asc" ? "ASC" : "DESC";

  if (!FILTERABLE_COLUMNS.has(key)) {
    return `ORDER BY orden_movimiento DESC, fecha DESC, historial_id DESC`;
  }

  return `ORDER BY "${key}" ${dir}, orden_movimiento DESC, fecha DESC, historial_id DESC`;
}

function selectValue(sqlText, bind = []) {
  return bind.length ? db.selectValue(sqlText, bind) : db.selectValue(sqlText);
}

function selectObjects(sqlText, bind = []) {
  return bind.length
    ? db.selectObjects(sqlText, bind)
    : db.selectObjects(sqlText);
}

function queryMovimientos(payload = {}) {
  ensureDb();

  const page = Math.max(Number(payload.page || 1), 1);
  const pageSize = Math.min(Math.max(Number(payload.pageSize || 50), 1), 500);
  const offset = (page - 1) * pageSize;

  const where = buildWhere({
    textFilters: payload.textFilters,
    excelFilters: payload.excelFilters,
  });

  const total = Number(
    selectValue(`SELECT COUNT(*) FROM movimientos ${where.sql}`, where.bind) ||
      0,
  );

  const orderBy = getOrderBy(payload.sort);

  const data =
    selectObjects(
      `
      SELECT
        historial_id,
        linea,
        id_movimiento,
        orden_movimiento,
        numero_transaccion,
        fecha,
        fecha_real,
        codigo,
        descripcion,
        cantidad,
        deposito_origen,
        ubicacion_origen,
        deposito_destino,
        ubicacion_destino,
        tipo_transaccion,
        motivo,
        remito_referencia,
        obra,
        version,
        referente,
        id_referente,
        proveedor,
        ingreso_egreso,
        usuario
      FROM movimientos
      ${where.sql}
      ${orderBy}
      LIMIT ? OFFSET ?
    `,
      [...where.bind, pageSize, offset],
    ) || [];

  return {
    data,
    total,
    page,
    pageSize,
    totalPages: Math.max(Math.ceil(total / pageSize), 1),
  };
}

function distinctValues(payload = {}) {
  ensureDb();

  const columnKey = String(payload.columnKey || "");

  if (!FILTERABLE_COLUMNS.has(columnKey)) {
    throw new Error(`Columna inválida para filtro: ${columnKey}`);
  }

  const isDate = DATE_COLUMNS.has(columnKey);
  const limit = isDate ? 5000 : 500;
  const search = safeText(payload.search);

  const where = buildWhere({
    textFilters: payload.textFilters,
    excelFilters: payload.excelFilters,
    exceptKey: columnKey,
  });

  const clauses = [];
  const bind = [...where.bind];

  if (where.sql) {
    clauses.push(where.sql.replace(/^WHERE\s+/i, ""));
  }

  if (search) {
    clauses.push(
      `LOWER(COALESCE(CAST("${columnKey}" AS TEXT), '')) LIKE LOWER(?)`,
    );
    bind.push(`%${normalizeTextFilter(columnKey, search)}%`);
  }

  const whereSql = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";

  const rows =
    selectObjects(
      `
      SELECT DISTINCT
        COALESCE(CAST("${columnKey}" AS TEXT), '') AS value
      FROM movimientos
      ${whereSql}
      ORDER BY value COLLATE NOCASE ASC
      LIMIT ?
    `,
      [...bind, limit + 1],
    ) || [];

  const truncated = rows.length > limit;
  const values = rows.slice(0, limit).map((row) => ({
    key: row.value === "" ? EMPTY_KEY : String(row.value),
    value: row.value,
    label: row.value === "" ? "(Vacíos)" : String(row.value),
  }));

  return {
    values,
    truncated,
  };
}

function clearLocalDatabase() {
  ensureDb();

  db.exec(`
    DELETE FROM movimientos;
    DELETE FROM meta;
  `);

  return getEngineStatus();
}

async function handleMessage(type, payload) {
  if (type === "init") return initializeDatabase();

  await initializeDatabase();

  switch (type) {
    case "getStatus":
      return getEngineStatus();

    case "setMeta":
      setMetaValues(payload || {});
      return getEngineStatus();

    case "applyBootstrapBatch":
      return applyRows(payload?.rows || [], payload?.meta || {}, false);

    case "applySyncBatch":
      return applyRows(payload?.rows || [], payload?.meta || {}, true);

    case "query":
      return queryMovimientos(payload || {});

    case "distinct":
      return distinctValues(payload || {});

    case "clear":
      return clearLocalDatabase();

    default:
      throw new Error(`Operación SQLite desconocida: ${type}`);
  }
}

self.onmessage = async (event) => {
  const { id, type, payload } = event.data || {};

  try {
    const result = await handleMessage(type, payload);

    self.postMessage({
      id,
      ok: true,
      result,
    });
  } catch (err) {
    console.error("movimientosDb.worker:", err);

    self.postMessage({
      id,
      ok: false,
      error: err?.message || String(err),
    });
  }
};
