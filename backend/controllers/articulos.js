// controllers/articulos.js
const { sql, poolConnect, getPool } = require("../db");

// Helper: normaliza strings vacíos a NULL
const toDb = (v) =>
  v === undefined || v === null || String(v).trim() === "" ? null : String(v).trim();

// -----------------------------------------------------------------------------
// LISTAR TODOS
// -----------------------------------------------------------------------------
exports.getAllArticulos = async (req, res) => {
  try {
    await poolConnect;
    const pool = await getPool();

    const result = await pool.request().query(`
      SET NOCOUNT ON;

      SELECT 
        id_articulo,
        codigo,
        descripcion,
        folio,
        proveedor,
        ubicacion,
        cantidad,
        punto_pedido,
        tipo
      FROM articulos
      ORDER BY codigo
    `);

    res.json(result.recordset);
  } catch (err) {
    console.error("Error en getAllArticulos:", err);
    res.status(500).json({ error: "Error al obtener artículos", detalle: err.message });
  }
};

// -----------------------------------------------------------------------------
// OBTENER POR ID
// -----------------------------------------------------------------------------
exports.getArticuloById = async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      return res.status(400).json({ error: "ID inválido" });
    }

    await poolConnect;
    const pool = await getPool();

    const result = await pool
      .request()
      .input("id", sql.Int, id)
      .query(`
        SET NOCOUNT ON;

        SELECT 
          id_articulo,
          codigo,
          descripcion,
          folio,
          proveedor,
          ubicacion,
          cantidad,
          punto_pedido,
          tipo
        FROM articulos
        WHERE id_articulo = @id
      `);

    if (!result.recordset.length) {
      return res.status(404).json({ message: "Artículo no encontrado" });
    }

    res.json(result.recordset[0]);
  } catch (err) {
    console.error("Error en getArticuloById:", err);
    res.status(500).json({ error: "Error al obtener artículo por ID", detalle: err.message });
  }
};

// -----------------------------------------------------------------------------
// OBTENER POR CÓDIGO
// -----------------------------------------------------------------------------
exports.getArticuloByCodigo = async (req, res) => {
  try {
    const cod = String(req.params.cod || "").trim().toUpperCase();
    if (!cod) {
      return res.status(400).json({ error: "Debe indicar un código de artículo" });
    }

    await poolConnect;
    const pool = await getPool();

    const result = await pool
      .request()
      .input("cod", sql.VarChar, cod)
      .query(`
        SET NOCOUNT ON;

        SELECT 
          id_articulo,
          codigo,
          descripcion,
          folio,
          proveedor,
          ubicacion,
          cantidad,
          punto_pedido,
          tipo
        FROM articulos
        WHERE UPPER(LTRIM(RTRIM(codigo))) = @cod
      `);

    if (!result.recordset.length) {
      return res.json({
        id_articulo: null,
        codigo: cod,
        descripcion: null,
        folio: null,
        proveedor: null,
        ubicacion: null,
        cantidad: null,
        punto_pedido: null,
        tipo: null
      });
    }

    res.json(result.recordset[0]);
  } catch (err) {
    console.error("Error en getArticuloByCodigo:", err);
    res.status(500).json({ error: "Error al buscar artículo por código", detalle: err.message });
  }
};

