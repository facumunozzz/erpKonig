const { sql, poolConnect, getPool } = require("../db");

exports.getAll = async (_req, res) => {
  try {
    await poolConnect;
    const pool = await getPool();
    const result = await pool.request().query(`
      SELECT id_clasificacion, nombre, es_obligatoria, activa
      FROM clasificaciones
      ORDER BY nombre
    `);
    res.json(result.recordset);
  } catch (err) {
    console.error("clasificaciones.getAll:", err);
    res.status(500).json({ error: "Error al listar clasificaciones" });
  }
};

exports.getObligatorias = async (_req, res) => {
  try {
    await poolConnect;
    const pool = await getPool();
    const result = await pool.request().query(`
      SELECT id_clasificacion, nombre
      FROM clasificaciones
      WHERE es_obligatoria = 1 AND activa = 1
      ORDER BY nombre
    `);
    res.json(result.recordset);
  } catch (err) {
    console.error("clasificaciones.getObligatorias:", err);
    res.status(500).json({ error: "Error al obtener clasificacioens obligatorias" });
  }
};

exports.create = async (req, res) => {
  try {
    const nombre = req.body?.nombre?.trim();
    if (!nombre) return res.status(400).json({ error: "Nombre requerido" });

    await poolConnect;
    const pool = await getPool();

    // 1) crear clasificación
    const result = await pool
      .request()
      .input("nombre", sql.VarChar, nombre)
      .query(`
        INSERT INTO clasificaciones (nombre, es_obligatoria, activa)
        OUTPUT INSERTED.*
        VALUES (@nombre, 0, 1)
      `);

    // 2) NO tocamos articulos existentes
    // solo dejamos la clasificación lista para usarse

    res.status(201).json(result.recordset[0]);

  } catch (err) {
    console.error("clasificaciones.create:", err);
    res.status(500).json({ error: "Error al crear clasificación" });
  }
};


exports.updateFlag = async (req, res) => {
  try {
    const id = Number(req.params.id);
    const field = req.body?.field;
    if (!["es_obligatoria", "activa"].includes(field))
      return res.status(400).json({ error: "Campo inválido" });

    await poolConnect;
    const pool = await getPool();
    await pool
      .request()
      .input("id", sql.Int, id)
      .query(`UPDATE clasificaciones SET ${field} = 1 - ${field} WHERE id_clasificacion = @id`);
    res.json({ message: "Actualizado" });
  } catch (err) {
    console.error("clasificaciones.updateFlag:", err);
    res.status(500).json({ error: "Error al actualizar clasificación" });
  }
};

// controllers/clasificaciones.js
exports.remove = async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ error: "ID inválido" });

    await poolConnect;
    const pool = await getPool();

    // 1) obtener nombre de la clasificación para chequear uso en articulos.tipo
    const rNombre = await pool.request()
      .input("id", sql.Int, id)
      .query(`SELECT nombre FROM clasificaciones WHERE id_clasificacion = @id`);

    if (!rNombre.recordset.length) {
      return res.status(404).json({ error: "Clasificación no encontrada" });
    }

    const nombre = rNombre.recordset[0].nombre;

    // 2) chequear si está en uso en articulos.tipo
    const rUsoArt = await pool.request()
      .input("nombre", sql.VarChar, nombre)
      .query(`
        SELECT COUNT(*) AS cnt
        FROM articulos
        WHERE LTRIM(RTRIM(tipo)) = LTRIM(RTRIM(@nombre))
      `);

    const usadosEnArticulos = Number(rUsoArt.recordset?.[0]?.cnt ?? 0);

    if (usadosEnArticulos > 0) {
      return res.status(409).json({
        error: `No se puede eliminar: la clasificación está en uso por ${usadosEnArticulos} artículo(s).`,
      });
    }

    // 3) (opcional pero recomendado) chequear uso en tabla puente articulo_clasificaciones
    // por si más adelante la usás formalmente
    const rUsoPuente = await pool.request()
      .input("id", sql.Int, id)
      .query(`
        SELECT COUNT(*) AS cnt
        FROM articulo_clasificaciones
        WHERE id_clasificacion = @id
      `);

    const usadosEnPuente = Number(rUsoPuente.recordset?.[0]?.cnt ?? 0);
    if (usadosEnPuente > 0) {
      return res.status(409).json({
        error: `No se puede eliminar: hay ${usadosEnPuente} registro(s) asociados en articulo_clasificaciones.`,
      });
    }

    // 4) borrar
    await pool.request()
      .input("id", sql.Int, id)
      .query("DELETE FROM clasificaciones WHERE id_clasificacion = @id");

    res.json({ message: "Eliminado correctamente" });

  } catch (err) {
    console.error("clasificaciones.remove:", err);
    res.status(500).json({ error: "Error al eliminar clasificación" });
  }
};

