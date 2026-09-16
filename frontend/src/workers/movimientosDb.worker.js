import sqlite3InitModule from "@sqlite.org/sqlite-wasm";

const EMPTY_KEY = "__EMPTY__";

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
const NUMERIC_COLUMNS = new Set(["orden_movimiento", "cantidad"]);

/*
 * Índice preferido para obtener los valores del menú Excel. Se usa solamente
 * cuando no hay filtros de otras columnas, para no perjudicar consultas
 * combinadas. El recorrido se hace sobre el índice (mucho más pequeño que la
 * fila completa) y nunca se ordena toda la tabla antes del LIMIT.
 */
const DISTINCT_INDEX_BY_COLUMN = {
  id_movimiento: "ix_mov_id_movimiento",
  orden_movimiento: "ix_mov_orden",
  numero_transaccion: "ix_mov_numero",
  fecha: "ix_mov_fecha",
  fecha_real: "ix_mov_fecha_real",
  codigo: "ix_mov_codigo",
  descripcion: "ix_mov_descripcion",
  cantidad: "ix_mov_cantidad",
  deposito_origen: "ix_mov_deposito_origen",
  ubicacion_origen: "ix_mov_ubicacion_origen",
  deposito_destino: "ix_mov_deposito_destino",
  ubicacion_destino: "ix_mov_ubicacion_destino",
  tipo_transaccion: "ix_mov_tipo",
  motivo: "ix_mov_motivo",
  remito_referencia: "ix_mov_referencia",
  obra: "ix_mov_obra_version",
  version: "ix_mov_version",
  referente: "ix_mov_referente",
  proveedor: "ix_mov_proveedor",
  ingreso_egreso: "ix_mov_ingreso_egreso",
  usuario: "ix_mov_usuario",
};

function normalizeExactValue(column, value) {
  const text = String(value ?? "").trim();

  if (NUMERIC_COLUMNS.has(column)) {
    const number = Number(text);
    if (Number.isFinite(number)) return number;
  }

  return text;
}

let sqlite3 = null;
let db = null;
let storageMode = "not-initialized";
let cachedRowCount = null;

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
  if (db) return getEngineStatus();

  sqlite3 = await sqlite3InitModule({
    print: (...args) => console.log("SQLite WASM:", ...args),
    printErr: (...args) => console.error("SQLite WASM:", ...args),
  });

  let lastError = null;

  try {
    if (sqlite3.oo1?.OpfsWlDb) {
      db = new sqlite3.oo1.OpfsWlDb("/sz_movimientos.sqlite3", "c");
      storageMode = "opfs-wl";
    }
  } catch (err) {
    lastError = err;
    db = null;
  }

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

  if (!db) {
    console.warn(
      "No fue posible abrir SQLite persistente. Se usa memoria temporal.",
      lastError,
    );

    db = new sqlite3.oo1.DB(":memory:", "c");
    storageMode = "memory-fallback";
  }

  db.exec(`
    PRAGMA foreign_keys = OFF;
    PRAGMA temp_store = MEMORY;
    PRAGMA synchronous = NORMAL;
    PRAGMA cache_size = -65536;
    PRAGMA mmap_size = 268435456;

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
    CREATE INDEX IF NOT EXISTS ix_mov_version
      ON movimientos(version);
    CREATE INDEX IF NOT EXISTS ix_mov_referente
      ON movimientos(referente);
    CREATE INDEX IF NOT EXISTS ix_mov_proveedor
      ON movimientos(proveedor);
    CREATE INDEX IF NOT EXISTS ix_mov_motivo
      ON movimientos(motivo);
    CREATE INDEX IF NOT EXISTS ix_mov_deposito_origen
      ON movimientos(deposito_origen);
    CREATE INDEX IF NOT EXISTS ix_mov_ubicacion_origen
      ON movimientos(ubicacion_origen);
    CREATE INDEX IF NOT EXISTS ix_mov_deposito_destino
      ON movimientos(deposito_destino);
    CREATE INDEX IF NOT EXISTS ix_mov_ubicacion_destino
      ON movimientos(ubicacion_destino);
    CREATE INDEX IF NOT EXISTS ix_mov_ingreso_egreso
      ON movimientos(ingreso_egreso);
    CREATE INDEX IF NOT EXISTS ix_mov_usuario
      ON movimientos(usuario);
    CREATE INDEX IF NOT EXISTS ix_mov_descripcion
      ON movimientos(descripcion);
    CREATE INDEX IF NOT EXISTS ix_mov_id_movimiento
      ON movimientos(id_movimiento);
    CREATE INDEX IF NOT EXISTS ix_mov_cantidad
      ON movimientos(cantidad);
  `);

  return getEngineStatus();
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

