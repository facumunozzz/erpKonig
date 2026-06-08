// backend/controllers/remitos.js
const { sql, poolConnect, getPool } = require("../db");

const up = (v) =>
  String(v ?? "")
    .trim()
    .toUpperCase();

const clean = (v) =>
  String(v ?? "")
    .trim()
    .replace(/\s+/g, " ");

const asInt = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : NaN;
};

const ESTADO_DEFAULT = "CONFIRMADO";
const DEPOSITO_FIJO = "RECEPCION";
const UBICACION_FIJA = "GENERAL";

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

const REMITOS_SORT_COLUMNS = new Set([
  "numero_transaccion",
  "numero_remito",
  "fecha",
  "deposito",
  "tipo",
  "usuario",
  "observacion",
  "estado",
  "nro_entrega",
  "pedido",
  "proveedor",
]);

const REMITOS_FILTER_COLUMNS = {
  numero_transaccion: "r.numero_transaccion",
  numero_remito: "r.numero_remito",
  fecha: "r.fecha",
  deposito: "r.deposito_nombre",
  tipo: "r.tipo",
  usuario: "r.usuario",
  observacion: "r.observacion",
  estado: "r.estado",
  nro_entrega: "r.nro_entrega",
  pedido: "r.pedido",
  proveedor: "r.proveedor",
};

