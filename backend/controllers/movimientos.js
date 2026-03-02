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
      // SALIDA
      selects.push(`
        SELECT
          t.fecha                          AS fecha,
          a.codigo                        AS codigo,
          a.descripcion                   AS descripcion,
          -1 * CAST(td.cantidad AS INT)   AS cantidad,
          t.origen                        AS deposito,
          t.usuario                       AS usuario,
          'TRANSFERENCIA'                 AS movimiento,
          t.numero_transferencia          AS num_movimiento
        FROM transferencias t
        JOIN ${transfDetalleTable} td
          ON td.transferencia_id = t.numero_transferencia
        JOIN articulos a
          ON a.id_articulo = td.articulo_id
      `);

      // ENTRADA
      selects.push(`
        SELECT
          t.fecha                          AS fecha,
          a.codigo                        AS codigo,
          a.descripcion                   AS descripcion,
          CAST(td.cantidad AS INT)        AS cantidad,
          t.destino                       AS deposito,
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
          CAST(ad.cantidad AS INT)        AS cantidad,
          a.deposito                      AS deposito,
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
        CASE 
          WHEN r.tipo = 'SALIDA' THEN -1 * CAST(rd.cantidad AS INT)
          ELSE CAST(rd.cantidad AS INT)
        END                             AS cantidad,
        r.deposito_nombre               AS deposito,
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
        -1 * CAST(od.cantidad AS INT)   AS cantidad,
        d.nombre                        AS deposito,
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
        d.nombre                        AS deposito,
        NULL                            AS usuario,
        'PRODUCCION'                    AS movimiento,
        o.numero_orden                  AS num_movimiento
      FROM produccion_ordenes o
      JOIN articulos a ON a.id_articulo = o.producto_id
      JOIN depositos d ON d.id_deposito = o.deposito_destino_id
    `);

    if (!selects.length) return res.json([]);

    const sqlFinal = selects.join('\nUNION ALL\n') +
      `\nORDER BY fecha DESC, num_movimiento DESC, codigo`;

    const r = await pool.request().query(sqlFinal);
    res.json(r.recordset);

  } catch (err) {
    console.error('movimientos.getAll:', err);
    res.status(500).json({ error: 'Error al obtener movimientos', detalle: err.message });
  }
};