function readCachedRowCountFromMeta() {
  ensureDb();

  const raw = db.selectValue(
    "SELECT valor FROM meta WHERE clave = 'localRowCount'",
  );
  if (raw === undefined || raw === null || raw === "") return null;

  const value = Number(raw);
  return Number.isFinite(value) ? Math.max(0, value) : null;
}

function setCachedRowCount(value) {
  const normalized = Math.max(0, Number(value) || 0);
  cachedRowCount = normalized;
  return normalized;
}

function persistCachedRowCount(value) {
  const normalized = setCachedRowCount(value);
  setMetaValues({ localRowCount: String(normalized) });
  return normalized;
}

function getCachedRowCount(force = false) {
  ensureDb();

  if (!force && cachedRowCount !== null) return cachedRowCount;

  if (!force) {
    const fromMeta = readCachedRowCountFromMeta();
    if (fromMeta !== null) {
      cachedRowCount = fromMeta;
      return cachedRowCount;
    }
  }

  const actual = Number(
    db.selectValue("SELECT COUNT(*) FROM movimientos") || 0,
  );
  return persistCachedRowCount(actual);
}

function getEngineStatus() {
  ensureDb();

  return {
    storageMode,
    localRows: getCachedRowCount(),
    meta: getAllMeta(),
  };
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
      historial_id, linea, id_movimiento, orden_movimiento,
      numero_transaccion, fecha, fecha_real, codigo, descripcion, cantidad,
      deposito_origen, ubicacion_origen, deposito_destino, ubicacion_destino,
      tipo_transaccion, motivo, remito_referencia, obra, version, referente,
      id_referente, proveedor, ingreso_egreso, usuario, sync_version
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
  const existsStmt = db.prepare(
    "SELECT 1 FROM movimientos WHERE historial_id = ?",
  );

  let delta = 0;

  try {
    getCachedRowCount();

    db.transaction(() => {
      rows.forEach((row) => {
        const id = Number(row.historial_id);
        if (!Number.isFinite(id)) return;

        existsStmt.bind([id]);
        const existed = Boolean(existsStmt.step());
        existsStmt.reset();

        if (allowDeletes && Number(row.eliminado || 0) === 1) {
          if (existed) {
            remove.bind([id]).stepReset();
            delta -= 1;
          }
          return;
        }

        upsert.bind(movementValues(row)).stepReset();
        if (!existed) delta += 1;
      });
    });

    const nextCount = setCachedRowCount(Number(cachedRowCount || 0) + delta);
    setMetaValues({
      ...meta,
      localRowCount: String(nextCount),
    });
  } finally {
    upsert.finalize();
    remove.finalize();
    existsStmt.finalize();
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

    if (NUMERIC_COLUMNS.has(key)) {
      clauses.push(`CAST("${key}" AS TEXT) LIKE ?`);
    } else {
      clauses.push(`COALESCE("${key}", '') COLLATE NOCASE LIKE ?`);
    }

    bind.push(`%${value}%`);
  });

  Object.entries(excelFilters || {}).forEach(([key, filter]) => {
    if (key === exceptKey || !FILTERABLE_COLUMNS.has(key) || !filter) return;

    const mode = String(filter.mode || "");
    const rawValues = Array.isArray(filter.values) ? filter.values : [];

    if (mode === "in") {
      if (!rawValues.length) {
        clauses.push("1 = 0");
        return;
      }

      const hasEmpty = rawValues.some(
        (value) => value === EMPTY_KEY || String(value ?? "") === "",
      );
      const normalValues = rawValues
        .filter((value) => value !== EMPTY_KEY && String(value ?? "") !== "")
        .map((value) => normalizeExactValue(key, value));
      const parts = [];

      if (normalValues.length) {
        parts.push(`"${key}" IN (${normalValues.map(() => "?").join(",")})`);
        bind.push(...normalValues);
      }

      if (hasEmpty) {
        parts.push(`COALESCE(CAST("${key}" AS TEXT), '') = ''`);
      }

      clauses.push(parts.length ? `(${parts.join(" OR ")})` : "1 = 0");
      return;
    }

    if (mode === "notIn") {
      if (!rawValues.length) return;

      const hasEmpty = rawValues.some(
        (value) => value === EMPTY_KEY || String(value ?? "") === "",
      );
      const normalValues = rawValues
        .filter((value) => value !== EMPTY_KEY && String(value ?? "") !== "")
        .map((value) => normalizeExactValue(key, value));
      const parts = [];

      if (normalValues.length) {
        parts.push(`(
          "${key}" IS NULL
          OR "${key}" NOT IN (${normalValues.map(() => "?").join(",")})
        )`);
        bind.push(...normalValues);
      }

      if (hasEmpty) {
        parts.push(`COALESCE(CAST("${key}" AS TEXT), '') <> ''`);
      }

      if (parts.length) clauses.push(`(${parts.join(" AND ")})`);
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
    return "ORDER BY orden_movimiento DESC, fecha DESC, historial_id DESC";
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

const SELECT_COLUMNS = `
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
`;

function queryMovimientos(payload = {}) {
  ensureDb();

  const page = Math.max(Number(payload.page || 1), 1);
  const pageSize = Math.min(Math.max(Number(payload.pageSize || 50), 1), 500);
  const offset = (page - 1) * pageSize;

  const where = buildWhere({
    textFilters: payload.textFilters,
    excelFilters: payload.excelFilters,
  });

  console.log("[WORKER FILTRO]", {
    textFilters: payload.textFilters,
    excelFilters: payload.excelFilters,
    whereSql: where.sql,
    bind: where.bind,
  });
  const orderBy = getOrderBy(payload.sort);

  /*
   * Se solicita una fila adicional. Esa fila permite saber si existe una
   * página siguiente sin ejecutar COUNT(*) sobre cientos de miles de filas.
   */
  const fetched =
    selectObjects(
      `
        SELECT ${SELECT_COLUMNS}
        FROM movimientos
        ${where.sql}
        ${orderBy}
        LIMIT ? OFFSET ?
      `,
      [...where.bind, pageSize + 1, offset],
    ) || [];

  const hasMore = fetched.length > pageSize;
  const data = hasMore ? fetched.slice(0, pageSize) : fetched;

  let total;
  let totalExact;

  if (!where.sql) {
    total = getCachedRowCount();
    totalExact = true;
  } else if (!hasMore) {
    total = offset + data.length;
    totalExact = true;
  } else {
    total = offset + data.length + 1;
    totalExact = false;
  }

  return {
    data,
    total,
    totalExact,
    totalPending: false,
    hasMore,
    page,
    pageSize,
    totalPages: Math.max(Math.ceil(total / pageSize), 1),
  };
}

/*
 * Se conserva por compatibilidad con código anterior, pero Movimientos.jsx ya
 * no lo llama automáticamente después de cada filtro.
 */
function countMovimientos(payload = {}) {
  ensureDb();

  const where = buildWhere({
    textFilters: payload.textFilters,
    excelFilters: payload.excelFilters,
  });
  const total = where.sql
    ? Number(
        selectValue(
          `SELECT COUNT(*) FROM movimientos ${where.sql}`,
          where.bind,
        ) || 0,
      )
    : getCachedRowCount();
  const pageSize = Math.min(Math.max(Number(payload.pageSize || 50), 1), 500);

  return {
    total,
    totalExact: true,
    totalPending: false,
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

  if (where.sql) clauses.push(where.sql.replace(/^WHERE\s+/i, ""));

  if (search) {
    const normalizedSearch = normalizeTextFilter(columnKey, search);

    if (NUMERIC_COLUMNS.has(columnKey)) {
      clauses.push(`CAST("${columnKey}" AS TEXT) LIKE ?`);
    } else {
      clauses.push(`COALESCE("${columnKey}", '') COLLATE NOCASE LIKE ?`);
    }

    bind.push(`%${normalizedSearch}%`);
  }

  const whereSql = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  const preferredIndex = !where.sql
    ? DISTINCT_INDEX_BY_COLUMN[columnKey]
    : null;
  const indexHint = preferredIndex ? `INDEXED BY "${preferredIndex}"` : "";

  /*
   * No hay ORDER BY en SQLite: ordenar todos los distintos antes de LIMIT era
   * el otro bloqueo importante. React ordena como máximo 500 valores.
   */
  const rows =
    selectObjects(
      `
        SELECT DISTINCT "${columnKey}" AS raw_value
        FROM movimientos ${indexHint}
        ${whereSql}
        LIMIT ?
      `,
      [...bind, limit + 1],
    ) || [];

  const truncated = rows.length > limit;
  const values = rows.slice(0, limit).map((row) => {
    const raw = row.raw_value;
    const text = raw === null || raw === undefined ? "" : String(raw);

    return {
      key: text === "" ? EMPTY_KEY : text,
      value: text,
      label: text === "" ? "(Vacíos)" : text,
    };
  });

  return { values, truncated };
}

function clearLocalDatabase() {
  ensureDb();

  db.exec(`
    DELETE FROM movimientos;
    DELETE FROM meta;
  `);

  cachedRowCount = 0;
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
    case "queryCount":
      return countMovimientos(payload || {});
    case "distinct":
      return distinctValues(payload || {});
    case "clear":
      return clearLocalDatabase();
    default:
      throw new Error(`Operación SQLite desconocida: ${type}`);
  }
}

/*
 * Cola con prioridad y reemplazo de consultas obsoletas.
 *
 * SQLite usa una sola conexión, por lo que las operaciones deben seguir siendo
 * secuenciales. La diferencia es que ahora una consulta vieja que todavía no
 * empezó se descarta cuando llega otra más nueva del mismo tipo. Así, escribir
 * varias letras en un input o en Buscar no deja una fila de consultas inútiles
 * bloqueando la última búsqueda.
 */
const queuedMessages = [];
let processingQueue = false;
let enqueueSequence = 0;

function getCoalesceKey(type, payload) {
  if (type === "query") return "grid-query";
  if (type === "distinct") {
    return `distinct:${String(payload?.columnKey || "")}`;
  }
  if (type === "queryCount") return "grid-count";
  return null;
}

function getPriority(type) {
  if (type === "query" || type === "distinct") return 0;
  if (type === "init" || type === "getStatus") return 1;
  if (type === "queryCount") return 3;
  return 2;
}

function replyCancelled(message) {
  self.postMessage({
    id: message.id,
    ok: true,
    result: { cancelled: true },
  });
}

async function processMessageQueue() {
  if (processingQueue) return;
  processingQueue = true;

  try {
    while (queuedMessages.length) {
      queuedMessages.sort(
        (a, b) => a.priority - b.priority || a.sequence - b.sequence,
      );

      const message = queuedMessages.shift();

      try {
        const result = await handleMessage(message.type, message.payload);
        self.postMessage({ id: message.id, ok: true, result });
      } catch (err) {
        console.error("movimientosDb.worker:", err);
        self.postMessage({
          id: message.id,
          ok: false,
          error: err?.message || String(err),
        });
      }
    }
  } finally {
    processingQueue = false;

    if (queuedMessages.length) {
      void processMessageQueue();
    }
  }
}

self.onmessage = (event) => {
  const { id, type, payload } = event.data || {};
  const coalesceKey = getCoalesceKey(type, payload);

  if (coalesceKey) {
    for (let index = queuedMessages.length - 1; index >= 0; index -= 1) {
      if (queuedMessages[index].coalesceKey === coalesceKey) {
        const [obsolete] = queuedMessages.splice(index, 1);
        replyCancelled(obsolete);
      }
    }
  }

  queuedMessages.push({
    id,
    type,
    payload,
    coalesceKey,
    priority: getPriority(type),
    sequence: ++enqueueSequence,
  });

  void processMessageQueue();
};
