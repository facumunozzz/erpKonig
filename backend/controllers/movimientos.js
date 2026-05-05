// controllers/movimientos.js
const { sql, poolConnect, getPool } = require("../db");

function q(s) {
  return String(s).replace(/'/g, "''");
}

// Detecta qué tabla existe
async function pickExistingTable(pool, names = []) {
  const inList = names.map((n) => `'${q(n)}'`).join(",");

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

    // ==========================
    // TRANSFERENCIAS
    // ==========================
    if (transfDetalleTable) {
      selects.push(`
        SELECT
          t.numero_transferencia                          AS numero_transaccion,
          CONVERT(date, t.fecha)                          AS fecha,
          CONVERT(date, ISNULL(t.fecha_real, t.fecha))     AS fecha_real,
          a.codigo                                         AS codigo,
          a.descripcion                                    AS descripcion,
          CAST(td.cantidad AS INT)                         AS cantidad,
          t.origen                                         AS deposito_origen,
          t.destino                                        AS deposito_destino,
          'TRANSFERENCIA'                                  AS tipo_transaccion,
          t.remito_referencia                              AS remito_referencia,
          NULL                                             AS obra,
          NULL                                             AS version,
          ref.nombre                                       AS referente,
          t.id_referente                                   AS id_referente,
          a.proveedor                                      AS proveedor,
          NULL                                             AS ingreso_egreso,
          t.usuario                                        AS usuario
        FROM dbo.transferencias t
        JOIN dbo.${transfDetalleTable} td
          ON td.transferencia_id = t.id
        JOIN dbo.articulos a
          ON a.id_articulo = td.articulo_id
        LEFT JOIN dbo.referentes ref
          ON ref.id_referente = t.id_referente
      `);
    }

    // ==========================
    // AJUSTES
    // ==========================
    if (ajustesTable && ajusteDetalleTable) {
      selects.push(`
        SELECT
          a.numero_ajuste                                  AS numero_transaccion,
          CONVERT(date, a.fecha)                           AS fecha,
          CONVERT(date, ISNULL(a.fecha_real, a.fecha))      AS fecha_real,
          ad.cod_articulo                                  AS codigo,
          ad.descripcion                                   AS descripcion,
          ABS(CAST(ad.cantidad AS INT))                    AS cantidad,
          CASE 
            WHEN CAST(ad.cantidad AS INT) < 0 THEN a.deposito 
            ELSE NULL 
          END                                              AS deposito_origen,
          CASE 
            WHEN CAST(ad.cantidad AS INT) > 0 THEN a.deposito 
            ELSE NULL 
          END                                              AS deposito_destino,
          'AJUSTE'                                         AS tipo_transaccion,
          a.remito_referencia                              AS remito_referencia,
          a.obra                                           AS obra,
          a.version                                        AS version,
          ref.nombre                                       AS referente,
          a.id_referente                                   AS id_referente,
          art.proveedor                                    AS proveedor,
          CASE 
            WHEN CAST(ad.cantidad AS INT) < 0 THEN 'E'
            WHEN CAST(ad.cantidad AS INT) > 0 THEN 'I'
            ELSE ''
          END                                              AS ingreso_egreso,
          a.usuario                                        AS usuario
        FROM dbo.${ajustesTable} a
        JOIN dbo.${ajusteDetalleTable} ad
          ON ad.ajuste_id = a.numero_ajuste
        LEFT JOIN dbo.articulos art
          ON UPPER(LTRIM(RTRIM(art.codigo))) = UPPER(LTRIM(RTRIM(ad.cod_articulo)))
        LEFT JOIN dbo.referentes ref
          ON ref.id_referente = a.id_referente
      `);
    }

    // ==========================
    // REMITOS
    // ==========================
    if (remitosTable && remitosDetTable) {
      selects.push(`
        SELECT
          r.numero_remito                                  AS numero_transaccion,
          CONVERT(date, r.fecha)                           AS fecha,
          CONVERT(date, r.fecha)                           AS fecha_real,
          rd.cod_articulo                                  AS codigo,
          rd.descripcion                                   AS descripcion,
          ABS(CAST(rd.cantidad AS INT))                    AS cantidad,
          CASE 
            WHEN r.tipo = 'SALIDA' THEN r.deposito_nombre 
            ELSE NULL 
          END                                              AS deposito_origen,
          CASE 
            WHEN r.tipo <> 'SALIDA' THEN r.deposito_nombre 
            ELSE NULL 
          END                                              AS deposito_destino,
          'REMITO'                                         AS tipo_transaccion,
          CAST(r.numero_remito AS VARCHAR(50))             AS remito_referencia,
          NULL                                             AS obra,
          NULL                                             AS version,
          NULL                                             AS referente,
          NULL                                             AS id_referente,
          art.proveedor                                    AS proveedor,
          CASE 
            WHEN r.tipo = 'SALIDA' THEN 'E'
            ELSE 'I'
          END                                              AS ingreso_egreso,
          r.usuario                                        AS usuario
        FROM dbo.${remitosTable} r
        JOIN dbo.${remitosDetTable} rd
          ON rd.remito_id = r.numero_remito
        LEFT JOIN dbo.articulos art
          ON UPPER(LTRIM(RTRIM(art.codigo))) = UPPER(LTRIM(RTRIM(rd.cod_articulo)))
      `);
    }

    // ==========================
    // PRODUCCIÓN - consumo de materiales
    // ==========================
    selects.push(`
      SELECT
        o.numero_orden                                    AS numero_transaccion,
        CONVERT(date, o.fecha)                            AS fecha,
        CONVERT(date, o.fecha)                            AS fecha_real,
        a.codigo                                          AS codigo,
        a.descripcion                                     AS descripcion,
        CAST(od.cantidad AS INT)                          AS cantidad,
        d.nombre                                          AS deposito_origen,
        NULL                                              AS deposito_destino,
        'PRODUCCION'                                      AS tipo_transaccion,
        NULL                                              AS remito_referencia,
        NULL                                              AS obra,
        NULL                                              AS version,
        NULL                                              AS referente,
        NULL                                              AS id_referente,
        a.proveedor                                       AS proveedor,
        'E'                                               AS ingreso_egreso,
        NULL                                              AS usuario
      FROM dbo.produccion_orden_detalles od
      JOIN dbo.produccion_ordenes o 
        ON o.id = od.orden_id
      JOIN dbo.articulos a 
        ON a.id_articulo = od.material_id
      JOIN dbo.depositos d 
        ON d.id_deposito = o.deposito_origen_id
    `);

    // ==========================
    // PRODUCCIÓN - alta de producto terminado
    // ==========================
    selects.push(`
      SELECT
        o.numero_orden                                    AS numero_transaccion,
        CONVERT(date, o.fecha)                            AS fecha,
        CONVERT(date, o.fecha)                            AS fecha_real,
        a.codigo                                          AS codigo,
        a.descripcion                                     AS descripcion,
        CAST(o.cantidad AS INT)                           AS cantidad,
        NULL                                              AS deposito_origen,
        d.nombre                                          AS deposito_destino,
        'PRODUCCION'                                      AS tipo_transaccion,
        NULL                                              AS remito_referencia,
        NULL                                              AS obra,
        NULL                                              AS version,
        NULL                                              AS referente,
        NULL                                              AS id_referente,
        a.proveedor                                       AS proveedor,
        'I'                                               AS ingreso_egreso,
        NULL                                              AS usuario
      FROM dbo.produccion_ordenes o
      JOIN dbo.articulos a 
        ON a.id_articulo = o.producto_id
      JOIN dbo.depositos d 
        ON d.id_deposito = o.deposito_destino_id
    `);

    if (!selects.length) {
      return res.json([]);
    }

    const sqlFinal = `
      SELECT TOP 1000 *
      FROM (
        ${selects.join("\nUNION ALL\n")}
      ) movimientos
      ORDER BY fecha DESC, numero_transaccion DESC, codigo
    `;

    const request = pool.request();
    request.timeout = 60000;

    const r = await request.query(sqlFinal);

    res.json(r.recordset || []);
  } catch (err) {
    console.error("movimientos.getAll:", err);

    res.status(500).json({
      error: "Error al obtener movimientos",
      detalle: err.message,
    });
  }
};

