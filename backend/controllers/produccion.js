// controllers/produccion.js
const { sql, poolConnect, getPool } = require('../db');

const toDb = (v) => (v == null || String(v).trim() === '' ? null : String(v).trim());
const up = (v) => (toDb(v)?.toUpperCase() ?? null);

// ============================================================================
// POST /produccion/formulas
// ============================================================================
exports.createFormula = async (req, res) => {
  const codigoProducto = up(req.body?.codigo);
  const itemsRaw = Array.isArray(req.body?.items) ? req.body.items : [];

  if (!codigoProducto) return res.status(400).json({ error: 'Debe indicar el CÓDIGO del producto' });
  if (!itemsRaw.length) return res.status(400).json({ error: 'Debe incluir al menos un MATERIAL en items' });

  const items = itemsRaw
    .map(it => ({ cod: up(it.cod_articulo), cant: Number(it.cantidad) || 0 }))
    .filter(it => it.cod && it.cant > 0);

  if (!items.length) return res.status(400).json({ error: 'Items inválidos: códigos/cantidades' });

  const agg = new Map();
  for (const it of items) agg.set(it.cod, (agg.get(it.cod) || 0) + it.cant);
  const itemsMerged = Array.from(agg.entries()).map(([cod, cant]) => ({ cod, cant }));

  if (itemsMerged.some(it => it.cod === codigoProducto)) {
    return res.status(400).json({ error: 'El producto no puede ser material de su propia fórmula' });
  }

  let trans;
  try {
    await poolConnect;
    const pool = await getPool();
    trans = new sql.Transaction(pool);
    await trans.begin();
    const rq = new sql.Request(trans);

    // Producto
    const prod = await rq
      .input('c', sql.VarChar, codigoProducto)
      .query(`
        SELECT id_articulo, codigo, descripcion
        FROM articulos
        WHERE UPPER(LTRIM(RTRIM(codigo))) = @c
      `);

    if (!prod.recordset.length) {
      await trans.rollback();
      return res.status(400).json({ error: 'El código de PRODUCTO no existe' });
    }
    const producto = prod.recordset[0];
    const productoId = producto.id_articulo;

    // Ya existe?
    const ya = await rq
      .input('pid', sql.Int, productoId)
      .query(`SELECT id FROM produccion_formulas WHERE producto_id = @pid`);
    if (ya.recordset.length) {
      await trans.rollback();
      return res.status(409).json({ error: 'Ya existe una fórmula para este producto' });
    }

    // Validar materiales
    const inList = itemsMerged.map((_, i) => `@m${i}`).join(',');
    itemsMerged.forEach((it, i) => rq.input(`m${i}`, sql.VarChar, it.cod));
    const mats = await rq.query(`
      SELECT id_articulo, UPPER(LTRIM(RTRIM(codigo))) AS cod, descripcion
      FROM articulos
      WHERE UPPER(LTRIM(RTRIM(codigo))) IN (${inList})
    `);

    const idByCode = new Map(mats.recordset.map(r => [r.cod, r.id_articulo]));
    const descByCode = new Map(mats.recordset.map(r => [r.cod, r.descripcion]));
    const faltantes = itemsMerged.filter(it => !idByCode.has(it.cod)).map(it => it.cod);
    if (faltantes.length) {
      await trans.rollback();
      return res.status(400).json({ error: 'Materiales inexistentes', detalle: faltantes });
    }

    // Cabecera
    const insCab = await rq
      .input('pid2', sql.Int, productoId)
      .query(`
        INSERT INTO produccion_formulas (producto_id)
        OUTPUT INSERTED.id
        VALUES (@pid2)
      `);
    const formulaId = insCab.recordset[0].id;

    // Detalle
    for (const it of itemsMerged) {
      const matId = idByCode.get(it.cod);
      await rq
        .input('fid', sql.Int, formulaId)
        .input('mid', sql.Int, matId)
        .input('qty', sql.Int, it.cant)
        .query(`
          INSERT INTO produccion_formula_detalles (formula_id, material_id, cantidad)
          VALUES (@fid, @mid, @qty)
        `);
    }

    await trans.commit();

    const detalle = itemsMerged.map(it => ({
      cod_articulo: it.cod,
      descripcion: descByCode.get(it.cod) || '',
      cantidad: it.cant
    }));

    res.status(201).json({
      message: 'Fórmula creada correctamente',
      formula: {
        producto: {
          id_articulo: productoId,
          cod_articulo: codigoProducto,
          descripcion: producto.descripcion
        },
        detalle
      }
    });
  } catch (err) {
    try { if (trans) await trans.rollback(); } catch {}
    console.error('produccion.createFormula:', err);
    res.status(500).json({ error: 'Error al crear la fórmula', detalle: err.message });
  }
};