exports.getActivas = async (_req, res) => {
  try {
    await poolConnect;
    const pool = await getPool();
    const result = await pool.request().query(`
      SELECT id_clasificacion, nombre, es_obligatoria, activa
      FROM clasificaciones
      WHERE activa = 1
      ORDER BY nombre
    `);
    res.json(result.recordset);
  } catch (err) {
    console.error("clasificaciones.getActivas:", err);
    res.status(500).json({ error: "Error al obtener clasificaciones activas" });
  }
};

// ✅ NUEVO: sincroniza clasificaciones desde dbo.articulos.tipo
exports.syncFromArticulos = async (_req, res) => {
  try {
    await poolConnect;
    const pool = await getPool();

    // Inserta en clasificaciones todos los tipos distintos de articulos.tipo
    // que todavía no existan en clasificaciones.nombre (trim + no vacíos)
    const rs = await pool.request().query(`
      INSERT INTO clasificaciones (nombre, es_obligatoria, activa)
      SELECT DISTINCT
        LTRIM(RTRIM(a.tipo)) AS nombre,
        0 AS es_obligatoria,
        1 AS activa
      FROM articulos a
      WHERE a.tipo IS NOT NULL
        AND LTRIM(RTRIM(a.tipo)) <> ''
        AND NOT EXISTS (
          SELECT 1
          FROM clasificaciones c
          WHERE c.nombre = LTRIM(RTRIM(a.tipo))
        );

      SELECT @@ROWCOUNT AS inserted;
    `);

    // en mssql, recordset[0] devuelve el SELECT final
    res.json({ ok: true, inserted: rs.recordset?.[0]?.inserted ?? 0 });
  } catch (err) {
    console.error("clasificaciones.syncFromArticulos:", err);
    res.status(500).json({ error: "Error al sincronizar clasificaciones desde artículos" });
  }
};

// 🔹 Sincroniza encabezados (columnas) de articulos como clasificaciones
exports.syncFromArticulosSchema = async (_req, res) => {
  try {
    await poolConnect;
    const pool = await getPool();

    const rs = await pool.request().query(`
      INSERT INTO clasificaciones (nombre, es_obligatoria, activa)
      SELECT 
        c.COLUMN_NAME,
        0 AS es_obligatoria,
        1 AS activa
      FROM INFORMATION_SCHEMA.COLUMNS c
      WHERE c.TABLE_NAME = 'articulos'
        AND c.COLUMN_NAME <> 'id_articulo'
        AND NOT EXISTS (
          SELECT 1
          FROM clasificaciones cl
          WHERE cl.nombre = c.COLUMN_NAME
        );

      SELECT @@ROWCOUNT AS inserted;
    `);

    res.json({
      ok: true,
      inserted: rs.recordset?.[0]?.inserted ?? 0
    });

  } catch (err) {
    console.error("clasificaciones.syncFromArticulosSchema:", err);
    res.status(500).json({
      error: "Error al sincronizar encabezados de artículos"
    });
  }
};


