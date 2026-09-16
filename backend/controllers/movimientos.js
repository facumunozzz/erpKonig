// backend/controllers/movimientos.js
const { sql, poolConnect, getPool } = require("../db");

function toInt(v, def) {
  const n = Number(v);

  return Number.isFinite(n) && n > 0 ? Math.trunc(n) : def;
}

function safeText(v) {
  return String(v ?? "").trim();
}

function parseFilters(raw) {
  if (!raw) {
    return {};
  }

  if (typeof raw === "object") {
    return raw;
  }

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
  ubicacion_origen: "movimientos.ubicacion_origen",
  deposito_destino: "movimientos.deposito_destino",
  ubicacion_destino: "movimientos.ubicacion_destino",
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

  if (raw === undefined || raw === null || raw === "") {
    return;
  }

  /*
   * Compatibilidad con filtros antiguos enviados
   * directamente como texto.
   */
  if (typeof raw === "string") {
    const value = safeText(raw);

    if (!value) {
      return;
    }

    const paramName = `f_${key}`;

    request.input(paramName, sql.NVarChar, `%${value}%`);

    /*
     * Los filtros de texto libre siguen siendo
     * búsquedas parciales.
     */
    where.push(`CAST(${columnSql} AS NVARCHAR(MAX)) LIKE @${paramName}`);

    return;
  }

  /*
   * Selección exacta de uno o varios valores.
   *
   * Ejemplo:
   *
   * {
   *   mode: "in",
   *   values: ["AJUSTE", "TRANSFERENCIA"]
   * }
   */
  if (typeof raw === "object" && raw.mode === "in") {
    const values = Array.isArray(raw.values)
      ? raw.values.map((x) => String(x ?? "").trim())
      : [];

    if (!values.length) {
      return;
    }

    const orParts = [];

    values.forEach((value, index) => {
      const paramName = `f_${key}_${index}`;

      if (value === "__EMPTY__" || value === "") {
        orParts.push(`(${columnSql} IS NULL OR ${columnSql} = '')`);
      } else {
        request.input(paramName, sql.NVarChar, value);

        orParts.push(`${columnSql} = @${paramName}`);
      }
    });

    where.push(`(${orParts.join(" OR ")})`);

    return;
  }

  /*
   * Exclusión exacta de uno o varios valores.
   *
   * Ejemplo:
   *
   * {
   *   mode: "notIn",
   *   values: ["CONSUMO PRODUCCIÓN (DROPBOX)"]
   * }
   */
  if (typeof raw === "object" && raw.mode === "notIn") {
    const values = Array.isArray(raw.values)
      ? raw.values.map((x) => String(x ?? "").trim()).filter(Boolean)
      : [];

    if (!values.length) {
      return;
    }

    const andParts = [];

    values.forEach((value, index) => {
      const paramName = `f_${key}_not_${index}`;

      if (value === "__EMPTY__" || value === "") {
        andParts.push(`(${columnSql} IS NOT NULL AND ${columnSql} <> '')`);
      } else {
        request.input(paramName, sql.NVarChar, value);

        andParts.push(
          `(${columnSql} IS NULL OR ${columnSql} <> @${paramName})`,
        );
      }
    });

    where.push(`(${andParts.join(" AND ")})`);

    return;
  }

  /*
   * Filtro por rango de fechas.
   *
   * La fecha final se trata como límite exclusivo
   * del día siguiente.
   *
   * Esto permite evitar CONVERT sobre la columna.
   */
  if (typeof raw === "object" && raw.mode === "dateRange") {
    const from = safeText(raw.from);
    const to = safeText(raw.to);

    if (!from && !to) {
      return;
    }

    if (from) {
      const paramNameFrom = `f_${key}_from`;

      request.input(paramNameFrom, sql.Date, from);

      where.push(`${columnSql} >= @${paramNameFrom}`);
    }

    if (to) {
      const paramNameTo = `f_${key}_to`;

      request.input(paramNameTo, sql.Date, to);

      where.push(`${columnSql} < DATEADD(DAY, 1, @${paramNameTo})`);
    }

    return;
  }

  /*
   * Búsqueda parcial.
   *
   * Se mantiene para descripción, códigos y campos
   * donde el usuario puede buscar parte del contenido.
   */
  if (typeof raw === "object" && raw.mode === "contains") {
    const value = safeText(raw.value);

    if (!value) {
      return;
    }

    const paramName = `f_${key}`;

    request.input(paramName, sql.NVarChar, `%${value}%`);

    where.push(`CAST(${columnSql} AS NVARCHAR(MAX)) LIKE @${paramName}`);
  }
}

function buildWhere(filters, request, exceptKey = null) {
  const where = [];

  Object.entries(FILTER_COLUMNS).forEach(([key, columnSql]) => {
    if (key === exceptKey) {
      return;
    }

    addFilter(request, where, filters, key, columnSql);
  });

  return where.length ? `WHERE ${where.join(" AND ")}` : "";
}

/*
 * Los nombres reales de las tablas ya fueron
 * verificados en SQL Server.
 *
 * No se consulta sys.objects en cada solicitud.
 */