// ============================================================================
// GET /produccion/formulas/:codigo
// ============================================================================
exports.getFormulaByCodigo = async (req, res) => {
  const codigo = up(req.params.codigo);
  if (!codigo) return res.status(400).json({ error: 'Código inválido' });

  try {
    await poolConnect;
    const pool = await getPool();

    const pr = await pool.request()
      .input('c', sql.VarChar, codigo)
      .query(`
        SELECT id_articulo, codigo, descripcion
        FROM articulos
        WHERE UPPER(LTRIM(RTRIM(codigo))) = @c
      `);
    if (!pr.recordset.length) return res.status(404).json({ error: 'Artículo no encontrado' });
    const prod = pr.recordset[0];

    const cab = await pool.request()
      .input('pid', sql.Int, prod.id_articulo)
      .query(`SELECT id FROM produccion_formulas WHERE producto_id = @pid`);
    if (!cab.recordset.length) {
      return res.json({ producto: prod, detalle: [], message: 'No existe fórmula para este código' });
    }
    const fid = cab.recordset[0].id;

    const det = await pool.request()
      .input('fid', sql.Int, fid)
      .query(`
        SELECT
          d.cantidad,
          a.codigo AS cod_articulo,
          a.descripcion
        FROM produccion_formula_detalles d
        JOIN articulos a ON a.id_articulo = d.material_id
        WHERE d.formula_id = @fid
        ORDER BY a.codigo
      `);

    res.json({ producto: prod, detalle: det.recordset });
  } catch (err) {
    console.error('produccion.getFormulaByCodigo:', err);
    res.status(500).json({ error: 'Error al obtener la fórmula', detalle: err.message });
  }
};

// ============================================================================
// GET /produccion/formulas
// ============================================================================
exports.getAllFormulas = async (_req, res) => {
  try {
    await poolConnect;
    const pool = await getPool();

    const r = await pool.request().query(`
      SELECT
        f.id,
        a.codigo AS codigo,
        a.descripcion,
        f.fecha_creacion
      FROM produccion_formulas f
      JOIN articulos a ON a.id_articulo = f.producto_id
      ORDER BY a.codigo
    `);

    res.json(r.recordset);
  } catch (err) {
    console.error('produccion.getAllFormulas:', err);
    res.status(500).json({ error: 'Error al listar fórmulas', detalle: err.message });
  }
};

// ============================================================================
// GET /produccion/check/:codigo
// ============================================================================
exports.checkProducto = async (req, res) => {
  const codigo = up(req.params.codigo);
  if (!codigo) return res.status(400).json({ error: 'Código inválido' });

  try {
    await poolConnect;
    const pool = await getPool();

    const r = await pool.request()
      .input('c', sql.VarChar, codigo)
      .query(`
        SELECT id_articulo, codigo, descripcion
        FROM articulos
        WHERE UPPER(LTRIM(RTRIM(codigo))) = @c
      `);

    if (!r.recordset.length) return res.json({ exists: false });
    res.json({ exists: true, articulo: r.recordset[0] });
  } catch (err) {
    console.error('produccion.checkProducto:', err);
    res.status(500).json({ error: 'Error verificando producto', detalle: err.message });
  }
};

// ============================================================================
// POST /produccion/validar-materiales
// ============================================================================
exports.validateMateriales = async (req, res) => {
  const codsRaw = Array.isArray(req.body?.codigos) ? req.body.codigos : [];
  const cods = codsRaw.map(up).filter(Boolean);

  if (!cods.length) return res.status(400).json({ error: 'Debe enviar codigos[]' });

  try {
    await poolConnect;
    const pool = await getPool();
    const rq = pool.request();

    const inList = cods.map((_, i) => `@c${i}`).join(',');
    cods.forEach((c, i) => rq.input(`c${i}`, sql.VarChar, c));

    const r = await rq.query(`
      SELECT id_articulo, UPPER(LTRIM(RTRIM(codigo))) AS cod, descripcion
      FROM articulos
      WHERE UPPER(LTRIM(RTRIM(codigo))) IN (${inList})
    `);

    const found = new Map(r.recordset.map(a => [a.cod, a]));
    const validos = cods.filter(c => found.has(c)).map(c => found.get(c));
    const faltantes = cods.filter(c => !found.has(c));

    res.json({ validos, faltantes });
  } catch (err) {
    console.error('produccion.validateMateriales:', err);
    res.status(500).json({ error: 'Error validando materiales', detalle: err.message });
  }
};