// ============================================================================
// PUT /movimientos
// Actualiza datos de cabecera desde la pantalla Movimientos
// Permite editar:
// - AJUSTE: remito_referencia, obra, version, id_referente
// - TRANSFERENCIA: remito_referencia, id_referente
// ============================================================================
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

    const tipo = String(tipo_transaccion || "").trim().toUpperCase();
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
      obra == null || String(obra).trim() === "" ? null : Number(obra);

    const versionFinal =
      version == null || String(version).trim() === "" ? null : Number(version);

    const referenteFinal =
      id_referente == null || String(id_referente).trim() === ""
        ? null
        : Number(id_referente);

    if (obraFinal !== null && !Number.isFinite(obraFinal)) {
      return res.status(400).json({ error: "Obra inválida" });
    }

    if (versionFinal !== null && !Number.isFinite(versionFinal)) {
      return res.status(400).json({ error: "Versión inválida" });
    }

    if (referenteFinal !== null && !Number.isFinite(referenteFinal)) {
      return res.status(400).json({ error: "Actuante inválido" });
    }

    await poolConnect;
    const pool = await getPool();

    // Validar actuante si viene informado
    if (referenteFinal !== null) {
      const ref = await pool
        .request()
        .input("id", sql.Int, referenteFinal)
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

    // ==========================
    // AJUSTE
    // ==========================
    if (tipo === "AJUSTE") {
      const numero = Number(numeroRaw);

      if (!Number.isFinite(numero)) {
        return res.status(400).json({ error: "Número de ajuste inválido" });
      }

      const r = await pool
        .request()
        .input("numero", sql.Int, numero)
        .input("remito", sql.VarChar, remitoReferencia)
        .input("obra", sql.Int, obraFinal)
        .input("version", sql.Int, versionFinal)
        .input("referente", sql.Int, referenteFinal)
        .query(`
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

    // ==========================
    // TRANSFERENCIA
    // ==========================
    if (tipo === "TRANSFERENCIA") {
      const r = await pool
        .request()
        .input("numero", sql.VarChar, numeroRaw)
        .input("remito", sql.VarChar, remitoReferencia)
        .input("referente", sql.Int, referenteFinal)
        .query(`
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

    return res.status(400).json({
      error: "Solo se permite editar movimientos de tipo AJUSTE o TRANSFERENCIA",
    });
  } catch (err) {
    console.error("movimientos.updateMovimientoCabecera:", err);

    return res.status(500).json({
      error: "Error al actualizar movimiento",
      detalle: err.message,
    });
  }
};