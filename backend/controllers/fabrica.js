const { sql, poolConnect, getPool } = require('../db');
const toDb = (v) => (v == null || String(v).trim() === '' ? null : String(v).trim());
const up   = (v) => (toDb(v)?.toUpperCase() ?? null);

/**
 * POST /fabrica/ordenes
 * Body: { codigo, deposito_origen_id, deposito_destino_id, cantidad }
 * - Valida que exista fórmula para `codigo`
 * - Chequea stock suficiente en depósito origen para TODOS los materiales
 * - Inserta orden + detalle
 * - Actualiza stock: (-) materiales en origen, (+) producto en destino
 * - numero_orden = id
 */
exports.create = async (req, res) => {
  const codigo = up(req.body?.codigo);
  const depO = Number(req.body?.deposito_origen_id);
  const depD = Number(req.body?.deposito_destino_id);
  const cant = Number(req.body?.cantidad);

  if (!codigo || !depO || !depD || !cant || cant <= 0) {
    return res.status(400).json({ error: 'Datos incompletos o inválidos' });
  }

  let trans;
  try {
    await poolConnect;
    const pool = await getPool();
    trans = new sql.Transaction(pool);
    await trans.begin();
    const rq = new sql.Request(trans);

    // ----- Producto -----
    const pr = await rq
      .input('c', sql.VarChar, codigo)
      .query(`
        SELECT id_articulo, codigo, descripcion
        FROM articulos
        WHERE UPPER(LTRIM(RTRIM(codigo))) = @c
      `);
    if (!pr.recordset.length) {
      await trans.rollback();
      return res.status(404).json({ error: 'Artículo (producto) no encontrado' });
    }
    const producto = pr.recordset[0];
    const productoId = producto.id_articulo;

    // ----- Fórmula existente -----
    const fc = await rq
      .input('pid', sql.Int, productoId)
      .query(`SELECT id FROM produccion_formulas WHERE producto_id = @pid`);
    if (!fc.recordset.length) {
      await trans.rollback();
      return res.status(400).json({ error: 'No existe fórmula de producción para este código' });
    }
    const fid = fc.recordset[0].id;

    // Detalle de la fórmula: materiales + cantidades por unidad
    const det = await rq
      .input('fid', sql.Int, fid)
      .query(`
        SELECT d.material_id, d.cantidad AS cant_por_unidad,
               a.codigo, a.descripcion
        FROM produccion_formula_detalles d
        JOIN articulos a ON a.id_articulo = d.material_id
        WHERE d.formula_id = @fid
        ORDER BY a.codigo
      `);

    if (!det.recordset.length) {
      await trans.rollback();
      return res.status(400).json({ error: 'La fórmula no tiene materiales cargados' });
    }

    // ----- Validar stock de materiales en depósito origen -----
    const faltantes = [];
    for (const row of det.recordset) {
      const reqQty = row.cant_por_unidad * cant; // total a consumir
      const chk = await rq
        .input('idArt', sql.Int, row.material_id)
        .input('idDep', sql.Int, depO)
        .query(`
          SELECT ISNULL(SUM(cantidad),0) AS q
          FROM stock
          WHERE id_articulo = @idArt AND id_deposito = @idDep
        `);
      const disponible = Number(chk.recordset[0].q || 0);
      if (disponible < reqQty) {
        faltantes.push({
          codigo: row.codigo,
          requerido: reqQty,
          disponible
        });
      }
    }

    if (faltantes.length) {
      await trans.rollback();
      return res.status(400).json({
        error: 'Stock insuficiente en depósito origen',
        faltantes
      });
    }

    // ----- Insertar cabecera -----
    const ins = await rq
      .input('depO', sql.Int, depO)
      .input('depD', sql.Int, depD)
      .input('pid2', sql.Int, productoId)
      .input('cant', sql.Int, cant)
      .query(`
        INSERT INTO produccion_ordenes (deposito_origen_id, deposito_destino_id, producto_id, cantidad)
        OUTPUT INSERTED.id
        VALUES (@depO, @depD, @pid2, @cant)
      `);
    const ordenId = ins.recordset[0].id;

    // numero_orden = id
    await rq.input('id', sql.Int, ordenId)
      .query(`UPDATE produccion_ordenes SET numero_orden = CAST(id AS VARCHAR(20)) WHERE id = @id`);

    // ----- Insertar detalle y mover stock -----
    for (const row of det.recordset) {
      const consume = row.cant_por_unidad * cant;

      // detalle
      await rq
        .input('oid', sql.Int, ordenId)
        .input('mid', sql.Int, row.material_id)
        .input('qty', sql.Int, consume)
        .query(`
          INSERT INTO produccion_orden_detalles (orden_id, material_id, cantidad)
          VALUES (@oid, @mid, @qty)
        `);

      // (-) materiales en origen
      await rq
        .input('depO2', sql.Int, depO)
        .input('matO', sql.Int, row.material_id)
        .query(`
          IF NOT EXISTS (SELECT 1 FROM stock WHERE id_deposito = @depO2 AND id_articulo = @matO)
            INSERT INTO stock (id_deposito, id_articulo, cantidad) VALUES (@depO2, @matO, 0);
          UPDATE stock SET cantidad = cantidad - ${consume}
          WHERE id_deposito = @depO2 AND id_articulo = @matO;
        `);
    }

    // (+) producto en destino
    await rq
      .input('depD2', sql.Int, depD)
      .input('pid3', sql.Int, productoId)
      .query(`
        IF NOT EXISTS (SELECT 1 FROM stock WHERE id_deposito = @depD2 AND id_articulo = @pid3)
          INSERT INTO stock (id_deposito, id_articulo, cantidad) VALUES (@depD2, @pid3, 0);
        UPDATE stock SET cantidad = cantidad + ${cant}
        WHERE id_deposito = @depD2 AND id_articulo = @pid3;
      `);

    await trans.commit();

    // Respuesta “bonita”
    const full = await (await getPool()).request()
      .input('oid', sql.Int, ordenId)
      .query(`
        SELECT 
          o.id, o.numero_orden, o.fecha, o.cantidad,
          d1.nombre AS deposito_origen, d2.nombre AS deposito_destino,
          a.codigo AS codigo, a.descripcion
        FROM produccion_ordenes o
        JOIN depositos d1 ON d1.id_deposito = o.deposito_origen_id
        JOIN depositos d2 ON d2.id_deposito = o.deposito_destino_id
        JOIN articulos a ON a.id_articulo = o.producto_id
        WHERE o.id = @oid
      `);

    res.status(201).json({
      message: 'Orden de producción creada',
      orden: full.recordset[0]
    });
  } catch (err) {
    try { if (trans) await trans.rollback(); } catch {}
    console.error('fabrica.create:', err);
    res.status(500).json({ error: 'Error al crear orden de producción', detalle: err.message });
  }
};