// ============================================================================
// PUT /produccion/formulas
// ============================================================================
exports.replaceFormula = async (req, res) => {
  const codigoProducto = up(req.body?.codigo);
  const itemsRaw = Array.isArray(req.body?.items) ? req.body.items : [];

  if (!codigoProducto) return res.status(400).json({ error: 'Debe indicar CÓDIGO de producto' });
  if (!itemsRaw.length) return res.status(400).json({ error: 'Debe incluir items' });

  const items = itemsRaw
    .map(it => ({ cod: up(it.cod_articulo), cant: Number(it.cantidad) || 0 }))
    .filter(it => it.cod && it.cant > 0);

  if (!items.length) return res.status(400).json({ error: 'Items inválidos' });
  if (items.some(it => it.cod === codigoProducto)) {
    return res.status(400).json({ error: 'El producto no puede ser material de su propia fórmula' });
  }

  const agg = new Map();
  for (const it of items) agg.set(it.cod, (agg.get(it.cod) || 0) + it.cant);
  const itemsMerged = Array.from(agg.entries()).map(([cod, cant]) => ({ cod, cant }));

  let trans;
  try {
    await poolConnect;
    const pool = await getPool();
    trans = new sql.Transaction(pool);
    await trans.begin();
    const rq = new sql.Request(trans);

    const prod = await rq
      .input('c', sql.VarChar, codigoProducto)
      .query(`
        SELECT id_articulo, codigo, descripcion
        FROM articulos
        WHERE UPPER(LTRIM(RTRIM(codigo))) = @c
      `);
    if (!prod.recordset.length) {
      await trans.rollback();
      return res.status(400).json({ error: 'El código de PRODUCTO no existe' });
    }
    const productoId = prod.recordset[0].id_articulo;

    const inList = itemsMerged.map((_, i) => `@m${i}`).join(',');
    itemsMerged.forEach((it, i) => rq.input(`m${i}`, sql.VarChar, it.cod));
    const mats = await rq.query(`
      SELECT id_articulo, UPPER(LTRIM(RTRIM(codigo))) AS cod
      FROM articulos
      WHERE UPPER(LTRIM(RTRIM(codigo))) IN (${inList})
    `);
    const idByCode = new Map(mats.recordset.map(r => [r.cod, r.id_articulo]));
    const faltantes = itemsMerged.filter(it => !idByCode.has(it.cod)).map(it => it.cod);
    if (faltantes.length) {
      await trans.rollback();
      return res.status(400).json({ error: 'Materiales inexistentes', detalle: faltantes });
    }

    const existing = await rq
      .input('pid', sql.Int, productoId)
      .query(`SELECT id FROM produccion_formulas WHERE producto_id = @pid`);
    let formulaId;
    if (existing.recordset.length) {
      formulaId = existing.recordset[0].id;
      await rq.input('fidD', sql.Int, formulaId)
        .query(`DELETE FROM produccion_formula_detalles WHERE formula_id = @fidD`);
    } else {
      const insCab = await rq
        .input('pid2', sql.Int, productoId)
        .query(`
          INSERT INTO produccion_formulas (producto_id)
          OUTPUT INSERTED.id
          VALUES (@pid2)
        `);
      formulaId = insCab.recordset[0].id;
    }

    for (const it of itemsMerged) {
      const matId = idByCode.get(it.cod);
      await rq
        .input('fid', sql.Int, formulaId)
        .input('mid', sql.Int, matId)
        .input('qty', sql.Int, it.cant)
        .query(`
          INSERT INTO produccion_formula_detalles (formula_id, material_id, cantidad)
          VALUES (@fid, @mid, @qty)
        `);
    }

    await trans.commit();
    res.json({ message: 'Fórmula reemplazada correctamente', codigo: codigoProducto });
  } catch (err) {
    try { if (trans) await trans.rollback(); } catch {}
    console.error('produccion.replaceFormula:', err);
    res.status(500).json({ error: 'Error al reemplazar la fórmula', detalle: err.message });
  }
};

// ============================================================================
// DELETE /produccion/formulas/:codigo
// ============================================================================
exports.deleteFormulaByCodigo = async (req, res) => {
  const codigo = up(req.params.codigo);
  if (!codigo) return res.status(400).json({ error: 'Código inválido' });

  let trans;
  try {
    await poolConnect;
    const pool = await getPool();
    trans = new sql.Transaction(pool);
    await trans.begin();
    const rq = new sql.Request(trans);

    const prod = await rq
      .input('c', sql.VarChar, codigo)
      .query(`
        SELECT id_articulo
        FROM articulos
        WHERE UPPER(LTRIM(RTRIM(codigo))) = @c
      `);
    if (!prod.recordset.length) {
      await trans.rollback();
      return res.status(404).json({ error: 'Artículo no encontrado' });
    }
    const pid = prod.recordset[0].id_articulo;

    const f = await rq
      .input('pid', sql.Int, pid)
      .query(`SELECT id FROM produccion_formulas WHERE producto_id = @pid`);
    if (!f.recordset.length) {
      await trans.rollback();
      return res.status(404).json({ error: 'No existe fórmula para este producto' });
    }
    const fid = f.recordset[0].id;

    await rq.input('fidD', sql.Int, fid)
      .query(`DELETE FROM produccion_formula_detalles WHERE formula_id = @fidD`);
    await rq.input('fid', sql.Int, fid)
      .query(`DELETE FROM produccion_formulas WHERE id = @fid`);

    await trans.commit();
    res.json({ message: 'Fórmula eliminada', codigo });
  } catch (err) {
    try { if (trans) await trans.rollback(); } catch {}
    console.error('produccion.deleteFormulaByCodigo:', err);
    res.status(500).json({ error: 'Error al eliminar la fórmula', detalle: err.message });
  }
};

// ============================================================================
// PUT /produccion/formulas/:codigo  -> usa replaceFormula
// ============================================================================
exports.updateFormula = (req, res) => {
  req.body = { ...(req.body || {}), codigo: req.params.codigo };
  return exports.replaceFormula(req, res);
};