// backend/controllers/movimientos.js
const { sql, poolConnect, getPool } = require("../db");

function q(s) {
  return String(s).replace(/'/g, "''");
}

async function pickExistingTable(pool, names = []) {
  const inList = names.map((n) => `'${q(n)}'`).join(",");

  const r = await pool.request().query(`
    SELECT TOP 1 name
    FROM sys.objects
    WHERE type = 'U' AND name IN (${inList})
  `);

  return r.recordset[0]?.name || null;
}

function toInt(v, def) {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? Math.trunc(n) : def;
}

function safeText(v) {
  return String(v ?? "").trim();
}

function parseFilters(raw) {
  if (!raw) return {};

  if (typeof raw === "object") return raw;

  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

const ALLOWED_SORT_COLUMNS = new Set([
  "orden_movimiento",
  "id_movimiento",
  "numero_transaccion",
  "fecha",
  "fecha_real",
  "codigo",
  "descripcion",
  "cantidad",
  "deposito_origen",
  "deposito_destino",
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

const FILTER_COLUMNS = {
  orden_movimiento: "movimientos.orden_movimiento",
  id_movimiento: "movimientos.id_movimiento",
  numero_transaccion: "movimientos.numero_transaccion",
  fecha: "movimientos.fecha",
  fecha_real: "movimientos.fecha_real",
  codigo: "movimientos.codigo",
  descripcion: "movimientos.descripcion",
  cantidad: "movimientos.cantidad",
  deposito_origen: "movimientos.deposito_origen",
  deposito_destino: "movimientos.deposito_destino",
  tipo_transaccion: "movimientos.tipo_transaccion",
  motivo: "movimientos.motivo",
  remito_referencia: "movimientos.remito_referencia",
  obra: "movimientos.obra",
  version: "movimientos.version",
  referente: "movimientos.referente",
  proveedor: "movimientos.proveedor",
  ingreso_egreso: "movimientos.ingreso_egreso",
  usuario: "movimientos.usuario",
};

function getOrderBy(sortKey, sortDir) {
  const key = ALLOWED_SORT_COLUMNS.has(sortKey) ? sortKey : "";
  const dir = String(sortDir || "").toLowerCase() === "asc" ? "ASC" : "DESC";

  if (!key) {
    return `
      ORDER BY
        movimientos.orden_movimiento DESC,
        movimientos.fecha DESC,
        movimientos.id_movimiento DESC
    `;
  }

  if (key === "fecha" || key === "fecha_real") {
    return `
      ORDER BY
        movimientos.${key} ${dir},
        movimientos.orden_movimiento DESC,
        movimientos.numero_transaccion DESC,
        movimientos.id_movimiento DESC
    `;
  }

  return `
    ORDER BY
      movimientos.${key} ${dir},
      movimientos.orden_movimiento DESC,
      movimientos.fecha DESC,
      movimientos.id_movimiento DESC
  `;
}

function addFilter(request, where, filters, key, columnSql) {
  const raw = filters[key];

  if (raw === undefined || raw === null || raw === "") return;

  if (typeof raw === "string") {
    const value = safeText(raw);
    if (!value) return;

    const paramName = `f_${key}`;
    request.input(paramName, sql.NVarChar, `%${value}%`);
    where.push(`CAST(${columnSql} AS NVARCHAR(MAX)) LIKE @${paramName}`);
    return;
  }

  if (typeof raw === "object" && raw.mode === "in") {
    const values = Array.isArray(raw.values)
      ? raw.values.map((x) => String(x ?? "").trim())
      : [];

    if (!values.length) return;

    const orParts = [];

    values.forEach((value, index) => {
      const paramName = `f_${key}_${index}`;

      if (value === "__EMPTY__" || value === "") {
        orParts.push(
          `(${columnSql} IS NULL OR CAST(${columnSql} AS NVARCHAR(MAX)) = '')`,
        );
      } else {
        request.input(paramName, sql.NVarChar, value);
        orParts.push(`CAST(${columnSql} AS NVARCHAR(MAX)) = @${paramName}`);
      }
    });

    where.push(`(${orParts.join(" OR ")})`);
    return;
  }

  // Objeto: exclusión múltiple exacta
  // { mode: "notIn", values: ["CONSUMO PRODUCCIÓN (DROPBOX)"] }
  if (typeof raw === "object" && raw.mode === "notIn") {
    const values = Array.isArray(raw.values)
      ? raw.values.map((x) => String(x ?? "").trim()).filter(Boolean)
      : [];

    if (!values.length) return;

    const andParts = [];

    values.forEach((value, index) => {
      const paramName = `f_${key}_not_${index}`;

      if (value === "__EMPTY__" || value === "") {
        andParts.push(
          `(${columnSql} IS NOT NULL AND CAST(${columnSql} AS NVARCHAR(MAX)) <> '')`,
        );
      } else {
        request.input(paramName, sql.NVarChar, value);
        andParts.push(
          `(${columnSql} IS NULL OR CAST(${columnSql} AS NVARCHAR(MAX)) <> @${paramName})`,
        );
      }
    });

    where.push(`(${andParts.join(" AND ")})`);
    return;
  }

  if (typeof raw === "object" && raw.mode === "dateRange") {
    const from = safeText(raw.from);
    const to = safeText(raw.to);

    if (!from && !to) return;

    if (from) {
      const paramNameFrom = `f_${key}_from`;
      request.input(paramNameFrom, sql.Date, from);
      where.push(`CONVERT(date, ${columnSql}) >= @${paramNameFrom}`);
    }

    if (to) {
      const paramNameTo = `f_${key}_to`;
      request.input(paramNameTo, sql.Date, to);
      where.push(`CONVERT(date, ${columnSql}) <= @${paramNameTo}`);
    }

    return;
  }

  if (typeof raw === "object" && raw.mode === "contains") {
    const value = safeText(raw.value);
    if (!value) return;

    const paramName = `f_${key}`;
    request.input(paramName, sql.NVarChar, `%${value}%`);
    where.push(`CAST(${columnSql} AS NVARCHAR(MAX)) LIKE @${paramName}`);
  }
}

function buildWhere(filters, request, exceptKey = null) {
  const where = [];

  Object.entries(FILTER_COLUMNS).forEach(([key, columnSql]) => {
    if (key === exceptKey) return;
    addFilter(request, where, filters, key, columnSql);
  });

  return where.length ? `WHERE ${where.join(" AND ")}` : "";
}

async function buildMovimientosBase(pool) {
  const transfDetalleTable = await pickExistingTable(pool, [
    "transferencias_detalle",
    "transferencia_detalles",
    "transferencias_detalles",
  ]);

  const ajusteDetalleTable = await pickExistingTable(pool, [
    "ajustes_detalles",
    "ajuste_detalles",
  ]);

  const ajustesTable = await pickExistingTable(pool, ["ajustes"]);
  const remitosTable = await pickExistingTable(pool, ["remitos"]);
  const remitosDetTable = await pickExistingTable(pool, ["remitos_detalles"]);

  const selects = [];

  if (transfDetalleTable) {
    selects.push(`
      SELECT
        CAST(
          CONCAT(
            'TRANSFERENCIA-',
            t.numero_transferencia,
            '-',
            a.codigo,
            '-',
            td.cantidad
          ) AS VARCHAR(300)
        )                                                    AS id_movimiento,
        TRY_CONVERT(BIGINT, t.numero_transferencia)          AS orden_movimiento,
        CAST(t.numero_transferencia AS VARCHAR(50))          AS numero_transaccion,
        CONVERT(date, t.fecha)                               AS fecha,
        CONVERT(date, ISNULL(t.fecha_real, t.fecha))          AS fecha_real,
        CAST(a.codigo AS VARCHAR(100))                       AS codigo,
        CAST(a.descripcion AS VARCHAR(500))                  AS descripcion,
        CAST(td.cantidad AS INT)                             AS cantidad,
        CAST(t.origen AS VARCHAR(255))                       AS deposito_origen,
        CAST(t.destino AS VARCHAR(255))                      AS deposito_destino,
        CAST('TRANSFERENCIA' AS VARCHAR(50))                 AS tipo_transaccion,
        CAST(NULL AS VARCHAR(255))                           AS motivo,
        CAST(t.remito_referencia AS VARCHAR(255))            AS remito_referencia,
        CAST(NULL AS VARCHAR(255))                           AS obra,
        CAST(NULL AS VARCHAR(255))                           AS version,
        CAST(ref.nombre AS VARCHAR(255))                     AS referente,
        t.id_referente                                       AS id_referente,
        CAST(a.proveedor AS VARCHAR(255))                    AS proveedor,
        CAST(NULL AS VARCHAR(10))                            AS ingreso_egreso,
        CAST(t.usuario AS VARCHAR(255))                      AS usuario
      FROM dbo.transferencias t
      JOIN dbo.${transfDetalleTable} td
        ON td.transferencia_id = t.id
      JOIN dbo.articulos a
        ON a.id_articulo = td.articulo_id
      LEFT JOIN dbo.referentes ref
        ON ref.id_referente = t.id_referente
    `);
  }

  if (ajustesTable && ajusteDetalleTable) {
    selects.push(`
      SELECT
        CAST(
          CONCAT(
            'AJUSTE-',
            a.numero_ajuste,
            '-',
            ad.cod_articulo,
            '-',
            ad.cantidad
          ) AS VARCHAR(300)
        )                                                    AS id_movimiento,
        TRY_CONVERT(BIGINT, a.numero_ajuste)                 AS orden_movimiento,
        CAST(a.numero_ajuste AS VARCHAR(50))                 AS numero_transaccion,
        CONVERT(date, a.fecha)                               AS fecha,
        CONVERT(date, ISNULL(a.fecha_real, a.fecha))          AS fecha_real,
        CAST(ad.cod_articulo AS VARCHAR(100))                AS codigo,
        CAST(ad.descripcion AS VARCHAR(500))                 AS descripcion,
        ABS(CAST(ad.cantidad AS INT))                        AS cantidad,
        CAST(
          CASE 
            WHEN CAST(ad.cantidad AS INT) < 0 THEN a.deposito 
            ELSE NULL 
          END AS VARCHAR(255)
        )                                                    AS deposito_origen,
        CAST(
          CASE 
            WHEN CAST(ad.cantidad AS INT) > 0 THEN a.deposito 
            ELSE NULL 
          END AS VARCHAR(255)
        )                                                    AS deposito_destino,
        CAST('AJUSTE' AS VARCHAR(50))                        AS tipo_transaccion,
        CAST(COALESCE(am.nombre, a.motivo) AS VARCHAR(255))  AS motivo,
        CAST(a.remito_referencia AS VARCHAR(255))            AS remito_referencia,
        CAST(a.obra AS VARCHAR(255))                         AS obra,
        CAST(a.version AS VARCHAR(255))                      AS version,
        CAST(ref.nombre AS VARCHAR(255))                     AS referente,
        a.id_referente                                       AS id_referente,
        CAST(art.proveedor AS VARCHAR(255))                  AS proveedor,
        CAST(
          CASE 
            WHEN CAST(ad.cantidad AS INT) < 0 THEN 'E'
            WHEN CAST(ad.cantidad AS INT) > 0 THEN 'I'
            ELSE ''
          END AS VARCHAR(10)
        )                                                    AS ingreso_egreso,
        CAST(a.usuario AS VARCHAR(255))                      AS usuario
      FROM dbo.${ajustesTable} a
      JOIN dbo.${ajusteDetalleTable} ad
        ON ad.ajuste_id = a.numero_ajuste
      LEFT JOIN dbo.ajustes_motivos am
        ON am.id_motivo = a.motivo_id
      LEFT JOIN dbo.articulos art
        ON UPPER(LTRIM(RTRIM(art.codigo))) = UPPER(LTRIM(RTRIM(ad.cod_articulo)))
      LEFT JOIN dbo.referentes ref
        ON ref.id_referente = a.id_referente
    `);
  }

  if (remitosTable && remitosDetTable) {
    selects.push(`
      SELECT
        CAST(
          CONCAT(
            'REMITO-',
            r.numero_transaccion,
            '-',
            rd.cod_articulo,
            '-',
            rd.cantidad
          ) AS VARCHAR(300)
        )                                                    AS id_movimiento,
        TRY_CONVERT(BIGINT, r.numero_transaccion)            AS orden_movimiento,
        CAST(r.numero_transaccion AS VARCHAR(50))            AS numero_transaccion,
        CONVERT(date, r.fecha)                               AS fecha,
        CONVERT(date, r.fecha)                               AS fecha_real,
        CAST(rd.cod_articulo AS VARCHAR(100))                AS codigo,
        CAST(rd.descripcion AS VARCHAR(500))                 AS descripcion,
        ABS(CAST(rd.cantidad AS INT))                        AS cantidad,
        CAST(
          CASE 
            WHEN r.tipo = 'SALIDA' THEN r.deposito_nombre 
            ELSE NULL 
          END AS VARCHAR(255)
        )                                                    AS deposito_origen,
        CAST(
          CASE 
            WHEN r.tipo <> 'SALIDA' THEN r.deposito_nombre 
            ELSE NULL 
          END AS VARCHAR(255)
        )                                                    AS deposito_destino,
        CAST('REMITO' AS VARCHAR(50))                        AS tipo_transaccion,
        CAST(NULL AS VARCHAR(255))                           AS motivo,
        CAST(r.numero_remito AS VARCHAR(255))                AS remito_referencia,
        CAST(NULL AS VARCHAR(255))                           AS obra,
        CAST(NULL AS VARCHAR(255))                           AS version,
        CAST(NULL AS VARCHAR(255))                           AS referente,
        CAST(NULL AS INT)                                    AS id_referente,
        CAST(r.proveedor AS VARCHAR(255))                    AS proveedor,
        CAST(
          CASE 
            WHEN r.tipo = 'SALIDA' THEN 'E'
            ELSE 'I'
          END AS VARCHAR(10)
        )                                                    AS ingreso_egreso,
        CAST(r.usuario AS VARCHAR(255))                      AS usuario
      FROM dbo.${remitosTable} r
      JOIN dbo.${remitosDetTable} rd
        ON rd.remito_id = r.numero_remito
      LEFT JOIN dbo.articulos art
        ON UPPER(LTRIM(RTRIM(art.codigo))) = UPPER(LTRIM(RTRIM(rd.cod_articulo)))
    `);
  }

  selects.push(`
    SELECT
      CAST(
        CONCAT(
          'PRODUCCION-E-',
          o.numero_orden,
          '-',
          a.codigo,
          '-',
          od.cantidad
        ) AS VARCHAR(300)
      )                                                      AS id_movimiento,
      TRY_CONVERT(BIGINT, o.numero_orden)                    AS orden_movimiento,
      CAST(o.numero_orden AS VARCHAR(50))                    AS numero_transaccion,
      CONVERT(date, o.fecha)                                 AS fecha,
      CONVERT(date, o.fecha)                                 AS fecha_real,
      CAST(a.codigo AS VARCHAR(100))                         AS codigo,
      CAST(a.descripcion AS VARCHAR(500))                    AS descripcion,
      CAST(od.cantidad AS INT)                               AS cantidad,
      CAST(d.nombre AS VARCHAR(255))                         AS deposito_origen,
      CAST(NULL AS VARCHAR(255))                             AS deposito_destino,
      CAST('PRODUCCION' AS VARCHAR(50))                      AS tipo_transaccion,
      CAST(NULL AS VARCHAR(255))                             AS motivo,
      CAST(NULL AS VARCHAR(255))                             AS remito_referencia,
      CAST(NULL AS VARCHAR(255))                             AS obra,
      CAST(NULL AS VARCHAR(255))                             AS version,
      CAST(NULL AS VARCHAR(255))                             AS referente,
      CAST(NULL AS INT)                                      AS id_referente,
      CAST(a.proveedor AS VARCHAR(255))                      AS proveedor,
      CAST('E' AS VARCHAR(10))                               AS ingreso_egreso,
      CAST(NULL AS VARCHAR(255))                             AS usuario
    FROM dbo.produccion_orden_detalles od
    JOIN dbo.produccion_ordenes o 
      ON o.id = od.orden_id
    JOIN dbo.articulos a 
      ON a.id_articulo = od.material_id
    JOIN dbo.depositos d 
      ON d.id_deposito = o.deposito_origen_id
  `);

  selects.push(`
    SELECT
      CAST(
        CONCAT(
          'PRODUCCION-I-',
          o.numero_orden,
          '-',
          a.codigo,
          '-',
          o.cantidad
        ) AS VARCHAR(300)
      )                                                      AS id_movimiento,
      TRY_CONVERT(BIGINT, o.numero_orden)                    AS orden_movimiento,
      CAST(o.numero_orden AS VARCHAR(50))                    AS numero_transaccion,
      CONVERT(date, o.fecha)                                 AS fecha,
      CONVERT(date, o.fecha)                                 AS fecha_real,
      CAST(a.codigo AS VARCHAR(100))                         AS codigo,
      CAST(a.descripcion AS VARCHAR(500))                    AS descripcion,
      CAST(o.cantidad AS INT)                                AS cantidad,
      CAST(NULL AS VARCHAR(255))                             AS deposito_origen,
      CAST(d.nombre AS VARCHAR(255))                         AS deposito_destino,
      CAST('PRODUCCION' AS VARCHAR(50))                      AS tipo_transaccion,
      CAST(NULL AS VARCHAR(255))                             AS motivo,
      CAST(NULL AS VARCHAR(255))                             AS remito_referencia,
      CAST(NULL AS VARCHAR(255))                             AS obra,
      CAST(NULL AS VARCHAR(255))                             AS version,
      CAST(NULL AS VARCHAR(255))                             AS referente,
      CAST(NULL AS INT)                                      AS id_referente,
      CAST(a.proveedor AS VARCHAR(255))                      AS proveedor,
      CAST('I' AS VARCHAR(10))                               AS ingreso_egreso,
      CAST(NULL AS VARCHAR(255))                             AS usuario
    FROM dbo.produccion_ordenes o
    JOIN dbo.articulos a 
      ON a.id_articulo = o.producto_id
    JOIN dbo.depositos d 
      ON d.id_deposito = o.deposito_destino_id
  `);

  return `
    FROM (
      ${selects.join("\nUNION ALL\n")}
    ) movimientos
  `;
}

// GET /movimientos
exports.getAll = async (req, res) => {
  try {
    await poolConnect;
    const pool = await getPool();

    const page = Math.max(toInt(req.query.page, 1), 1);
    const pageSizeRaw = Math.max(toInt(req.query.pageSize, 100), 1);
    const pageSize = Math.min(pageSizeRaw, 500);
    const offset = (page - 1) * pageSize;

    const filters = parseFilters(req.query.filters);
    const sortKey = safeText(req.query.sortKey);
    const sortDir = safeText(req.query.sortDir);

    const request = pool.request();
    request.timeout = 120000;

    request.input("offset", sql.Int, offset);
    request.input("pageSize", sql.Int, pageSize);

    const sqlBase = await buildMovimientosBase(pool);
    const where = buildWhere(filters, request);
    const orderBy = getOrderBy(sortKey, sortDir);

    const sqlFinal = `
      SELECT COUNT(*) AS total
      ${sqlBase}
      ${where};

      SELECT *
      ${sqlBase}
      ${where}
      ${orderBy}
      OFFSET @offset ROWS
      FETCH NEXT @pageSize ROWS ONLY;
    `;

    const r = await request.query(sqlFinal);

    const total = Number(r.recordsets?.[0]?.[0]?.total || 0);
    const data = r.recordsets?.[1] || [];

    return res.json({
      data,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize) || 1,
    });
  } catch (err) {
    console.error("movimientos.getAll:", err);

    return res.status(500).json({
      error: "Error al obtener movimientos",
      detalle: err.message,
    });
  }
};

// GET /movimientos/export
exports.exportAll = async (req, res) => {
  try {
    await poolConnect;
    const pool = await getPool();

    const filters = parseFilters(req.query.filters);
    const sortKey = safeText(req.query.sortKey);
    const sortDir = safeText(req.query.sortDir);

    const request = pool.request();
    request.timeout = 180000;

    const sqlBase = await buildMovimientosBase(pool);
    const where = buildWhere(filters, request);
    const orderBy = getOrderBy(sortKey, sortDir);

    const sqlFinal = `
      SELECT *
      ${sqlBase}
      ${where}
      ${orderBy};
    `;

    const r = await request.query(sqlFinal);

    return res.json(r.recordset || []);
  } catch (err) {
    console.error("movimientos.exportAll:", err);

    return res.status(500).json({
      error: "Error al exportar movimientos",
      detalle: err.message,
    });
  }
};

// GET /movimientos/distinct
exports.getDistinctValues = async (req, res) => {
  try {
    await poolConnect;
    const pool = await getPool();

    const column = safeText(req.query.column);
    const search = safeText(req.query.search);
    const filters = parseFilters(req.query.filters);

    const columnSql = FILTER_COLUMNS[column];

    if (!columnSql) {
      return res.status(400).json({
        error: "Columna inválida para filtro",
      });
    }

    const request = pool.request();
    request.timeout = 120000;

    const sqlBase = await buildMovimientosBase(pool);

    const filtersWithoutCurrent = { ...filters };
    delete filtersWithoutCurrent[column];

    const whereParts = [];

    const whereOther = buildWhere(filtersWithoutCurrent, request);
    if (whereOther) {
      whereParts.push(whereOther.replace(/^WHERE\s+/i, ""));
    }

    if (search) {
      request.input("search", sql.NVarChar, `%${search}%`);
      whereParts.push(`CAST(${columnSql} AS NVARCHAR(MAX)) LIKE @search`);
    }

    const whereFinal = whereParts.length
      ? `WHERE ${whereParts.join(" AND ")}`
      : "";

    const query = `
      SELECT TOP 300
        value
      FROM (
        SELECT DISTINCT
          CASE 
            WHEN ${columnSql} IS NULL THEN ''
            ELSE CAST(${columnSql} AS NVARCHAR(500))
          END AS value
        ${sqlBase}
        ${whereFinal}
      ) x
      ORDER BY value;
    `;

    const r = await request.query(query);

    return res.json(
      (r.recordset || []).map((x) => ({
        value: x.value ?? "",
        label:
          x.value === null || x.value === undefined || x.value === ""
            ? "(Vacíos)"
            : String(x.value),
      })),
    );
  } catch (err) {
    console.error("movimientos.getDistinctValues:", err);

    return res.status(500).json({
      error: "Error al obtener valores del filtro",
      detalle: err.message,
    });
  }
};

// PUT /movimientos
exports.updateMovimientoCabecera = async (req, res) => {
  try {
    const {
      tipo_transaccion,
      numero_transaccion,
      remito_referencia,
      obra,
      version,
      id_referente,
    } = req.body || {};

    const tipo = String(tipo_transaccion || "")
      .trim()
      .toUpperCase();

    const numeroRaw = String(numero_transaccion || "").trim();

    if (!tipo || !numeroRaw) {
      return res.status(400).json({
        error: "Debe indicar tipo_transaccion y numero_transaccion",
      });
    }

    const remitoReferencia =
      remito_referencia == null || String(remito_referencia).trim() === ""
        ? null
        : String(remito_referencia).trim();

    const obraFinal =
      obra == null || String(obra).trim() === "" ? null : String(obra).trim();

    const versionFinal =
      version == null || String(version).trim() === ""
        ? null
        : String(version).trim();

    const referenteFinal =
      id_referente == null || String(id_referente).trim() === ""
        ? null
        : Number(id_referente);

    if (referenteFinal !== null && !Number.isFinite(referenteFinal)) {
      return res.status(400).json({ error: "Actuante inválido" });
    }

    await poolConnect;
    const pool = await getPool();

    if (referenteFinal !== null) {
      const ref = await pool.request().input("id", sql.Int, referenteFinal)
        .query(`
          SELECT TOP 1 id_referente, activo
          FROM dbo.referentes
          WHERE id_referente = @id
        `);

      if (!ref.recordset.length) {
        return res.status(400).json({ error: "Actuante inexistente" });
      }

      if (!ref.recordset[0].activo) {
        return res.status(400).json({ error: "Actuante inactivo" });
      }
    }

    if (tipo === "AJUSTE") {
      const numero = Number(numeroRaw);

      if (!Number.isFinite(numero)) {
        return res.status(400).json({ error: "Número de ajuste inválido" });
      }

      const r = await pool
        .request()
        .input("numero", sql.Int, numero)
        .input("remito", sql.VarChar, remitoReferencia)
        .input("obra", sql.NVarChar(sql.MAX), obraFinal)
        .input("version", sql.NVarChar(sql.MAX), versionFinal)
        .input("referente", sql.Int, referenteFinal).query(`
          UPDATE dbo.ajustes
          SET
            remito_referencia = @remito,
            obra = @obra,
            version = @version,
            id_referente = @referente
          WHERE numero_ajuste = @numero;

          SELECT @@ROWCOUNT AS affected;
        `);

      if (Number(r.recordset[0].affected) !== 1) {
        return res.status(404).json({ error: "Ajuste no encontrado" });
      }

      return res.json({
        ok: true,
        message: "Ajuste actualizado correctamente",
      });
    }

    if (tipo === "TRANSFERENCIA") {
      const r = await pool
        .request()
        .input("numero", sql.VarChar, numeroRaw)
        .input("remito", sql.VarChar, remitoReferencia)
        .input("referente", sql.Int, referenteFinal).query(`
          UPDATE dbo.transferencias
          SET
            remito_referencia = @remito,
            id_referente = @referente
          WHERE numero_transferencia = @numero;

          SELECT @@ROWCOUNT AS affected;
        `);

      if (Number(r.recordset[0].affected) !== 1) {
        return res.status(404).json({ error: "Transferencia no encontrada" });
      }

      return res.json({
        ok: true,
        message: "Transferencia actualizada correctamente",
      });
    }

    if (tipo === "REMITO") {
      return res.status(400).json({
        error:
          "Los remitos no se editan desde Movimientos. Editá el remito desde el módulo Remitos.",
      });
    }

    return res.status(400).json({
      error:
        "Solo se permite editar movimientos de tipo AJUSTE, TRANSFERENCIA o REMITO",
    });
  } catch (err) {
    console.error("movimientos.updateMovimientoCabecera:", err);

    return res.status(500).json({
      error: "Error al actualizar movimiento",
      detalle: err.message,
    });
  }
};

// GET /movimientos/transaccion/:numero
exports.getByNumeroTransaccion = async (req, res) => {
  try {
    const numeroRaw = String(req.params.numero || "").trim();

    if (!numeroRaw) {
      return res.status(400).json({
        error: "Debe indicar un número de transacción",
      });
    }

    await poolConnect;
    const pool = await getPool();

    const transfDetalleTable = await pickExistingTable(pool, [
      "transferencias_detalle",
      "transferencia_detalles",
      "transferencias_detalles",
    ]);

    const ajusteDetalleTable = await pickExistingTable(pool, [
      "ajustes_detalles",
      "ajuste_detalles",
    ]);

    const ajustesTable = await pickExistingTable(pool, ["ajustes"]);
    const remitosTable = await pickExistingTable(pool, ["remitos"]);
    const remitosDetTable = await pickExistingTable(pool, ["remitos_detalles"]);

    const selects = [];

    if (transfDetalleTable) {
      selects.push(`
        SELECT
          CAST(
            CONCAT(
              'TRANSFERENCIA-',
              t.numero_transferencia,
              '-',
              a.codigo,
              '-',
              td.cantidad
            ) AS VARCHAR(300)
          )                                                  AS id_movimiento,
          TRY_CONVERT(BIGINT, t.numero_transferencia)        AS orden_movimiento,
          CAST(t.numero_transferencia AS VARCHAR(50))        AS numero_transaccion,
          CONVERT(date, t.fecha)                             AS fecha,
          CONVERT(date, ISNULL(t.fecha_real, t.fecha))        AS fecha_real,
          CAST(a.codigo AS VARCHAR(100))                     AS codigo,
          CAST(a.descripcion AS VARCHAR(500))                AS descripcion,
          CAST(td.cantidad AS INT)                           AS cantidad,
          CAST(t.origen AS VARCHAR(255))                     AS deposito_origen,
          CAST(t.destino AS VARCHAR(255))                    AS deposito_destino,
          CAST('TRANSFERENCIA' AS VARCHAR(50))               AS tipo_transaccion,
          CAST(NULL AS VARCHAR(255))                         AS motivo,
          CAST(t.remito_referencia AS VARCHAR(255))          AS remito_referencia,
          CAST(NULL AS VARCHAR(255))                         AS obra,
          CAST(NULL AS VARCHAR(255))                         AS version,
          CAST(ref.nombre AS VARCHAR(255))                   AS referente,
          t.id_referente                                     AS id_referente,
          CAST(a.proveedor AS VARCHAR(255))                  AS proveedor,
          CAST(NULL AS VARCHAR(10))                          AS ingreso_egreso,
          CAST(t.usuario AS VARCHAR(255))                    AS usuario
        FROM dbo.transferencias t
        JOIN dbo.${transfDetalleTable} td
          ON td.transferencia_id = t.id
        JOIN dbo.articulos a
          ON a.id_articulo = td.articulo_id
        LEFT JOIN dbo.referentes ref
          ON ref.id_referente = t.id_referente
        WHERE CAST(t.numero_transferencia AS VARCHAR(50)) = @numero
      `);
    }

    if (ajustesTable && ajusteDetalleTable) {
      selects.push(`
        SELECT
          CAST(
            CONCAT(
              'AJUSTE-',
              a.numero_ajuste,
              '-',
              ad.cod_articulo,
              '-',
              ad.cantidad
            ) AS VARCHAR(300)
          )                                                  AS id_movimiento,
          TRY_CONVERT(BIGINT, a.numero_ajuste)               AS orden_movimiento,
          CAST(a.numero_ajuste AS VARCHAR(50))               AS numero_transaccion,
          CONVERT(date, a.fecha)                             AS fecha,
          CONVERT(date, ISNULL(a.fecha_real, a.fecha))        AS fecha_real,
          CAST(ad.cod_articulo AS VARCHAR(100))              AS codigo,
          CAST(ad.descripcion AS VARCHAR(500))               AS descripcion,
          ABS(CAST(ad.cantidad AS INT))                      AS cantidad,
          CAST(
            CASE 
              WHEN CAST(ad.cantidad AS INT) < 0 THEN a.deposito 
              ELSE NULL 
            END AS VARCHAR(255)
          )                                                  AS deposito_origen,
          CAST(
            CASE 
              WHEN CAST(ad.cantidad AS INT) > 0 THEN a.deposito 
              ELSE NULL 
            END AS VARCHAR(255)
          )                                                  AS deposito_destino,
          CAST('AJUSTE' AS VARCHAR(50))                      AS tipo_transaccion,
          CAST(COALESCE(am.nombre, a.motivo) AS VARCHAR(255)) AS motivo,
          CAST(a.remito_referencia AS VARCHAR(255))          AS remito_referencia,
          CAST(a.obra AS VARCHAR(255))                       AS obra,
          CAST(a.version AS VARCHAR(255))                    AS version,
          CAST(ref.nombre AS VARCHAR(255))                   AS referente,
          a.id_referente                                     AS id_referente,
          CAST(art.proveedor AS VARCHAR(255))                AS proveedor,
          CAST(
            CASE 
              WHEN CAST(ad.cantidad AS INT) < 0 THEN 'E'
              WHEN CAST(ad.cantidad AS INT) > 0 THEN 'I'
              ELSE ''
            END AS VARCHAR(10)
          )                                                  AS ingreso_egreso,
          CAST(a.usuario AS VARCHAR(255))                    AS usuario
        FROM dbo.${ajustesTable} a
        JOIN dbo.${ajusteDetalleTable} ad
          ON ad.ajuste_id = a.numero_ajuste
        LEFT JOIN dbo.ajustes_motivos am
          ON am.id_motivo = a.motivo_id
        LEFT JOIN dbo.articulos art
          ON UPPER(LTRIM(RTRIM(art.codigo))) = UPPER(LTRIM(RTRIM(ad.cod_articulo)))
        LEFT JOIN dbo.referentes ref
          ON ref.id_referente = a.id_referente
        WHERE CAST(a.numero_ajuste AS VARCHAR(50)) = @numero
      `);
    }

    if (remitosTable && remitosDetTable) {
      selects.push(`
        SELECT
          CAST(
            CONCAT(
              'REMITO-',
              r.numero_transaccion,
              '-',
              rd.cod_articulo,
              '-',
              rd.cantidad
            ) AS VARCHAR(300)
          )                                                  AS id_movimiento,
          TRY_CONVERT(BIGINT, r.numero_transaccion)          AS orden_movimiento,
          CAST(r.numero_transaccion AS VARCHAR(50))          AS numero_transaccion,
          CONVERT(date, r.fecha)                             AS fecha,
          CONVERT(date, r.fecha)                             AS fecha_real,
          CAST(rd.cod_articulo AS VARCHAR(100))              AS codigo,
          CAST(rd.descripcion AS VARCHAR(500))               AS descripcion,
          ABS(CAST(rd.cantidad AS INT))                      AS cantidad,
          CAST(
            CASE 
              WHEN r.tipo = 'SALIDA' THEN r.deposito_nombre 
              ELSE NULL 
            END AS VARCHAR(255)
          )                                                  AS deposito_origen,
          CAST(
            CASE 
              WHEN r.tipo <> 'SALIDA' THEN r.deposito_nombre 
              ELSE NULL 
            END AS VARCHAR(255)
          )                                                  AS deposito_destino,
          CAST('REMITO' AS VARCHAR(50))                      AS tipo_transaccion,
          CAST(NULL AS VARCHAR(255))                         AS motivo,
          CAST(r.numero_remito AS VARCHAR(255))              AS remito_referencia,
          CAST(NULL AS VARCHAR(255))                         AS obra,
          CAST(NULL AS VARCHAR(255))                         AS version,
          CAST(NULL AS VARCHAR(255))                         AS referente,
          CAST(NULL AS INT)                                  AS id_referente,
          CAST(r.proveedor AS VARCHAR(255))                  AS proveedor,
          CAST(
            CASE 
              WHEN r.tipo = 'SALIDA' THEN 'E'
              ELSE 'I'
            END AS VARCHAR(10)
          )                                                  AS ingreso_egreso,
          CAST(r.usuario AS VARCHAR(255))                    AS usuario
        FROM dbo.${remitosTable} r
        JOIN dbo.${remitosDetTable} rd
          ON rd.remito_id = r.numero_remito
        WHERE CAST(r.numero_transaccion AS VARCHAR(50)) = @numero
      `);
    }

    if (!selects.length) return res.json([]);

    const sqlFinal = `
      SELECT *
      FROM (
        ${selects.join("\nUNION ALL\n")}
      ) movimientos
      ORDER BY tipo_transaccion, codigo;
    `;

    const r = await pool
      .request()
      .input("numero", sql.VarChar, numeroRaw)
      .query(sqlFinal);

    return res.json(r.recordset || []);
  } catch (err) {
    console.error("movimientos.getByNumeroTransaccion:", err);

    return res.status(500).json({
      error: "Error al buscar la transacción",
      detalle: err.message,
    });
  }
};

// PUT /movimientos/masivo
exports.updateMovimientoCabeceraMasivo = async (req, res) => {
  try {
    const {
      tipo_transaccion,
      numero_transaccion,
      remito_referencia,
      obra,
      version,
      id_referente,
    } = req.body || {};

    const tipo = String(tipo_transaccion || "")
      .trim()
      .toUpperCase();

    const numeroRaw = String(numero_transaccion || "").trim();

    if (!tipo || !numeroRaw) {
      return res.status(400).json({
        error: "Debe indicar tipo_transaccion y numero_transaccion",
      });
    }

    const remitoReferencia =
      remito_referencia == null || String(remito_referencia).trim() === ""
        ? null
        : String(remito_referencia).trim();

    const obraFinal =
      obra == null || String(obra).trim() === "" ? null : String(obra).trim();

    const versionFinal =
      version == null || String(version).trim() === ""
        ? null
        : String(version).trim();

    const referenteFinal =
      id_referente == null || String(id_referente).trim() === ""
        ? null
        : Number(id_referente);

    if (referenteFinal !== null && !Number.isFinite(referenteFinal)) {
      return res.status(400).json({ error: "Actuante inválido" });
    }

    await poolConnect;
    const pool = await getPool();

    if (referenteFinal !== null) {
      const ref = await pool.request().input("id", sql.Int, referenteFinal)
        .query(`
          SELECT TOP 1 id_referente, activo
          FROM dbo.referentes
          WHERE id_referente = @id
        `);

      if (!ref.recordset.length) {
        return res.status(400).json({ error: "Actuante inexistente" });
      }

      if (!ref.recordset[0].activo) {
        return res.status(400).json({ error: "Actuante inactivo" });
      }
    }

    if (tipo === "AJUSTE") {
      const numero = Number(numeroRaw);

      if (!Number.isFinite(numero)) {
        return res.status(400).json({ error: "Número de ajuste inválido" });
      }

      const r = await pool
        .request()
        .input("numero", sql.Int, numero)
        .input("remito", sql.VarChar, remitoReferencia)
        .input("obra", sql.NVarChar(sql.MAX), obraFinal)
        .input("version", sql.NVarChar(sql.MAX), versionFinal)
        .input("referente", sql.Int, referenteFinal).query(`
          UPDATE dbo.ajustes
          SET
            remito_referencia = @remito,
            obra = @obra,
            version = @version,
            id_referente = @referente
          WHERE numero_ajuste = @numero;

          SELECT @@ROWCOUNT AS affected;
        `);

      if (Number(r.recordset[0].affected) !== 1) {
        return res.status(404).json({ error: "Ajuste no encontrado" });
      }

      return res.json({
        ok: true,
        message: "Transacción de ajuste actualizada correctamente",
      });
    }

    if (tipo === "TRANSFERENCIA") {
      const r = await pool
        .request()
        .input("numero", sql.VarChar, numeroRaw)
        .input("remito", sql.VarChar, remitoReferencia)
        .input("referente", sql.Int, referenteFinal).query(`
          UPDATE dbo.transferencias
          SET
            remito_referencia = @remito,
            id_referente = @referente
          WHERE numero_transferencia = @numero;

          SELECT @@ROWCOUNT AS affected;
        `);

      if (Number(r.recordset[0].affected) !== 1) {
        return res.status(404).json({ error: "Transferencia no encontrada" });
      }

      return res.json({
        ok: true,
        message: "Transacción de transferencia actualizada correctamente",
      });
    }

    if (tipo === "REMITO") {
      return res.status(400).json({
        error:
          "Los remitos no se editan desde Movimientos. Editá el remito desde el módulo Remitos.",
      });
    }

    return res.status(400).json({
      error: "Solo se permite edición masiva de AJUSTE, TRANSFERENCIA o REMITO",
    });
  } catch (err) {
    console.error("movimientos.updateMovimientoCabeceraMasivo:", err);

    return res.status(500).json({
      error: "Error al actualizar masivamente la transacción",
      detalle: err.message,
    });
  }
};

// Alias para rutas existentes
exports.update = exports.updateMovimientoCabecera;
exports.updateMasivo = exports.updateMovimientoCabeceraMasivo;
exports.getByTransaccion = exports.getByNumeroTransaccion;