function getRemitosOrderBy(sortKey, sortDir) {
  const key = REMITOS_SORT_COLUMNS.has(sortKey) ? sortKey : "";
  const dir = String(sortDir || "").toLowerCase() === "asc" ? "ASC" : "DESC";

  const map = {
    numero_transaccion: "r.numero_transaccion",
    numero_remito: "r.numero_remito",
    fecha: "r.fecha",
    deposito: "r.deposito_nombre",
    tipo: "r.tipo",
    usuario: "r.usuario",
    observacion: "r.observacion",
    estado: "r.estado",
    nro_entrega: "r.nro_entrega",
    pedido: "r.pedido",
    proveedor: "r.proveedor",
  };

  if (!key) {
    return `
      ORDER BY
        r.numero_transaccion DESC,
        r.fecha DESC,
        r.numero_remito DESC
    `;
  }

  return `
    ORDER BY
      ${map[key]} ${dir},
      r.numero_transaccion DESC,
      r.fecha DESC,
      r.numero_remito DESC
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
          `(${columnSql} IS NULL OR CAST(${columnSql} AS NVARCHAR(MAX)) = '')`
        );
      } else {
        request.input(paramName, sql.NVarChar, value);
        orParts.push(`CAST(${columnSql} AS NVARCHAR(MAX)) = @${paramName}`);
      }
    });

    where.push(`(${orParts.join(" OR ")})`);
    return;
  }

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
          `(${columnSql} IS NOT NULL AND CAST(${columnSql} AS NVARCHAR(MAX)) <> '')`
        );
      } else {
        request.input(paramName, sql.NVarChar, value);
        andParts.push(
          `(${columnSql} IS NULL OR CAST(${columnSql} AS NVARCHAR(MAX)) <> @${paramName})`
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

function buildRemitosWhere(filters, request, exceptKey = null) {
  const where = [];

  Object.entries(REMITOS_FILTER_COLUMNS).forEach(([key, columnSql]) => {
    if (key === exceptKey) return;
    addFilter(request, where, filters, key, columnSql);
  });

  return where.length ? `WHERE ${where.join(" AND ")}` : "";
}

async function resolveDeposito(pool, { deposito_id, deposito_nombre }) {
  if (deposito_id != null) {
    const id = asInt(deposito_id);
    if (!Number.isFinite(id) || id <= 0) return null;

    const r = await pool.request().input("id", sql.Int, id).query(`
      SELECT id_deposito, nombre
      FROM dbo.depositos WITH (NOLOCK)
      WHERE id_deposito = @id
    `);

    if (!r.recordset.length) return null;

    return {
      id_deposito: Number(r.recordset[0].id_deposito),
      nombre: r.recordset[0].nombre,
    };
  }

  const nom = clean(deposito_nombre);
  if (!nom) return null;

  const r = await pool.request().input("n", sql.VarChar(200), nom).query(`
    SELECT TOP 1 id_deposito, nombre
    FROM dbo.depositos WITH (NOLOCK)
    WHERE UPPER(LTRIM(RTRIM(nombre))) = UPPER(LTRIM(RTRIM(@n)))
  `);

  if (!r.recordset.length) return null;

  return {
    id_deposito: Number(r.recordset[0].id_deposito),
    nombre: r.recordset[0].nombre,
  };
}

async function resolveUbicacion(pool, depositoId, nombreUbicacion = UBICACION_FIJA) {
  const nom = up(nombreUbicacion);

  const r = await pool
    .request()
    .input("dep", sql.Int, depositoId)
    .input("nom", sql.VarChar(200), nom).query(`
      SELECT TOP 1 id_ubicacion, id_deposito, nombre, activa
      FROM dbo.ubicaciones WITH (NOLOCK)
      WHERE id_deposito = @dep
        AND activa = 1
        AND UPPER(LTRIM(RTRIM(nombre))) = @nom
      ORDER BY id_ubicacion
    `);

  return r.recordset[0] || null;
}

async function resolveProveedor(pool, proveedorNombre) {
  const nombre = clean(proveedorNombre);
  if (!nombre) return null;

  const tableExists = await pool.request().query(`
    SELECT OBJECT_ID('dbo.proveedores', 'U') AS id
  `);

  if (!tableExists.recordset[0]?.id) {
    return null;
  }

  const cols = await pool.request().query(`
    SELECT COLUMN_NAME
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = 'dbo'
      AND TABLE_NAME = 'proveedores'
  `);

  const colNames = (cols.recordset || []).map((c) => String(c.COLUMN_NAME));
  const preferredCols = ["nombre", "proveedor", "descripcion", "razon_social"];
  const nameCol = preferredCols.find((c) =>
    colNames.some((x) => x.toLowerCase() === c.toLowerCase())
  );

  if (!nameCol) {
    throw new Error(
      "La tabla dbo.proveedores existe, pero no encuentro una columna nombre/proveedor/descripcion/razon_social."
    );
  }

  const safeCol = `[${nameCol.replace(/]/g, "]]")}]`;

  const r = await pool.request().input("p", sql.VarChar(300), nombre).query(`
    SELECT TOP 1 ${safeCol} AS proveedor
    FROM dbo.proveedores WITH (NOLOCK)
    WHERE UPPER(LTRIM(RTRIM(${safeCol}))) = UPPER(LTRIM(RTRIM(@p)))
  `);

  if (!r.recordset.length) return null;

  return clean(r.recordset[0].proveedor);
}

exports.getProveedores = async (_req, res) => {
  try {
    await poolConnect;
    const pool = await getPool();

    const r = await pool.request().query(`
      SELECT
        id_proveedor,
        nombre,
        activo
      FROM dbo.proveedores WITH (NOLOCK)
      WHERE ISNULL(activo, 1) = 1
      ORDER BY nombre
    `);

    return res.json(r.recordset || []);
  } catch (err) {
    console.error("remitos.getProveedores:", err);
    return res.status(500).json({
      error: "Error al listar proveedores",
      detalle: err.message,
    });
  }
};

async function getArticulosByCodigos(poolOrTrans, codigos) {
  const cods = Array.from(new Set((codigos || []).map(up).filter(Boolean)));

  if (!cods.length) return new Map();

  const request =
    poolOrTrans instanceof sql.Transaction
      ? new sql.Request(poolOrTrans)
      : poolOrTrans.request();

  const ph = cods.map((_, i) => `@c${i}`).join(",");

  cods.forEach((c, i) => {
    request.input(`c${i}`, sql.VarChar(80), c);
  });

  const r = await request.query(`
    SELECT
      id_articulo,
      UPPER(LTRIM(RTRIM(codigo))) AS cod,
      descripcion
    FROM dbo.articulos WITH (NOLOCK)
    WHERE UPPER(LTRIM(RTRIM(codigo))) IN (${ph})
  `);

  const map = new Map();

  for (const row of r.recordset || []) {
    map.set(up(row.cod), row);
  }

  return map;
}

async function upsertStockUbicDelta(tr, { idUbicacion, idArticulo, delta }) {
  const r = new sql.Request(tr);

  await r
    .input("u", sql.Int, idUbicacion)
    .input("a", sql.Int, idArticulo)
    .input("d", sql.Int, delta).query(`
      MERGE dbo.stock_ubicaciones WITH (HOLDLOCK) AS t
      USING (SELECT @u AS id_ubicacion, @a AS id_articulo) AS s
        ON (t.id_ubicacion = s.id_ubicacion AND t.id_articulo = s.id_articulo)
      WHEN MATCHED THEN
        UPDATE SET cantidad = ISNULL(t.cantidad, 0) + @d
      WHEN NOT MATCHED THEN
        INSERT (id_ubicacion, id_articulo, cantidad)
        VALUES (s.id_ubicacion, s.id_articulo, @d);
    `);
}

async function upsertStockDelta(tr, { idDeposito, idUbicacion, idArticulo, delta }) {
  const r = new sql.Request(tr);

  await r
    .input("dep", sql.Int, idDeposito)
    .input("ub", sql.Int, idUbicacion)
    .input("a", sql.Int, idArticulo)
    .input("d", sql.Decimal(18, 2), delta).query(`
      MERGE dbo.stock WITH (HOLDLOCK) AS t
      USING (
        SELECT
          @dep AS id_deposito,
          @ub AS id_ubicacion,
          @a AS id_articulo
      ) AS s
        ON (
          t.id_deposito = s.id_deposito
          AND t.id_ubicacion = s.id_ubicacion
          AND t.id_articulo = s.id_articulo
        )
      WHEN MATCHED THEN
        UPDATE SET cantidad = ISNULL(t.cantidad, 0) + @d
      WHEN NOT MATCHED THEN
        INSERT (
          id_deposito,
          id_ubicacion,
          id_articulo,
          cantidad,
          asignado
        )
        VALUES (
          s.id_deposito,
          s.id_ubicacion,
          s.id_articulo,
          @d,
          0
        );
    `);
}

function normalizeHeaderKey(k) {
  return String(k ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function getCell(row, possibleNames) {
  const normalized = {};

  for (const key of Object.keys(row || {})) {
    normalized[normalizeHeaderKey(key)] = row[key];
  }

  for (const name of possibleNames) {
    const nk = normalizeHeaderKey(name);
    if (Object.prototype.hasOwnProperty.call(normalized, nk)) {
      return normalized[nk];
    }
  }

  return "";
}

function normalizeImportRows(rowsRaw) {
  const rows = Array.isArray(rowsRaw) ? rowsRaw : [];

  return rows
    .map((row, index) => {
      const nro_remito = clean(
        getCell(row, ["N° Remito", "Nro Remito", "Remito", "Numero Remito"])
      );
      const nro_entrega = clean(
        getCell(row, ["N° Entrega", "Nro Entrega", "Entrega", "Numero Entrega"])
      );
      const pedido = clean(getCell(row, ["Pedido", "PEDIDO"]));
      const cod_articulo = up(
        getCell(row, ["Artículo", "Articulo", "Codigo", "Código", "Cod Articulo"])
      );
      const cantidad = Number(getCell(row, ["Cantidad", "CANTIDAD"]));
      const proveedor = clean(getCell(row, ["Proveedor", "PROVEEDOR"]));

      return {
        fila_excel: index + 2,
        nro_remito,
        nro_entrega,
        pedido,
        cod_articulo,
        cantidad,
        proveedor,
      };
    })
    .filter((r) => {
      return (
        r.nro_remito ||
        r.nro_entrega ||
        r.pedido ||
        r.cod_articulo ||
        r.cantidad ||
        r.proveedor
      );
    });
}

async function obtenerProximoNumeroTransaccionRemito(trans) {
  const r = await new sql.Request(trans).query(`
    SELECT ISNULL(MAX(n), 0) + 1 AS proximo
    FROM (
      SELECT TRY_CONVERT(BIGINT, numero_ajuste) AS n
      FROM dbo.ajustes

      UNION ALL

      SELECT TRY_CONVERT(BIGINT, numero_transferencia) AS n
      FROM dbo.transferencias

      UNION ALL

      SELECT TRY_CONVERT(BIGINT, numero_transaccion) AS n
      FROM dbo.remitos
    ) x
    WHERE n IS NOT NULL;
  `);

  return Number(r.recordset[0]?.proximo || 1);
}

async function crearRemitoCore(pool, body) {
  const nro_remito = clean(body.nro_remito);
  const tipo = up(body.tipo || "ENTRADA");
  const usuario = body.usuario != null ? clean(body.usuario) : null;
  const observacion = body.observacion != null ? clean(body.observacion) : null;

  const nro_entrega = body.nro_entrega != null ? clean(body.nro_entrega) : null;
  const pedido = body.pedido != null ? clean(body.pedido) : null;
  const proveedor = body.proveedor != null ? clean(body.proveedor) : null;

  const itemsRaw = Array.isArray(body.items) ? body.items : [];

  if (!nro_remito || tipo !== "ENTRADA" || !itemsRaw.length) {
    return {
      status: 400,
      payload: {
        error:
          "Datos incompletos. El remito debe tener nro_remito, tipo ENTRADA e ítems.",
      },
    };
  }

  if (!proveedor) {
    return {
      status: 400,
      payload: {
        error: "Debe indicar proveedor.",
      },
    };
  }

  const proveedorValidado = await resolveProveedor(pool, proveedor);

  if (!proveedorValidado) {
    return {
      status: 400,
      payload: {
        error: "Proveedor inexistente",
        detalle: proveedor,
      },
    };
  }

  const normItems = itemsRaw
    .map((it) => ({
      cod: up(it.cod_articulo ?? it.cod ?? it.codigo),
      cant: Number(it.cantidad),
    }))
    .filter((i) => i.cod && Number.isFinite(i.cant) && i.cant > 0);

  if (!normItems.length) {
    return {
      status: 400,
      payload: {
        error: "Ítems inválidos.",
      },
    };
  }

  const dep = await resolveDeposito(pool, {
    deposito_nombre: DEPOSITO_FIJO,
  });

  if (!dep) {
    return {
      status: 400,
      payload: {
        error: `No existe el depósito fijo ${DEPOSITO_FIJO}.`,
      },
    };
  }

  const ubicacion = await resolveUbicacion(pool, dep.id_deposito, UBICACION_FIJA);

  if (!ubicacion) {
    return {
      status: 400,
      payload: {
        error: `No existe la ubicación ${UBICACION_FIJA} activa para el depósito ${DEPOSITO_FIJO}.`,
      },
    };
  }

  let trans;

  try {
    trans = new sql.Transaction(pool);
    await trans.begin();

    const numeroTransaccion = await obtenerProximoNumeroTransaccionRemito(trans);

    const execT = async (sqlText, bindFn) => {
      const r = new sql.Request(trans);
      if (bindFn) bindFn(r);
      return r.query(sqlText);
    };

    const chk = await execT(
      `
      SELECT 1
      FROM dbo.remitos WITH (UPDLOCK, HOLDLOCK)
      WHERE numero_remito = @n
      `,
      (r) => r.input("n", sql.VarChar(50), nro_remito)
    );

    if (chk.recordset.length) {
      await trans.rollback();
      return {
        status: 400,
        payload: {
          error: "Número de remito ya existe",
          detalle: nro_remito,
        },
      };
    }

    const cods = Array.from(new Set(normItems.map((i) => i.cod)));
    const byCod = await getArticulosByCodigos(trans, cods);

    const faltan = cods.filter((c) => !byCod.has(c));

    if (faltan.length) {
      await trans.rollback();
      return {
        status: 400,
        payload: {
          error: "No se importó nada. Hay artículos inexistentes.",
          detalle: faltan,
        },
      };
    }

    await execT(
      `
      INSERT INTO dbo.remitos
        (
          numero_transaccion,
          numero_remito,
          fecha,
          deposito_id,
          deposito_nombre,
          tipo,
          usuario,
          observacion,
          estado,
          nro_entrega,
          pedido,
          proveedor
        )
      VALUES
        (
          @numeroTransaccion,
          @n,
          GETDATE(),
          @depId,
          @depNom,
          @t,
          @u,
          @o,
          @estado,
          @nroEntrega,
          @pedido,
          @proveedor
        )
      `,
      (r) =>
        r
          .input("numeroTransaccion", sql.BigInt, numeroTransaccion)
          .input("n", sql.VarChar(50), nro_remito)
          .input("depId", sql.Int, dep.id_deposito)
          .input("depNom", sql.VarChar(200), dep.nombre)
          .input("t", sql.VarChar(20), tipo)
          .input("u", sql.VarChar(120), usuario)
          .input("o", sql.VarChar(400), observacion || null)
          .input("estado", sql.VarChar(30), ESTADO_DEFAULT)
          .input("nroEntrega", sql.VarChar(80), nro_entrega || null)
          .input("pedido", sql.VarChar(80), pedido || null)
          .input("proveedor", sql.VarChar(200), proveedorValidado)
    );

    for (const it of normItems) {
      const art = byCod.get(it.cod);
      const idArt = Number(art.id_articulo);

      await execT(
        `
        INSERT INTO dbo.remitos_detalles
          (remito_id, cod_articulo, descripcion, cantidad, id_ubicacion)
        VALUES
          (@r, @c, @desc, @q, @ub)
        `,
        (r) =>
          r
            .input("r", sql.VarChar(50), nro_remito)
            .input("c", sql.VarChar(80), it.cod)
            .input("desc", sql.VarChar(300), art.descripcion)
            .input("q", sql.Int, it.cant)
            .input("ub", sql.Int, ubicacion.id_ubicacion)
      );

      await upsertStockUbicDelta(trans, {
        idUbicacion: Number(ubicacion.id_ubicacion),
        idArticulo: idArt,
        delta: it.cant,
      });

      await upsertStockDelta(trans, {
        idDeposito: dep.id_deposito,
        idUbicacion: Number(ubicacion.id_ubicacion),
        idArticulo: idArt,
        delta: it.cant,
      });
    }

    await trans.commit();

    return {
      status: 201,
      payload: {
        ok: true,
        numero_transaccion: numeroTransaccion,
        numero_remito: nro_remito,
      },
    };
  } catch (err) {
    try {
      if (trans) await trans.rollback();
    } catch {}

    throw err;
  }
}

// GET /remitos
exports.getAll = async (req, res) => {
  try {
    await poolConnect;
    const pool = await getPool();

    const page = Math.max(toInt(req.query.page, 1), 1);
    const pageSizeRaw = Math.max(toInt(req.query.pageSize, 25), 1);
    const pageSize = Math.min(pageSizeRaw, 500);
    const offset = (page - 1) * pageSize;

    const filters = parseFilters(req.query.filters);
    const sortKey = safeText(req.query.sortKey);
    const sortDir = safeText(req.query.sortDir);

    const request = pool.request();
    request.timeout = 120000;

    request.input("offset", sql.Int, offset);
    request.input("pageSize", sql.Int, pageSize);

    const where = buildRemitosWhere(filters, request);
    const orderBy = getRemitosOrderBy(sortKey, sortDir);

    const sqlFinal = `
      SELECT COUNT(*) AS total
      FROM dbo.remitos r WITH (NOLOCK)
      ${where};

      SELECT
        r.numero_remito AS id,
        r.numero_transaccion,
        r.numero_remito,
        r.deposito_nombre AS deposito,
        r.deposito_id,
        r.tipo,
        r.usuario,
        r.observacion,
        r.estado,
        r.fecha,
        r.nro_entrega,
        r.pedido,
        r.proveedor
      FROM dbo.remitos r WITH (NOLOCK)
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
    console.error("remitos.getAll:", err);
    return res.status(500).json({
      error: "Error al listar remitos",
      detalle: err.message,
    });
  }
};