function buildMovimientosBase() {
  const transfDetalleTable = "transferencias_detalle";

  const ajusteDetalleTable = "ajustes_detalles";

  const ajustesTable = "ajustes";

  const remitosTable = "remitos";

  const remitosDetTable = "remitos_detalles";

  const selects = [];

  // =====================================================
  // TRANSFERENCIAS
  // =====================================================

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
        )
        AS VARCHAR(300)
      )
        AS id_movimiento,

      TRY_CONVERT(
        BIGINT,
        t.numero_transferencia
      )
        AS orden_movimiento,

      CAST(
        t.numero_transferencia
        AS VARCHAR(50)
      )
        AS numero_transaccion,

      CONVERT(
        date,
        t.fecha
      )
        AS fecha,

      CONVERT(
        date,
        ISNULL(
          t.fecha_real,
          t.fecha
        )
      )
        AS fecha_real,

      CAST(
        a.codigo
        AS VARCHAR(100)
      )
        AS codigo,

      CAST(
        a.descripcion
        AS VARCHAR(500)
      )
        AS descripcion,

      CAST(
        td.cantidad
        AS INT
      )
        AS cantidad,

      CAST(
        t.origen
        AS VARCHAR(255)
      )
        AS deposito_origen,

      CAST(
        uo.nombre
        AS VARCHAR(255)
      )
        AS ubicacion_origen,

      CAST(
        t.destino
        AS VARCHAR(255)
      )
        AS deposito_destino,

      CAST(
        ud.nombre
        AS VARCHAR(255)
      )
  AS ubicacion_destino,
      CAST(
        'TRANSFERENCIA'
        AS VARCHAR(50)
      )
        AS tipo_transaccion,

      CAST(
        NULL
        AS VARCHAR(255)
      )
        AS motivo,

      CAST(
        t.remito_referencia
        AS VARCHAR(255)
      )
        AS remito_referencia,

      CAST(
        NULL
        AS VARCHAR(255)
      )
        AS obra,

      CAST(
        NULL
        AS VARCHAR(255)
      )
        AS version,

      CAST(
        ref.nombre
        AS VARCHAR(255)
      )
        AS referente,

      t.id_referente
        AS id_referente,

      CAST(
        a.proveedor
        AS VARCHAR(255)
      )
        AS proveedor,

      CAST(
        NULL
        AS VARCHAR(10)
      )
        AS ingreso_egreso,

      CAST(
        t.usuario
        AS VARCHAR(255)
      )
        AS usuario

    FROM dbo.transferencias t

    JOIN dbo.${transfDetalleTable} td
      ON td.transferencia_id = t.id

    JOIN dbo.articulos a
      ON a.id_articulo = td.articulo_id

    LEFT JOIN dbo.referentes ref
      ON ref.id_referente =
         t.id_referente

    LEFT JOIN dbo.ubicaciones uo
      ON uo.id_ubicacion =
        t.id_ubicacion_origen

    LEFT JOIN dbo.ubicaciones ud
      ON ud.id_ubicacion =
        t.id_ubicacion_destino
  `);

  // =====================================================
  // AJUSTES
  // =====================================================

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
        )
        AS VARCHAR(300)
      )
        AS id_movimiento,

      TRY_CONVERT(
        BIGINT,
        a.numero_ajuste
      )
        AS orden_movimiento,

      CAST(
        a.numero_ajuste
        AS VARCHAR(50)
      )
        AS numero_transaccion,

      CONVERT(
        date,
        a.fecha
      )
        AS fecha,

      CONVERT(
        date,
        ISNULL(
          a.fecha_real,
          a.fecha
        )
      )
        AS fecha_real,

      CAST(
        ad.cod_articulo
        AS VARCHAR(100)
      )
        AS codigo,

      CAST(
        ad.descripcion
        AS VARCHAR(500)
      )
        AS descripcion,

      ABS(
        CAST(
          ad.cantidad
          AS INT
        )
      )
        AS cantidad,

      CAST(
        CASE
          WHEN
            CAST(
              ad.cantidad
              AS INT
            ) < 0
          THEN a.deposito
          ELSE NULL
        END
        AS VARCHAR(255)
      )
        AS deposito_origen,

      CAST(
        NULL
        AS VARCHAR(255)
      )
        AS ubicacion_origen,

      CAST(
        CASE
          WHEN
            CAST(
              ad.cantidad
              AS INT
            ) > 0
          THEN a.deposito
          ELSE NULL
        END
        AS VARCHAR(255)
      )
        AS deposito_destino,

      CAST(
        NULL
        AS VARCHAR(255)
      )
        AS ubicacion_destino,

      CAST(
        'AJUSTE'
        AS VARCHAR(50)
      )
        AS tipo_transaccion,

      CAST(
        COALESCE(
          am.nombre,
          a.motivo
        )
        AS VARCHAR(255)
      )
        AS motivo,

      CAST(
        a.remito_referencia
        AS VARCHAR(255)
      )
        AS remito_referencia,

      CAST(
        a.obra
        AS VARCHAR(255)
      )
        AS obra,

      CAST(
        a.version
        AS VARCHAR(255)
      )
        AS version,

      CAST(
        ref.nombre
        AS VARCHAR(255)
      )
        AS referente,

      a.id_referente
        AS id_referente,

      CAST(
        art.proveedor
        AS VARCHAR(255)
      )
        AS proveedor,

      CAST(
        CASE
          WHEN
            CAST(
              ad.cantidad
              AS INT
            ) < 0
          THEN 'E'

          WHEN
            CAST(
              ad.cantidad
              AS INT
            ) > 0
          THEN 'I'

          ELSE ''
        END
        AS VARCHAR(10)
      )
        AS ingreso_egreso,

      CAST(
        a.usuario
        AS VARCHAR(255)
      )
        AS usuario

    FROM dbo.${ajustesTable} a

    JOIN dbo.${ajusteDetalleTable} ad
      ON ad.ajuste_id =
         a.numero_ajuste

    LEFT JOIN dbo.ajustes_motivos am
      ON am.id_motivo =
         a.motivo_id

    LEFT JOIN dbo.articulos art
      ON art.codigo =
         ad.cod_articulo

    LEFT JOIN dbo.referentes ref
      ON ref.id_referente =
         a.id_referente
  `);

  // =====================================================
  // REMITOS
  // =====================================================

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
        )
        AS VARCHAR(300)
      )
        AS id_movimiento,

      TRY_CONVERT(
        BIGINT,
        r.numero_transaccion
      )
        AS orden_movimiento,

      CAST(
        r.numero_transaccion
        AS VARCHAR(50)
      )
        AS numero_transaccion,

      CONVERT(
        date,
        r.fecha
      )
        AS fecha,

      CONVERT(
        date,
        r.fecha
      )
        AS fecha_real,

      CAST(
        rd.cod_articulo
        AS VARCHAR(100)
      )
        AS codigo,

      CAST(
        rd.descripcion
        AS VARCHAR(500)
      )
        AS descripcion,

      ABS(
        CAST(
          rd.cantidad
          AS INT
        )
      )
        AS cantidad,

        CAST(
          CASE
            WHEN r.tipo = 'SALIDA'
            THEN r.deposito_nombre
            ELSE NULL
          END
          AS VARCHAR(255)
        )
          AS deposito_origen,

        CAST(
          NULL
          AS VARCHAR(255)
        )
          AS ubicacion_origen,

        CAST(
          CASE
            WHEN r.tipo <> 'SALIDA'
            THEN r.deposito_nombre
            ELSE NULL
          END
          AS VARCHAR(255)
        )
          AS deposito_destino,

        CAST(
          NULL
          AS VARCHAR(255)
        )
  AS ubicacion_destino,
      CAST(
        'REMITO'
        AS VARCHAR(50)
      )
        AS tipo_transaccion,

      CAST(
        NULL
        AS VARCHAR(255)
      )
        AS motivo,

      CAST(
        r.numero_remito
        AS VARCHAR(255)
      )
        AS remito_referencia,

      CAST(
        NULL
        AS VARCHAR(255)
      )
        AS obra,

      CAST(
        NULL
        AS VARCHAR(255)
      )
        AS version,

      CAST(
        NULL
        AS VARCHAR(255)
      )
        AS referente,

      CAST(
        NULL
        AS INT
      )
        AS id_referente,

      CAST(
        r.proveedor
        AS VARCHAR(255)
      )
        AS proveedor,

      CAST(
        CASE
          WHEN r.tipo = 'SALIDA'
          THEN 'E'
          ELSE 'I'
        END
        AS VARCHAR(10)
      )
        AS ingreso_egreso,

      CAST(
        r.usuario
        AS VARCHAR(255)
      )
        AS usuario

    FROM dbo.${remitosTable} r

    JOIN dbo.${remitosDetTable} rd
      ON rd.remito_id =
         r.numero_remito

    LEFT JOIN dbo.articulos art
      ON art.codigo =
         CONVERT(
           NVARCHAR(200),
           rd.cod_articulo
         )
  `);

  // =====================================================
  // PRODUCCIÓN - EGRESO DE MATERIALES
  // =====================================================

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
        )
        AS VARCHAR(300)
      )
        AS id_movimiento,

      TRY_CONVERT(
        BIGINT,
        o.numero_orden
      )
        AS orden_movimiento,

      CAST(
        o.numero_orden
        AS VARCHAR(50)
      )
        AS numero_transaccion,

      CONVERT(
        date,
        o.fecha
      )
        AS fecha,

      CONVERT(
        date,
        o.fecha
      )
        AS fecha_real,

      CAST(
        a.codigo
        AS VARCHAR(100)
      )
        AS codigo,

      CAST(
        a.descripcion
        AS VARCHAR(500)
      )
        AS descripcion,

      CAST(
        od.cantidad
        AS INT
      )
        AS cantidad,

      CAST(
        d.nombre
        AS VARCHAR(255)
      )
        AS deposito_origen,
      
      CAST(
        NULL
        AS VARCHAR(255)
      )
        AS ubicacion_origen,

      CAST(
        NULL
        AS VARCHAR(255)
      )
        AS deposito_destino,

      CAST(
        NULL
        AS VARCHAR(255)
      )
        AS ubicacion_destino,

      CAST(
        'PRODUCCION'
        AS VARCHAR(50)
      )
        AS tipo_transaccion,

      CAST(
        NULL
        AS VARCHAR(255)
      )
        AS motivo,

      CAST(
        NULL
        AS VARCHAR(255)
      )
        AS remito_referencia,

      CAST(
        NULL
        AS VARCHAR(255)
      )
        AS obra,

      CAST(
        NULL
        AS VARCHAR(255)
      )
        AS version,

      CAST(
        NULL
        AS VARCHAR(255)
      )
        AS referente,

      CAST(
        NULL
        AS INT
      )
        AS id_referente,

      CAST(
        a.proveedor
        AS VARCHAR(255)
      )
        AS proveedor,

      CAST(
        'E'
        AS VARCHAR(10)
      )
        AS ingreso_egreso,

      CAST(
        NULL
        AS VARCHAR(255)
      )
        AS usuario

    FROM dbo.produccion_orden_detalles od

    JOIN dbo.produccion_ordenes o
      ON o.id = od.orden_id

    JOIN dbo.articulos a
      ON a.id_articulo =
         od.material_id

    JOIN dbo.depositos d
      ON d.id_deposito =
         o.deposito_origen_id
  `);

  // =====================================================
  // PRODUCCIÓN - INGRESO DE PRODUCTO TERMINADO
  // =====================================================

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
        )
        AS VARCHAR(300)
      )
        AS id_movimiento,

      TRY_CONVERT(
        BIGINT,
        o.numero_orden
      )
        AS orden_movimiento,

      CAST(
        o.numero_orden
        AS VARCHAR(50)
      )
        AS numero_transaccion,

      CONVERT(
        date,
        o.fecha
      )
        AS fecha,

      CONVERT(
        date,
        o.fecha
      )
        AS fecha_real,

      CAST(
        a.codigo
        AS VARCHAR(100)
      )
        AS codigo,

      CAST(
        a.descripcion
        AS VARCHAR(500)
      )
        AS descripcion,

      CAST(
        o.cantidad
        AS INT
      )
        AS cantidad,

      CAST(
        NULL
        AS VARCHAR(255)
      )
        AS deposito_origen,
      
      CAST(
        NULL
        AS VARCHAR(255)
      )
        AS ubicacion_origen,

      CAST(
        d.nombre
        AS VARCHAR(255)
      )
        AS deposito_destino,
      
      CAST(
        NULL
        AS VARCHAR(255)
      )
        AS ubicacion_destino,

      CAST(
        'PRODUCCION'
        AS VARCHAR(50)
      )
        AS tipo_transaccion,

      CAST(
        NULL
        AS VARCHAR(255)
      )
        AS motivo,

      CAST(
        NULL
        AS VARCHAR(255)
      )
        AS remito_referencia,

      CAST(
        NULL
        AS VARCHAR(255)
      )
        AS obra,

      CAST(
        NULL
        AS VARCHAR(255)
      )
        AS version,

      CAST(
        NULL
        AS VARCHAR(255)
      )
        AS referente,

      CAST(
        NULL
        AS INT
      )
        AS id_referente,

      CAST(
        a.proveedor
        AS VARCHAR(255)
      )
        AS proveedor,

      CAST(
        'I'
        AS VARCHAR(10)
      )
        AS ingreso_egreso,

      CAST(
        NULL
        AS VARCHAR(255)
      )
        AS usuario

    FROM dbo.produccion_ordenes o

    JOIN dbo.articulos a
      ON a.id_articulo =
         o.producto_id

    JOIN dbo.depositos d
      ON d.id_deposito =
         o.deposito_destino_id
  `);

  // =====================================================
  // STOCK RECORTES - CONSUMOS DESDE ORDENES DE TRABAJO
  // =====================================================

  selects.push(`
    SELECT
      CAST(
        CONCAT(
          'STOCK-RECORTE-',
          cr.id_consumo_recorte
        )
        AS VARCHAR(300)
      )
        AS id_movimiento,

      CAST(
        cr.id_consumo_recorte
        AS BIGINT
      )
        AS orden_movimiento,

      CAST(
        ot.otid
        AS VARCHAR(50)
      )
        AS numero_transaccion,

      CONVERT(
        date,
        cr.fecha
      )
        AS fecha,

      CONVERT(
        date,
        cr.fecha
      )
        AS fecha_real,

      CAST(
        r.codigo
        AS VARCHAR(100)
      )
        AS codigo,

      CAST(
        r.descripcion
        AS VARCHAR(500)
      )
        AS descripcion,

      CAST(
        cr.cantidad
        AS DECIMAL(18, 3)
      )
        AS cantidad,

      CAST(
        'STOCK RECORTES'
        AS VARCHAR(255)
      )
        AS deposito_origen,

      CAST(
        COALESCE(
          ru.nombre,
          'SIN UBICACION'
        )
        AS VARCHAR(255)
      )
        AS ubicacion_origen,

      CAST(
        NULL
        AS VARCHAR(255)
      )
        AS deposito_destino,

      CAST(
        NULL
        AS VARCHAR(255)
      )
        AS ubicacion_destino,

      CAST(
        'STOCK RECORTE'
        AS VARCHAR(50)
      )
        AS tipo_transaccion,

      CAST(
        CONCAT(
          'CONSUMO OT - ',
          COALESCE(ot.operacion, 'CORTE PERFIL')
        )
        AS VARCHAR(255)
      )
        AS motivo,

      CAST(
        NULL
        AS VARCHAR(255)
      )
        AS remito_referencia,

      CAST(
        CASE
          WHEN CHARINDEX('.', COALESCE(ot.obra_version, '')) > 0
          THEN LEFT(
            ot.obra_version,
            CHARINDEX('.', ot.obra_version) - 1
          )
          ELSE ot.obra_version
        END
        AS VARCHAR(255)
      )
        AS obra,

      CAST(
        CASE
          WHEN CHARINDEX('.', COALESCE(ot.obra_version, '')) > 0
          THEN SUBSTRING(
            ot.obra_version,
            CHARINDEX('.', ot.obra_version) + 1,
            255
          )
          ELSE NULL
        END
        AS VARCHAR(255)
      )
        AS version,

      CAST(
        NULL
        AS VARCHAR(255)
      )
        AS referente,

      CAST(
        NULL
        AS INT
      )
        AS id_referente,

      CAST(
        art.proveedor
        AS VARCHAR(255)
      )
        AS proveedor,

      CAST(
        'E'
        AS VARCHAR(10)
      )
        AS ingreso_egreso,

      CAST(
        cr.usuario
        AS VARCHAR(255)
      )
        AS usuario

    FROM dbo.ordenes_trabajo_consumos_recortes cr

    INNER JOIN dbo.ordenes_trabajo ot
      ON ot.id_ot = cr.id_ot

    INNER JOIN dbo.ordenes_trabajo_materiales mat
      ON mat.id_ot_material = cr.id_ot_material

    INNER JOIN dbo.recortes r
      ON r.id_recorte = cr.id_recorte

    LEFT JOIN dbo.recortes_ubicaciones ru
      ON ru.id_ubicacion_recorte =
         cr.id_ubicacion_recorte

    OUTER APPLY
    (
      SELECT TOP 1
        a.proveedor
      FROM dbo.articulos a
      WHERE UPPER(LTRIM(RTRIM(a.codigo))) =
            UPPER(LTRIM(RTRIM(mat.codigo)))
      ORDER BY a.id_articulo
    ) art
  `);

  return `
    FROM (
      ${selects.join("\nUNION ALL\n")}
    ) movimientos
  `;
}

/*
 * Base materializada para lecturas rápidas.
 *
 * buildMovimientosBase() se conserva intacta como definición/fuente histórica
 * del modelo actual. Las pantallas y filtros leen desde movimientos_historial.
 */
function buildMovimientosHistorialBase() {
  return `
    FROM
    (
      SELECT
        mh.id_movimiento,
        mh.orden_movimiento,
        mh.numero_transaccion,
        mh.fecha,
        mh.fecha_real,
        mh.codigo,
        mh.descripcion,
        mh.cantidad,
        mh.deposito_origen,
        mh.ubicacion_origen,
        mh.deposito_destino,
        mh.ubicacion_destino,
        mh.tipo_transaccion,
        mh.motivo,
        mh.remito_referencia,
        mh.obra,
        mh.version,
        mh.referente,
        mh.id_referente,
        mh.proveedor,
        mh.ingreso_egreso,
        mh.usuario
      FROM dbo.movimientos_historial mh
      WHERE mh.eliminado = 0
    ) movimientos
  `;
}

function rowVersionToHex(value) {
  if (!value) return "0000000000000000";

  if (Buffer.isBuffer(value)) {
    return value.toString("hex").toUpperCase().padStart(16, "0");
  }

  if (value instanceof Uint8Array) {
    return Buffer.from(value).toString("hex").toUpperCase().padStart(16, "0");
  }

  const text = String(value).replace(/^0x/i, "").trim();

  return text.toUpperCase().padStart(16, "0");
}

function parseRowVersion(value) {
  const text = String(value || "")
    .replace(/^0x/i, "")
    .trim();

  if (!/^[0-9a-fA-F]{1,16}$/.test(text)) {
    return Buffer.alloc(8, 0);
  }

  return Buffer.from(text.padStart(16, "0"), "hex");
}

function mapHistorialRow(row) {
  if (!row) return row;

  const { sync_version, ...rest } = row;

  return {
    ...rest,
    sync_version: rowVersionToHex(sync_version),
  };
}

// ========================================================
// GET /movimientos
// ========================================================

exports.getAll = async (req, res) => {
  const inicio = Date.now();

  try {
    await poolConnect;

    const pool = await getPool();

    const page = Math.max(toInt(req.query.page, 1), 1);

    const pageSizeRaw = Math.max(toInt(req.query.pageSize, 50), 1);

    const pageSize = Math.min(pageSizeRaw, 100);

    const offset = (page - 1) * pageSize;

    const filters = parseFilters(req.query.filters);

    const sortKey = safeText(req.query.sortKey);

    const sortDir = safeText(req.query.sortDir);

    const request = pool.request();

    request.timeout = 120000;

    request.input("offset", sql.Int, offset);

    request.input("pageSize", sql.Int, pageSize);

    const sqlBase = buildMovimientosHistorialBase();

    const where = buildWhere(filters, request);

    const orderBy = getOrderBy(sortKey, sortDir);

    const sqlFinal = `
      SELECT
        COUNT(*) OVER()
          AS total_registros,

        movimientos.*

      ${sqlBase}

      ${where}

      ${orderBy}

      OFFSET @offset ROWS

      FETCH NEXT @pageSize
      ROWS ONLY;
    `;

    const result = await request.query(sqlFinal);

    const registros = result.recordset || [];

    const total = Number(registros[0]?.total_registros || 0);

    const data = registros.map(({ total_registros, ...fila }) => fila);

    const tiempo = Date.now() - inicio;

    console.log(
      `Movimientos: ${data.length} filas, total ${total}, tiempo ${tiempo} ms`,
    );

    return res.json({
      data,

      total,

      page,

      pageSize,

      totalPages: Math.ceil(total / pageSize) || 1,

      tiempo_ms: tiempo,
    });
  } catch (err) {
    console.error("movimientos.getAll:", err);

    return res.status(500).json({
      error: "Error al obtener movimientos",

      detalle: err.message,
    });
  }
};

// ========================================================
// GET /movimientos/bootstrap
//
// Primera carga para la SQLite local.
// Entrega primero los movimientos más recientes y permite
// continuar hacia atrás mediante beforeId.
// ========================================================

exports.bootstrapHistorial = async (req, res) => {
  try {
    await poolConnect;

    const pool = await getPool();

    const limit = Math.min(Math.max(toInt(req.query.limit, 2500), 100), 5000);

    const beforeIdRaw = Number(req.query.beforeId);

    const beforeId =
      Number.isFinite(beforeIdRaw) && beforeIdRaw > 0
        ? Math.trunc(beforeIdRaw)
        : null;

    const includeMeta = String(req.query.includeMeta || "0") === "1";

    const request = pool.request();

    request.timeout = 120000;

    request.input("limit", sql.Int, limit);
    request.input("beforeId", sql.BigInt, beforeId);

    const result = await request.query(`
      SELECT TOP (@limit)
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
        eliminado,
        sync_version

      FROM dbo.movimientos_historial

      WHERE eliminado = 0
        AND
        (
          @beforeId IS NULL
          OR historial_id < @beforeId
        )

      ORDER BY historial_id DESC;
    `);

    const rows = (result.recordset || []).map(mapHistorialRow);

    let watermark = null;
    let total = null;

    if (includeMeta) {
      const meta = await pool.request().query(`
        SELECT
          COUNT_BIG(*) AS total,
          (
            SELECT TOP 1 sync_version
            FROM dbo.movimientos_historial
            ORDER BY sync_version DESC
          ) AS watermark
        FROM dbo.movimientos_historial
        WHERE eliminado = 0;
      `);

      total = Number(meta.recordset?.[0]?.total || 0);
      watermark = rowVersionToHex(meta.recordset?.[0]?.watermark);
    }

    const nextBeforeId =
      rows.length > 0 ? Number(rows[rows.length - 1].historial_id) : null;

    return res.json({
      data: rows,
      nextBeforeId,
      hasMore: rows.length === limit,
      watermark,
      total,
    });
  } catch (err) {
    console.error("movimientos.bootstrapHistorial:", err);

    return res.status(500).json({
      error: "Error al preparar historial de movimientos",
      detalle: err.message,
    });
  }
};

// ========================================================
// GET /movimientos/sync
//
// Sincronización incremental por SQL Server ROWVERSION.
// También envía tombstones (eliminado=1), para que SQLite
// quite movimientos que hayan dejado de existir.
// ========================================================

exports.syncHistorial = async (req, res) => {
  try {
    await poolConnect;

    const pool = await getPool();

    const limit = Math.min(Math.max(toInt(req.query.limit, 2500), 100), 5000);

    const since = parseRowVersion(req.query.since);

    const request = pool.request();

    request.timeout = 120000;

    request.input("limit", sql.Int, limit);
    request.input("since", sql.VarBinary(8), since);

    const result = await request.query(`
      SELECT TOP (@limit)
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
        eliminado,
        sync_version

      FROM dbo.movimientos_historial

      WHERE sync_version > @since

      ORDER BY sync_version ASC;
    `);

    const rows = (result.recordset || []).map(mapHistorialRow);

    const nextVersion =
      rows.length > 0
        ? rows[rows.length - 1].sync_version
        : rowVersionToHex(since);

    return res.json({
      data: rows,
      nextVersion,
      hasMore: rows.length === limit,
    });
  } catch (err) {
    console.error("movimientos.syncHistorial:", err);

    return res.status(500).json({
      error: "Error al sincronizar historial de movimientos",
      detalle: err.message,
    });
  }
};

// ========================================================
// GET /movimientos/historial-status
// ========================================================

exports.getHistorialStatus = async (req, res) => {
  try {
    await poolConnect;

    const pool = await getPool();

    const result = await pool.request().query(`
      SELECT
        COUNT_BIG(*) AS total,
        SUM(CASE WHEN eliminado = 0 THEN 1 ELSE 0 END) AS activos,
        SUM(CASE WHEN eliminado = 1 THEN 1 ELSE 0 END) AS eliminados,
        MIN(fecha) AS fecha_minima,
        MAX(fecha) AS fecha_maxima,
        (
          SELECT TOP 1 sync_version
          FROM dbo.movimientos_historial
          ORDER BY sync_version DESC
        ) AS ultima_version
      FROM dbo.movimientos_historial;
    `);

    const row = result.recordset?.[0] || {};

    return res.json({
      total: Number(row.total || 0),
      activos: Number(row.activos || 0),
      eliminados: Number(row.eliminados || 0),
      fecha_minima: row.fecha_minima || null,
      fecha_maxima: row.fecha_maxima || null,
      ultima_version: rowVersionToHex(row.ultima_version),
    });
  } catch (err) {
    console.error("movimientos.getHistorialStatus:", err);

    return res.status(500).json({
      error: "Error al consultar estado del historial",
      detalle: err.message,
    });
  }
};

// ========================================================
// GET /movimientos/export
// ========================================================

exports.exportAll = async (req, res) => {
  try {
    await poolConnect;

    const pool = await getPool();

    const filters = parseFilters(req.query.filters);

    const sortKey = safeText(req.query.sortKey);

    const sortDir = safeText(req.query.sortDir);

    const request = pool.request();

    request.timeout = 180000;

    const sqlBase = buildMovimientosHistorialBase();

    const where = buildWhere(filters, request);

    const orderBy = getOrderBy(sortKey, sortDir);

    const sqlFinal = `
      SELECT *
      ${sqlBase}
      ${where}
      ${orderBy};
    `;

    const result = await request.query(sqlFinal);

    return res.json(result.recordset || []);
  } catch (err) {
    console.error("movimientos.exportAll:", err);

    return res.status(500).json({
      error: "Error al exportar movimientos",

      detalle: err.message,
    });
  }
};

// ========================================================
// GET /movimientos/distinct
// ========================================================

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

    const sqlBase = buildMovimientosHistorialBase();

    const filtersWithoutCurrent = {
      ...filters,
    };

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

      FROM
      (
        SELECT DISTINCT
          CASE
            WHEN ${columnSql} IS NULL
              THEN ''

            ELSE CAST(
              ${columnSql}
              AS NVARCHAR(500)
            )
          END AS value

        ${sqlBase}

        ${whereFinal}
      ) valores

      ORDER BY value;
    `;

    const result = await request.query(query);

    return res.json(
      (result.recordset || []).map((row) => ({
        value: row.value ?? "",

        label:
          row.value === null || row.value === undefined || row.value === ""
            ? "(Vacíos)"
            : String(row.value),
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

// ========================================================
// PUT /movimientos
// ========================================================

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
      return res.status(400).json({
        error: "Actuante inválido",
      });
    }

    await poolConnect;

    const pool = await getPool();

    if (referenteFinal !== null) {
      const referente = await pool
        .request()
        .input("id", sql.Int, referenteFinal).query(`
              SELECT TOP 1
                id_referente,
                activo

              FROM dbo.referentes

              WHERE id_referente = @id;
            `);

      if (!referente.recordset.length) {
        return res.status(400).json({
          error: "Actuante inexistente",
        });
      }

      if (!referente.recordset[0].activo) {
        return res.status(400).json({
          error: "Actuante inactivo",
        });
      }
    }

    if (tipo === "AJUSTE") {
      const numero = Number(numeroRaw);

      if (!Number.isFinite(numero)) {
        return res.status(400).json({
          error: "Número de ajuste inválido",
        });
      }

      const result = await pool
        .request()
        .input("numero", sql.Int, numero)
        .input("remito", sql.NVarChar(200), remitoReferencia)
        .input("obra", sql.NVarChar(200), obraFinal)
        .input("version", sql.NVarChar(100), versionFinal)
        .input("referente", sql.Int, referenteFinal).query(`
              UPDATE dbo.ajustes

              SET
                remito_referencia =
                  @remito,

                obra =
                  @obra,

                version =
                  @version,

                id_referente =
                  @referente

              WHERE numero_ajuste =
                @numero;

              SELECT
                @@ROWCOUNT
                  AS affected;
            `);

      if (Number(result.recordset[0].affected) !== 1) {
        return res.status(404).json({
          error: "Ajuste no encontrado",
        });
      }

      return res.json({
        ok: true,

        message: "Ajuste actualizado correctamente",
      });
    }

    if (tipo === "TRANSFERENCIA") {
      const result = await pool
        .request()
        .input("numero", sql.VarChar(20), numeroRaw)
        .input("remito", sql.NVarChar(200), remitoReferencia)
        .input("referente", sql.Int, referenteFinal).query(`
              UPDATE dbo.transferencias

              SET
                remito_referencia =
                  @remito,

                id_referente =
                  @referente

              WHERE numero_transferencia =
                @numero;

              SELECT
                @@ROWCOUNT
                  AS affected;
            `);

      if (Number(result.recordset[0].affected) !== 1) {
        return res.status(404).json({
          error: "Transferencia no encontrada",
        });
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
        "Solo se permite editar movimientos de tipo AJUSTE o TRANSFERENCIA",
    });
  } catch (err) {
    console.error("movimientos.updateMovimientoCabecera:", err);

    return res.status(500).json({
      error: "Error al actualizar movimiento",

      detalle: err.message,
    });
  }
};

// ========================================================
// GET /movimientos/transaccion/:numero
// ========================================================

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

    const selects = [];

    const numeroAjuste = Number(numeroRaw);

    if (Number.isFinite(numeroAjuste)) {
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
              )
              AS VARCHAR(300)
            )
              AS id_movimiento,

            TRY_CONVERT(
              BIGINT,
              a.numero_ajuste
            )
              AS orden_movimiento,

            CAST(
              a.numero_ajuste
              AS VARCHAR(50)
            )
              AS numero_transaccion,

            CONVERT(
              date,
              a.fecha
            )
              AS fecha,

            CONVERT(
              date,
              ISNULL(
                a.fecha_real,
                a.fecha
              )
            )
              AS fecha_real,

            CAST(
              ad.cod_articulo
              AS VARCHAR(100)
            )
              AS codigo,

            CAST(
              ad.descripcion
              AS VARCHAR(500)
            )
              AS descripcion,

            ABS(
              CAST(
                ad.cantidad
                AS INT
              )
            )
              AS cantidad,

            CAST(
              CASE
                WHEN ad.cantidad < 0
                  THEN a.deposito
                ELSE NULL
              END
              AS VARCHAR(255)
            )
            AS deposito_origen,

            CAST(
              NULL
              AS VARCHAR(255)
            )
              AS ubicacion_origen,

            CAST(
              CASE
                WHEN ad.cantidad > 0
                  THEN a.deposito
                ELSE NULL
              END
              AS VARCHAR(255)
            )
              AS deposito_destino,

            CAST(
              NULL
              AS VARCHAR(255)
            )
              AS ubicacion_destino,

            CAST(
              'AJUSTE'
              AS VARCHAR(50)
            )
              AS tipo_transaccion,

            CAST(
              COALESCE(
                am.nombre,
                a.motivo
              )
              AS VARCHAR(255)
            )
              AS motivo,

            CAST(
              a.remito_referencia
              AS VARCHAR(255)
            )
              AS remito_referencia,

            CAST(
              a.obra
              AS VARCHAR(255)
            )
              AS obra,

            CAST(
              a.version
              AS VARCHAR(255)
            )
              AS version,

            CAST(
              ref.nombre
              AS VARCHAR(255)
            )
              AS referente,

            a.id_referente
              AS id_referente,

            CAST(
              art.proveedor
              AS VARCHAR(255)
            )
              AS proveedor,

            CAST(
              CASE
                WHEN ad.cantidad < 0
                  THEN 'E'
                WHEN ad.cantidad > 0
                  THEN 'I'
                ELSE ''
              END
              AS VARCHAR(10)
            )
              AS ingreso_egreso,

            CAST(
              a.usuario
              AS VARCHAR(255)
            )
              AS usuario

          FROM dbo.ajustes a

          JOIN dbo.ajustes_detalles ad
            ON ad.ajuste_id =
               a.numero_ajuste

          LEFT JOIN dbo.ajustes_motivos am
            ON am.id_motivo =
               a.motivo_id

          LEFT JOIN dbo.articulos art
            ON art.codigo =
               ad.cod_articulo

          LEFT JOIN dbo.referentes ref
            ON ref.id_referente =
               a.id_referente

          WHERE a.numero_ajuste =
            @numeroAjuste
        `);
    }

    selects.push(`
        SELECT
          CAST(
            CONCAT(
              'TRANSFERENCIA-',
              t.numero_transferencia,
              '-',
              art.codigo,
              '-',
              td.cantidad
            )
            AS VARCHAR(300)
          )
            AS id_movimiento,

          TRY_CONVERT(
            BIGINT,
            t.numero_transferencia
          )
            AS orden_movimiento,

          CAST(
            t.numero_transferencia
            AS VARCHAR(50)
          )
            AS numero_transaccion,

          CONVERT(
            date,
            t.fecha
          )
            AS fecha,

          CONVERT(
            date,
            ISNULL(
              t.fecha_real,
              t.fecha
            )
          )
            AS fecha_real,

          CAST(
            art.codigo
            AS VARCHAR(100)
          )
            AS codigo,

          CAST(
            art.descripcion
            AS VARCHAR(500)
          )
            AS descripcion,

          CAST(
            td.cantidad
            AS INT
          )
            AS cantidad,

          CAST(
            t.origen
            AS VARCHAR(255)
          )
            AS deposito_origen,

          CAST(
            uo.nombre
            AS VARCHAR(255)
          )
            AS ubicacion_origen,

          CAST(
            t.destino
            AS VARCHAR(255)
          )
            AS deposito_destino,

          CAST(
            ud.nombre
            AS VARCHAR(255)
          )
            AS ubicacion_destino,
          CAST(
            'TRANSFERENCIA'
            AS VARCHAR(50)
          )
            AS tipo_transaccion,

          CAST(
            NULL
            AS VARCHAR(255)
          )
            AS motivo,

          CAST(
            t.remito_referencia
            AS VARCHAR(255)
          )
            AS remito_referencia,

          CAST(
            NULL
            AS VARCHAR(255)
          )
            AS obra,

          CAST(
            NULL
            AS VARCHAR(255)
          )
            AS version,

          CAST(
            ref.nombre
            AS VARCHAR(255)
          )
            AS referente,

          t.id_referente
            AS id_referente,

          CAST(
            art.proveedor
            AS VARCHAR(255)
          )
            AS proveedor,

          CAST(
            NULL
            AS VARCHAR(10)
          )
            AS ingreso_egreso,

          CAST(
            t.usuario
            AS VARCHAR(255)
          )
            AS usuario

        FROM dbo.transferencias t

        JOIN dbo.transferencias_detalle td
          ON td.transferencia_id =
            t.id

        JOIN dbo.articulos art
          ON art.id_articulo =
            td.articulo_id

        LEFT JOIN dbo.referentes ref
          ON ref.id_referente =
            t.id_referente
        
        LEFT JOIN dbo.ubicaciones uo
          ON uo.id_ubicacion =
            t.id_ubicacion_origen

        LEFT JOIN dbo.ubicaciones ud
          ON ud.id_ubicacion =
            t.id_ubicacion_destino

        WHERE t.numero_transferencia =
          @numeroTexto
      `);

    const numeroRemito = Number(numeroRaw);

    if (Number.isFinite(numeroRemito)) {
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
              )
              AS VARCHAR(300)
            )
              AS id_movimiento,

            TRY_CONVERT(
              BIGINT,
              r.numero_transaccion
            )
              AS orden_movimiento,

            CAST(
              r.numero_transaccion
              AS VARCHAR(50)
            )
              AS numero_transaccion,

            CONVERT(
              date,
              r.fecha
            )
              AS fecha,

            CONVERT(
              date,
              r.fecha
            )
              AS fecha_real,

            CAST(
              rd.cod_articulo
              AS VARCHAR(100)
            )
              AS codigo,

            CAST(
              rd.descripcion
              AS VARCHAR(500)
            )
              AS descripcion,

            ABS(
              CAST(
                rd.cantidad
                AS INT
              )
            )
              AS cantidad,

            CAST(
              CASE
                WHEN r.tipo =
                     'SALIDA'
                  THEN
                    r.deposito_nombre
                ELSE NULL
              END
              AS VARCHAR(255)
            )
              AS deposito_origen,

              CAST(
                NULL
                AS VARCHAR(255)
              )
                AS ubicacion_origen,

              CAST(
                CASE
                  WHEN r.tipo <>
                      'SALIDA'
                    THEN
                      r.deposito_nombre
                  ELSE NULL
                END
                AS VARCHAR(255)
              )
                AS deposito_destino,

              CAST(
                NULL
                AS VARCHAR(255)
              )
                AS ubicacion_destino,

            CAST(
              'REMITO'
              AS VARCHAR(50)
            )
              AS tipo_transaccion,

            CAST(
              NULL
              AS VARCHAR(255)
            )
              AS motivo,

            CAST(
              r.numero_remito
              AS VARCHAR(255)
            )
              AS remito_referencia,

            CAST(
              NULL
              AS VARCHAR(255)
            )
              AS obra,

            CAST(
              NULL
              AS VARCHAR(255)
            )
              AS version,

            CAST(
              NULL
              AS VARCHAR(255)
            )
              AS referente,

            CAST(
              NULL
              AS INT
            )
              AS id_referente,

            CAST(
              r.proveedor
              AS VARCHAR(255)
            )
              AS proveedor,

            CAST(
              CASE
                WHEN r.tipo =
                     'SALIDA'
                  THEN 'E'
                ELSE 'I'
              END
              AS VARCHAR(10)
            )
              AS ingreso_egreso,

            CAST(
              r.usuario
              AS VARCHAR(255)
            )
              AS usuario

          FROM dbo.remitos r

          JOIN dbo.remitos_detalles rd
            ON rd.remito_id =
               r.numero_remito

          WHERE r.numero_transaccion =
            @numeroRemito
        `);
    }

    if (!selects.length) {
      return res.json([]);
    }

    const request = pool.request();

    request.input("numeroTexto", sql.VarChar(20), numeroRaw);

    request.input(
      "numeroAjuste",
      sql.Int,
      Number.isFinite(numeroAjuste) ? numeroAjuste : null,
    );

    request.input(
      "numeroRemito",
      sql.BigInt,
      Number.isFinite(numeroRemito) ? numeroRemito : null,
    );

    const result = await request.query(`
          SELECT *

          FROM
          (
            ${selects.join("\nUNION ALL\n")}
          ) movimientos

          ORDER BY
            tipo_transaccion,
            codigo;
        `);

    return res.json(result.recordset || []);
  } catch (err) {
    console.error("movimientos.getByNumeroTransaccion:", err);

    return res.status(500).json({
      error: "Error al buscar la transacción",

      detalle: err.message,
    });
  }
};