// -----------------------------------------------------------------------------
// CREAR
// -----------------------------------------------------------------------------
exports.createArticulo = async (req, res) => {
  try {
    let {
      codigo,
      descripcion,
      folio,
      proveedor,
      ubicacion,
      cantidad,
      punto_pedido,
      tipo
    } = req.body || {};

    if (!codigo || !descripcion) {
      return res.status(400).json({ error: "Debe indicar código y descripción" });
    }

    codigo = String(codigo).trim().toUpperCase();
    descripcion = toDb(descripcion);
    folio = toDb(folio);
    proveedor = toDb(proveedor);
    ubicacion = toDb(ubicacion);
    cantidad = cantidad ?? 0;
    punto_pedido = toDb(punto_pedido);
    tipo = toDb(tipo); // ✅ FIX (antes pisabas proveedor)

    await poolConnect;
    const pool = await getPool();

    const dup = await pool
      .request()
      .input("cod", sql.VarChar, codigo)
      .query(`
        SET NOCOUNT ON;

        SELECT TOP 1 1
        FROM articulos
        WHERE UPPER(LTRIM(RTRIM(codigo))) = @cod
      `);

    if (dup.recordset.length) {
      return res.status(409).json({ error: "El código ya existe" });
    }

    const insert = await pool
      .request()
      .input("codigo", sql.VarChar, codigo)
      .input("descripcion", sql.VarChar, descripcion)
      .input("folio", sql.VarChar, folio)
      .input("proveedor", sql.VarChar, proveedor)
      .input("ubicacion", sql.VarChar, ubicacion)
      .input("cantidad", sql.Int, Number(cantidad) || 0)
      .input("punto_pedido", sql.VarChar, punto_pedido)
      .input("tipo", sql.VarChar, tipo)
      .query(`
        SET NOCOUNT ON;

        INSERT INTO articulos (
          codigo,
          descripcion,
          folio,
          proveedor,
          ubicacion,
          cantidad,
          punto_pedido,
          tipo
        )
        OUTPUT INSERTED.id_articulo
        VALUES (
          @codigo,
          @descripcion,
          @folio,
          @proveedor,
          @ubicacion,
          @cantidad,
          @punto_pedido,
          @tipo
        )
      `);

    res.status(201).json({
      message: "Artículo creado",
      id_articulo: insert.recordset[0].id_articulo
    });
  } catch (err) {
    console.error("Error en createArticulo:", err);
    res.status(500).json({ error: "Error al crear artículo", detalle: err.message });
  }
};

// -----------------------------------------------------------------------------
// ACTUALIZAR
// -----------------------------------------------------------------------------
exports.updateArticulo = async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      return res.status(400).json({ error: "ID inválido" });
    }

    let {
      codigo,
      descripcion,
      folio,
      proveedor,
      ubicacion,
      cantidad,
      punto_pedido,
      tipo
    } = req.body || {};

    if (!codigo || !descripcion) {
      return res.status(400).json({ error: "Debe indicar código y descripción" });
    }

    codigo = String(codigo).trim().toUpperCase();
    descripcion = toDb(descripcion);
    folio = toDb(folio);
    proveedor = toDb(proveedor);
    ubicacion = toDb(ubicacion);
    cantidad = cantidad ?? 0;
    punto_pedido = toDb(punto_pedido);
    tipo = toDb(tipo);

    await poolConnect;
    const pool = await getPool();

    const result = await pool
      .request()
      .input("id", sql.Int, id)
      .input("codigo", sql.VarChar, codigo)
      .input("descripcion", sql.VarChar, descripcion)
      .input("folio", sql.VarChar, folio)
      .input("proveedor", sql.VarChar, proveedor)
      .input("ubicacion", sql.VarChar, ubicacion)
      .input("cantidad", sql.Int, Number(cantidad) || 0)
      .input("punto_pedido", sql.VarChar, punto_pedido)
      .input("tipo", sql.VarChar, tipo)
      .query(`
        SET NOCOUNT ON;

        UPDATE articulos
           SET codigo = @codigo,
               descripcion = @descripcion,
               folio = @folio,
               proveedor = @proveedor,
               ubicacion = @ubicacion,
               cantidad = @cantidad,
               punto_pedido = @punto_pedido,
               tipo = @tipo
         WHERE id_articulo = @id
      `);

    if (result.rowsAffected[0] === 0) {
      return res.status(404).json({ message: "Artículo no encontrado" });
    }

    res.json({ message: "Artículo actualizado" });
  } catch (err) {
    console.error("Error en updateArticulo:", err);
    res.status(500).json({ error: "Error al actualizar artículo", detalle: err.message });
  }
};