// GET /remitos/distinct
exports.getDistinctValues = async (req, res) => {
  try {
    await poolConnect;
    const pool = await getPool();

    const column = safeText(req.query.column);
    const search = safeText(req.query.search);
    const filters = parseFilters(req.query.filters);

    const columnSql = REMITOS_FILTER_COLUMNS[column];

    if (!columnSql) {
      return res.status(400).json({
        error: "Columna inválida para filtro",
      });
    }

    const request = pool.request();
    request.timeout = 120000;

    const filtersWithoutCurrent = { ...filters };
    delete filtersWithoutCurrent[column];

    const whereParts = [];

    const whereOther = buildRemitosWhere(filtersWithoutCurrent, request);
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
        FROM dbo.remitos r WITH (NOLOCK)
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
      }))
    );
  } catch (err) {
    console.error("remitos.getDistinctValues:", err);

    return res.status(500).json({
      error: "Error al obtener valores del filtro",
      detalle: err.message,
    });
  }
};

// GET /remitos/:id
exports.getById = async (req, res) => {
  try {
    const nro = clean(req.params.id);
    if (!nro) return res.status(400).json({ error: "ID inválido" });

    await poolConnect;
    const pool = await getPool();

    const cab = await pool.request().input("n", sql.VarChar(50), nro).query(`
      SELECT
        numero_remito AS id,
        numero_transaccion,
        numero_remito,
        deposito_nombre AS deposito,
        deposito_id,
        tipo,
        usuario,
        observacion,
        estado,
        fecha,
        nro_entrega,
        pedido,
        proveedor
      FROM dbo.remitos WITH (NOLOCK)
      WHERE numero_remito = @n
    `);

    if (!cab.recordset.length) {
      return res.status(404).json({ error: "Remito no encontrado" });
    }

    const det = await pool.request().input("n", sql.VarChar(50), nro).query(`
      SELECT
        d.cod_articulo,
        d.descripcion,
        d.cantidad,
        d.id_ubicacion,
        u.nombre AS ubicacion_nombre
      FROM dbo.remitos_detalles d WITH (NOLOCK)
      LEFT JOIN dbo.ubicaciones u WITH (NOLOCK)
        ON u.id_ubicacion = d.id_ubicacion
      WHERE d.remito_id = @n
      ORDER BY d.cod_articulo
    `);

    return res.json({
      cabecera: cab.recordset[0],
      detalle: det.recordset || [],
    });
  } catch (err) {
    console.error("remitos.getById:", err);
    return res.status(500).json({
      error: "Error al obtener detalle",
      detalle: err.message,
    });
  }
};