// (Opcional) listar
exports.getAll = async (_req, res) => {
  try {
    await poolConnect;
    const pool = await getPool();
    const r = await pool.request().query(`
      SELECT 
        o.id, o.numero_orden, o.fecha, o.cantidad,
        d1.nombre AS deposito_origen, d2.nombre AS deposito_destino,
        a.codigo AS codigo, a.descripcion
      FROM produccion_ordenes o
      JOIN depositos d1 ON d1.id_deposito = o.deposito_origen_id
      JOIN depositos d2 ON d2.id_deposito = o.deposito_destino_id
      JOIN articulos a ON a.id_articulo = o.producto_id
      ORDER BY o.fecha DESC, o.id DESC
    `);
    res.json(r.recordset);
  } catch (err) {
    console.error('fabrica.getAll:', err);
    res.status(500).json({ error: 'Error al listar órdenes', detalle: err.message });
  }
};

// (Opcional) detalle
exports.getById = async (req, res) => {
  try {
    await poolConnect;
    const pool = await getPool();
    const id = Number(req.params.id);

    const cab = await pool.request()
      .input('id', sql.Int, id)
      .query(`
        SELECT 
          o.id, o.numero_orden, o.fecha, o.cantidad,
          d1.nombre AS deposito_origen, d2.nombre AS deposito_destino,
          a.codigo AS codigo, a.descripcion
        FROM produccion_ordenes o
        JOIN depositos d1 ON d1.id_deposito = o.deposito_origen_id
        JOIN depositos d2 ON d2.id_deposito = o.deposito_destino_id
        JOIN articulos a ON a.id_articulo = o.producto_id
        WHERE o.id = @id
      `);

    if (!cab.recordset.length) return res.status(404).json({ error: 'Orden no encontrada' });

    const det = await pool.request()
      .input('id', sql.Int, id)
      .query(`
        SELECT a.codigo, a.descripcion, d.cantidad
        FROM produccion_orden_detalles d
        JOIN articulos a ON a.id_articulo = d.material_id
        WHERE d.orden_id = @id
        ORDER BY a.codigo
      `);

    res.json({ cabecera: cab.recordset[0], detalle: det.recordset });
  } catch (err) {
    console.error('fabrica.getById:', err);
    res.status(500).json({ error: 'Error al obtener orden', detalle: err.message });
  }
};