// -----------------------------------------------------------------------------
// ELIMINAR
// -----------------------------------------------------------------------------
exports.deleteArticulo = async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      return res.status(400).json({ error: "ID inválido" });
    }

    await poolConnect;
    const pool = await getPool();

    const result = await pool
      .request()
      .input("id", sql.Int, id)
      .query("DELETE FROM articulos WHERE id_articulo = @id");

    if (result.rowsAffected[0] === 0) {
      return res.status(404).json({ message: "Artículo no encontrado" });
    }

    res.json({ message: "Artículo eliminado" });
  } catch (err) {
    console.error("Error en deleteArticulo:", err);
    res.status(500).json({ error: "Error al eliminar artículo", detalle: err.message });
  }
};

// -----------------------------------------------------------------------------
// CLASIFICACIONES (NO SE TOCA)
// -----------------------------------------------------------------------------
exports.getClasificacionesArticulo = async (req, res) => {
  try {
    const id = Number(req.params.id);
    await poolConnect;
    const pool = await getPool();

    const result = await pool
      .request()
      .input("id", sql.Int, id)
      .query(`
        SET NOCOUNT ON;

        SELECT c.id_clasificacion, c.nombre, c.es_obligatoria,
               ac.valor
        FROM clasificaciones c
        LEFT JOIN articulo_clasificaciones ac
          ON ac.id_clasificacion = c.id_clasificacion
         AND ac.id_articulo = @id
        WHERE c.activa = 1
        ORDER BY c.nombre
      `);

    res.json(result.recordset);
  } catch (err) {
    console.error("getClasificacionesArticulo:", err);
    res.status(500).json({ error: "Error al obtener clasificaciones del artículo" });
  }
};

exports.setClasificacionesArticulo = async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { clasificaciones } = req.body;

    await poolConnect;
    const pool = await getPool();

    await pool
      .request()
      .input("id", sql.Int, id)
      .query("DELETE FROM articulo_clasificaciones WHERE id_articulo = @id");

    for (const c of clasificaciones) {
      await pool
        .request()
        .input("id_articulo", sql.Int, id)
        .input("id_clasificacion", sql.Int, c.id_clasificacion)
        .input("valor", sql.VarChar, c.valor || null)
        .query(`
          INSERT INTO articulo_clasificaciones (id_articulo, id_clasificacion, valor)
          VALUES (@id_articulo, @id_clasificacion, @valor)
        `);
    }

    res.json({ message: "Clasificaciones guardadas" });
  } catch (err) {
    console.error("setClasificacionesArticulo:", err);
    res.status(500).json({ error: "Error al guardar clasificaciones" });
  }
};

// DELETE TOTAL REAL (stock + clasificaciones + articulo) + TRANSACCIÓN
exports.deleteArticuloFull = async (req, res) => {
  let tx;
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      return res.status(400).json({ error: "ID inválido" });
    }

    await poolConnect;
    const pool = await getPool();

    tx = new sql.Transaction(pool);
    await tx.begin();

    const rq = new sql.Request(tx);
    rq.input("id", sql.Int, id);

    // 0) (Opcional pero recomendable) validar que exista el artículo antes
    const ex = await rq.query(`
      SELECT TOP 1 1 AS existe
      FROM dbo.articulos
      WHERE id_articulo = @id
    `);
    if (!ex.recordset.length) {
      await tx.rollback();
      return res.status(404).json({ error: "Artículo no encontrado" });
    }

    // 1) borrar dependencias: STOCK (FK_stock_articulo)
    await rq.query(`
      DELETE FROM dbo.stock
      WHERE id_articulo = @id
    `);

    // 2) borrar dependencias: clasificaciones del artículo
    await rq.query(`
      DELETE FROM dbo.articulo_clasificaciones
      WHERE id_articulo = @id
    `);

    // 3) borrar el artículo
    await rq.query(`
      DELETE FROM dbo.articulos
      WHERE id_articulo = @id
    `);

    await tx.commit();
    return res.json({ message: "Artículo eliminado completamente (incluye stock y clasificaciones)" });

  } catch (err) {
    if (tx) {
      try { await tx.rollback(); } catch (_) {}
    }
    console.error("deleteArticuloFull:", err);
    return res.status(500).json({
      error: "Error al eliminar completamente",
      detalle: err.message
    });
  }
};