exports.getArticuloByCodigo = async (req, res) => {
  try {
    const q = up(req.query?.codigo);

    if (!q) {
      return res.status(400).json({ error: "Debe indicar ?codigo=" });
    }

    await poolConnect;
    const pool = await getPool();

    const r = await pool
      .request()
      .input("q", sql.VarChar(80), q).query(`
        SELECT TOP 1
          id_articulo,
          UPPER(LTRIM(RTRIM(codigo))) AS codigo,
          descripcion
        FROM dbo.articulos WITH (NOLOCK)
        WHERE UPPER(LTRIM(RTRIM(codigo))) = @q
        ORDER BY id_articulo DESC
      `);

    if (!r.recordset.length) {
      return res.status(404).json({
        error: "Artículo no encontrado",
        detalle: q,
      });
    }

    return res.json(r.recordset[0]);
  } catch (err) {
    console.error("remitos.getArticuloByCodigo:", err);
    return res.status(500).json({
      error: "Error al buscar artículo",
      detalle: err.message,
    });
  }
};

// POST /remitos
exports.create = async (req, res) => {
  try {
    await poolConnect;
    const pool = await getPool();

    const result = await crearRemitoCore(pool, {
      ...req.body,
      tipo: "ENTRADA",
      deposito_nombre: DEPOSITO_FIJO,
      items: req.body?.items || [],
    });

    return res.status(result.status).json(result.payload);
  } catch (err) {
    console.error("remitos.create:", err);
    return res.status(500).json({
      error: "Error al crear remito",
      detalle: err.message,
    });
  }
};