// ========================================================
// PUT /movimientos/masivo
// ========================================================

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
      return res.status(400).json({
        error: "Actuante inválido",
      });
    }

    await poolConnect;

    const pool = await getPool();

    if (referenteFinal !== null) {
      const referente = await pool
        .request()
        .input("id", sql.Int, referenteFinal).query(`
              SELECT TOP 1
                id_referente,
                activo

              FROM dbo.referentes

              WHERE id_referente = @id;
            `);

      if (!referente.recordset.length) {
        return res.status(400).json({
          error: "Actuante inexistente",
        });
      }

      if (!referente.recordset[0].activo) {
        return res.status(400).json({
          error: "Actuante inactivo",
        });
      }
    }

    if (tipo === "AJUSTE") {
      const numero = Number(numeroRaw);

      if (!Number.isFinite(numero)) {
        return res.status(400).json({
          error: "Número de ajuste inválido",
        });
      }

      const result = await pool
        .request()
        .input("numero", sql.Int, numero)
        .input("remito", sql.NVarChar(200), remitoReferencia)
        .input("obra", sql.NVarChar(200), obraFinal)
        .input("version", sql.NVarChar(100), versionFinal)
        .input("referente", sql.Int, referenteFinal).query(`
              UPDATE dbo.ajustes

              SET
                remito_referencia =
                  @remito,

                obra =
                  @obra,

                version =
                  @version,

                id_referente =
                  @referente

              WHERE numero_ajuste =
                @numero;

              SELECT
                @@ROWCOUNT
                  AS affected;
            `);

      if (Number(result.recordset[0].affected) !== 1) {
        return res.status(404).json({
          error: "Ajuste no encontrado",
        });
      }

      return res.json({
        ok: true,

        message: "Transacción de ajuste actualizada correctamente",
      });
    }

    if (tipo === "TRANSFERENCIA") {
      const result = await pool
        .request()
        .input("numero", sql.VarChar(20), numeroRaw)
        .input("remito", sql.NVarChar(200), remitoReferencia)
        .input("referente", sql.Int, referenteFinal).query(`
              UPDATE dbo.transferencias

              SET
                remito_referencia =
                  @remito,

                id_referente =
                  @referente

              WHERE numero_transferencia =
                @numero;

              SELECT
                @@ROWCOUNT
                  AS affected;
            `);

      if (Number(result.recordset[0].affected) !== 1) {
        return res.status(404).json({
          error: "Transferencia no encontrada",
        });
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
      error: "Solo se permite edición masiva de AJUSTE o TRANSFERENCIA",
    });
  } catch (err) {
    console.error("movimientos.updateMovimientoCabeceraMasivo:", err);

    return res.status(500).json({
      error: "Error al actualizar masivamente la transacción",

      detalle: err.message,
    });
  }
};

