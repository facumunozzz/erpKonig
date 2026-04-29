// controllers/movimientos.js
const { sql, poolConnect, getPool } = require('../db');

function q(s) { return s.replace(/'/g, "''"); }

// Detecta qué tabla existe
async function pickExistingTable(pool, names = []) {
  const inList = names.map(n => `'${q(n)}'`).join(',');
  const r = await pool.request().query(`
    SELECT TOP 1 name
    FROM sys.objects
    WHERE type = 'U' AND name IN (${inList})
  `);
  return r.recordset[0]?.name || null;
}

exports.getAll = async (_req, res) => {
  try {
    await poolConnect;
    const pool = await getPool();

    const transfDetalleTable = await pickExistingTable(pool, [
      'transferencias_detalle',
      'transferencia_detalles',
      'transferencias_detalles'
    ]);

    const ajusteDetalleTable = await pickExistingTable(pool, [
      'ajustes_detalles',
      'ajuste_detalles'
    ]);

    const selects = [];

    // ==========================
// TRANSFERENCIAS
// ==========================
if (transfDetalleTable) {
  selects.push(`
    SELECT
      t.fecha                          AS fecha,
      a.codigo                        AS codigo,
      a.descripcion                   AS descripcion,
      CAST(td.cantidad AS INT)        AS cantidad,
      t.origen                        AS deposito_origen,
      t.destino                       AS deposito_destino,
      t.usuario                       AS usuario,
      'TRANSFERENCIA'                 AS movimiento,
      t.numero_transferencia          AS num_movimiento
    FROM transferencias t
    JOIN ${transfDetalleTable} td
      ON td.transferencia_id = t.numero_transferencia
    JOIN articulos a
      ON a.id_articulo = td.articulo_id
  `);
}

    // ==========================
    // AJUSTES
    // ==========================
    const ajustesTable = await pickExistingTable(pool, ['ajustes']);
    if (ajustesTable && ajusteDetalleTable) {
      selects.push(`
  SELECT
    a.fecha                          AS fecha,
    ad.cod_articulo                 AS codigo,
    ad.descripcion                  AS descripcion,
    ABS(CAST(ad.cantidad AS INT))   AS cantidad,
    CASE WHEN CAST(ad.cantidad AS INT) < 0 THEN a.deposito ELSE NULL END AS deposito_origen,
    CASE WHEN CAST(ad.cantidad AS INT) > 0 THEN a.deposito ELSE NULL END AS deposito_destino,
    a.usuario                       AS usuario,
    'AJUSTE'                        AS movimiento,
    a.numero_ajuste                 AS num_movimiento
  FROM ${ajustesTable} a
  JOIN ${ajusteDetalleTable} ad
    ON ad.ajuste_id = a.numero_ajuste
`);
    }

    // ==========================
  // REMITOS
  // ==========================
  const remitosTable = await pickExistingTable(pool, ['remitos']);
  const remitosDetTable = await pickExistingTable(pool, ['remitos_detalles']);

  if (remitosTable && remitosDetTable) {
    selects.push(`
  SELECT
    r.fecha                         AS fecha,
    rd.cod_articulo                AS codigo,
    rd.descripcion                 AS descripcion,
    ABS(CAST(rd.cantidad AS INT))  AS cantidad,
    CASE WHEN r.tipo = 'SALIDA' THEN r.deposito_nombre ELSE NULL END AS deposito_origen,
    CASE WHEN r.tipo <> 'SALIDA' THEN r.deposito_nombre ELSE NULL END AS deposito_destino,
    r.usuario                       AS usuario,
    'REMITO'                        AS movimiento,
    r.numero_remito                 AS num_movimiento
  FROM ${remitosTable} r
  JOIN ${remitosDetTable} rd
    ON rd.remito_id = r.numero_remito
`);
  }

    // ==========================
    // PRODUCCION - consumo
    // ==========================
    selects.push(`
  SELECT
    o.fecha                          AS fecha,
    a.codigo                        AS codigo,
    a.descripcion                   AS descripcion,
    CAST(od.cantidad AS INT)        AS cantidad,
    d.nombre                        AS deposito_origen,
    NULL                            AS deposito_destino,
    NULL                            AS usuario,
    'PRODUCCION'                    AS movimiento,
    o.numero_orden                  AS num_movimiento
  FROM produccion_orden_detalles od
  JOIN produccion_ordenes o ON o.id = od.orden_id
  JOIN articulos a ON a.id_articulo = od.material_id
  JOIN depositos d ON d.id_deposito = o.deposito_origen_id
`);

    // ==========================
    // PRODUCCION - alta producto
    // ==========================
    selects.push(`
  SELECT
    o.fecha                          AS fecha,
    a.codigo                        AS codigo,
    a.descripcion                   AS descripcion,
    CAST(o.cantidad AS INT)         AS cantidad,
    NULL                            AS deposito_origen,
    d.nombre                        AS deposito_destino,
    NULL                            AS usuario,
    'PRODUCCION'                    AS movimiento,
    o.numero_orden                  AS num_movimiento
  FROM produccion_ordenes o
  JOIN articulos a ON a.id_articulo = o.producto_id
  JOIN depositos d ON d.id_deposito = o.deposito_destino_id
`);

    if (!selects.length) return res.json([]);

    const sqlFinal = `
  SELECT TOP 100 *
  FROM (
    ${selects.join('\nUNION ALL\n')}
  ) movimientos
  ORDER BY fecha DESC, num_movimiento DESC, codigo
`;

const request = pool.request();
request.timeout = 60000;

const r = await request.query(sqlFinal);
res.json(r.recordset);

  } catch (err) {
    console.error('movimientos.getAll:', err);
    res.status(500).json({ error: 'Error al obtener movimientos', detalle: err.message });
  }
};