// POST /remitos/importar-planilla
exports.importarPlanilla = async (req, res) => {
  try {
    await poolConnect;
    const pool = await getPool();

    const rows = normalizeImportRows(req.body?.rows);

    if (!rows.length) {
      return res.status(400).json({
        error: "La planilla no tiene filas para importar.",
      });
    }

    const errores = [];

    for (const r of rows) {
      if (!r.nro_remito) errores.push(`Fila ${r.fila_excel}: falta N° Remito.`);
      if (!r.cod_articulo) errores.push(`Fila ${r.fila_excel}: falta Artículo.`);
      if (!Number.isFinite(r.cantidad) || r.cantidad <= 0) {
        errores.push(`Fila ${r.fila_excel}: cantidad inválida.`);
      }
      if (!r.proveedor) errores.push(`Fila ${r.fila_excel}: falta Proveedor.`);
    }

    const remitos = Array.from(new Set(rows.map((r) => r.nro_remito).filter(Boolean)));
    const proveedores = Array.from(new Set(rows.map((r) => up(r.proveedor)).filter(Boolean)));
    const pedidos = Array.from(new Set(rows.map((r) => clean(r.pedido)).filter(Boolean)));
    const entregas = Array.from(new Set(rows.map((r) => clean(r.nro_entrega)).filter(Boolean)));

    if (remitos.length > 1) {
      errores.push(`La planilla tiene más de un N° Remito: ${remitos.join(", ")}.`);
    }

    if (proveedores.length > 1) {
      errores.push(`La planilla tiene más de un proveedor: ${proveedores.join(", ")}.`);
    }

    if (pedidos.length > 1) {
      errores.push(`La planilla tiene más de un pedido: ${pedidos.join(", ")}.`);
    }

    if (entregas.length > 1) {
      errores.push(`La planilla tiene más de un N° Entrega: ${entregas.join(", ")}.`);
    }

    if (errores.length) {
      return res.status(400).json({
        error: "No se importó nada. Hay errores en la planilla.",
        detalle: errores,
      });
    }

    const proveedor = rows[0].proveedor;
    const proveedorValidado = await resolveProveedor(pool, proveedor);

    if (!proveedorValidado) {
      return res.status(400).json({
        error: "No se importó nada. Proveedor inexistente.",
        detalle: proveedor,
      });
    }

    const codigos = rows.map((r) => r.cod_articulo);
    const arts = await getArticulosByCodigos(pool, codigos);

    const faltan = Array.from(new Set(codigos.filter((c) => !arts.has(c))));

    if (faltan.length) {
      return res.status(400).json({
        error: "No se importó nada. Hay artículos inexistentes.",
        detalle: faltan,
      });
    }

    const itemMap = new Map();

    for (const r of rows) {
      const key = r.cod_articulo;

      if (!itemMap.has(key)) {
        itemMap.set(key, {
          cod_articulo: key,
          cantidad: 0,
        });
      }

      itemMap.get(key).cantidad += Number(r.cantidad);
    }

    const result = await crearRemitoCore(pool, {
      nro_remito: rows[0].nro_remito,
      nro_entrega: rows[0].nro_entrega || null,
      pedido: rows[0].pedido || null,
      proveedor: proveedorValidado,
      tipo: "ENTRADA",
      deposito_nombre: DEPOSITO_FIJO,
      usuario: clean(req.body?.usuario) || null,
      observacion: clean(req.body?.observacion) || "Importado desde planilla",
      items: Array.from(itemMap.values()),
    });

    return res.status(result.status).json(result.payload);
  } catch (err) {
    console.error("remitos.importarPlanilla:", err);
    return res.status(500).json({
      error: "Error al importar planilla",
      detalle: err.message,
    });
  }
};