// ========================================================
// GET /movimientos/referencia/:referencia
// ========================================================

exports.getByReferencia = async (req, res) => {
  try {
    const referencia = String(req.params.referencia || "").trim();

    if (!referencia) {
      return res.status(400).json({
        error: "Debe indicar una referencia",
      });
    }

    await poolConnect;

    const pool = await getPool();

    const sqlBase = buildMovimientosHistorialBase();

    const result = await pool
      .request()
      .input("referencia", sql.NVarChar(200), referencia).query(`
          SELECT *

          ${sqlBase}

          WHERE
            movimientos.remito_referencia =
              @referencia

          ORDER BY
            movimientos.tipo_transaccion,
            movimientos.numero_transaccion,
            movimientos.codigo;
        `);

    return res.json(result.recordset || []);
  } catch (err) {
    console.error("movimientos.getByReferencia:", err);

    return res.status(500).json({
      error: "Error al buscar movimientos por referencia",

      detalle: err.message,
    });
  }
};

// ========================================================
// GET /movimientos/carga-transferencia
// ========================================================

exports.buscarParaCargaTransferencia = async (req, res) => {
  try {
    const modo = String(req.query.modo || "")
      .trim()
      .toLowerCase();

    const referencia = String(req.query.referencia || "").trim();

    const obra = String(req.query.obra || "").trim();

    const version = String(req.query.version || "").trim();

    if (!["referencia", "obra_version"].includes(modo)) {
      return res.status(400).json({
        error: "Modo de búsqueda inválido",
      });
    }

    if (modo === "referencia" && !referencia) {
      return res.status(400).json({
        error: "Debe indicar una referencia",
      });
    }

    if (modo === "obra_version" && (!obra || !version)) {
      return res.status(400).json({
        error: "Debe indicar obra y versión",
      });
    }

    await poolConnect;

    const pool = await getPool();

    const sqlBase = buildMovimientosHistorialBase();

    const request = pool.request();

    request.timeout = 120000;

    let where = "";

    if (modo === "referencia") {
      request.input("referencia", sql.NVarChar(200), referencia);

      where = `
          WHERE
            movimientos.remito_referencia =
              @referencia
        `;
    } else {
      request.input("obra", sql.NVarChar(200), obra);

      request.input("version", sql.NVarChar(100), version);

      where = `
          WHERE
            movimientos.obra =
              @obra

            AND
            movimientos.version =
              @version
        `;
    }

    const result = await request.query(`
          SELECT *

          ${sqlBase}

          ${where}

          ORDER BY
            movimientos.tipo_transaccion,
            movimientos.numero_transaccion,
            movimientos.deposito_origen,
            movimientos.deposito_destino,
            movimientos.codigo;
        `);

    return res.json(result.recordset || []);
  } catch (error) {
    console.error("movimientos.buscarParaCargaTransferencia:", error);

    return res.status(500).json({
      error: "Error al buscar movimientos",

      detalle: error.message,
    });
  }
};

exports.update = exports.updateMovimientoCabecera;

exports.updateMasivo = exports.updateMovimientoCabeceraMasivo;

exports.getByTransaccion = exports.getByNumeroTransaccion;