// PUT /remitos/:id
exports.update = async (req, res) => {
  try {
    const numero_remito = clean(req.params.id);

    if (!numero_remito) {
      return res.status(400).json({ error: "Número de remito inválido" });
    }

    const nro_entrega =
      req.body?.nro_entrega == null || String(req.body.nro_entrega).trim() === ""
        ? null
        : clean(req.body.nro_entrega);

    const pedido =
      req.body?.pedido == null || String(req.body.pedido).trim() === ""
        ? null
        : clean(req.body.pedido);

    const proveedor =
      req.body?.proveedor == null || String(req.body.proveedor).trim() === ""
        ? null
        : clean(req.body.proveedor);

    const observacion =
      req.body?.observacion == null || String(req.body.observacion).trim() === ""
        ? null
        : clean(req.body.observacion);

    if (!proveedor) {
      return res.status(400).json({
        error: "Debe seleccionar proveedor",
      });
    }

    await poolConnect;
    const pool = await getPool();

    const existe = await pool
      .request()
      .input("n", sql.VarChar(50), numero_remito).query(`
        SELECT TOP 1 numero_remito
        FROM dbo.remitos WITH (NOLOCK)
        WHERE numero_remito = @n
      `);

    if (!existe.recordset.length) {
      return res.status(404).json({
        error: "Remito no encontrado",
      });
    }

    const proveedorValidado = await resolveProveedor(pool, proveedor);

    if (!proveedorValidado) {
      return res.status(400).json({
        error: "Proveedor inexistente",
        detalle: proveedor,
      });
    }

    const r = await pool
      .request()
      .input("n", sql.VarChar(50), numero_remito)
      .input("nroEntrega", sql.VarChar(80), nro_entrega)
      .input("pedido", sql.VarChar(80), pedido)
      .input("proveedor", sql.VarChar(200), proveedorValidado)
      .input("observacion", sql.VarChar(400), observacion).query(`
        UPDATE dbo.remitos
        SET
          nro_entrega = @nroEntrega,
          pedido = @pedido,
          proveedor = @proveedor,
          observacion = @observacion
        WHERE numero_remito = @n;

        SELECT @@ROWCOUNT AS affected;
      `);

    if (Number(r.recordset[0].affected) !== 1) {
      return res.status(404).json({
        error: "Remito no encontrado",
      });
    }

    return res.json({
      ok: true,
      message: "Remito actualizado correctamente",
    });
  } catch (err) {
    console.error("remitos.update:", err);

    return res.status(500).json({
      error: "Error al actualizar remito",
      detalle: err.message,
    });
  }
};