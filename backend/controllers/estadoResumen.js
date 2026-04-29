const { sql, poolConnect, getPool } = require("../db");

exports.getAll = async (req, res) => {
  try {
    await poolConnect;
    const pool = await getPool();

    const result = await pool.request().query(`
      SELECT *
      FROM estado_resumen
      ORDER BY estado, id DESC
    `);

    res.json({
      ok: true,
      rows: result.recordset,
    });
  } catch (err) {
    console.error("estadoResumen.getAll:", err);
    res.status(500).json({ error: "Error obteniendo estado resumen" });
  }
};

exports.create = async (req, res) => {
  try {
    await poolConnect;
    const pool = await getPool();

    const {
      estado,
      caratula,
      version,
      fase,
      mrp,
      fecha_mrp,
      prioridad,
      etapa,
      estado_detalle,
      referencia,
      color,
      carpinteria,
      vidrio,
      recepcion,
      premarcos,
      mosquitero,
      complejidad,
      inicio_prod,
      disponibilidad,
      comentario,
    } = req.body;

    if (!estado) {
      return res.status(400).json({ error: "El estado es obligatorio" });
    }

    const result = await pool.request()
      .input("estado", sql.VarChar, estado)
      .input("caratula", sql.VarChar, caratula || null)
      .input("version", sql.VarChar, version || null)
      .input("fase", sql.VarChar, fase || null)
      .input("mrp", sql.VarChar, mrp || null)
      .input("fecha_mrp", sql.Date, fecha_mrp || null)
      .input("prioridad", sql.VarChar, prioridad || null)
      .input("etapa", sql.VarChar, etapa || null)
      .input("estado_detalle", sql.VarChar, estado_detalle || null)
      .input("referencia", sql.VarChar, referencia || null)
      .input("color", sql.VarChar, color || null)
      .input("carpinteria", sql.VarChar, carpinteria || null)
      .input("vidrio", sql.VarChar, vidrio || null)
      .input("recepcion", sql.VarChar, recepcion || null)
      .input("premarcos", sql.VarChar, premarcos || null)
      .input("mosquitero", sql.VarChar, mosquitero || null)
      .input("complejidad", sql.VarChar, complejidad || null)
      .input("inicio_prod", sql.Date, inicio_prod || null)
      .input("disponibilidad", sql.VarChar, disponibilidad || null)
      .input("comentario", sql.VarChar, comentario || null)
      .query(`
        INSERT INTO estado_resumen (
          estado, caratula, version, fase, mrp, fecha_mrp, prioridad, etapa,
          estado_detalle, referencia, color, carpinteria, vidrio, recepcion,
          premarcos, mosquitero, complejidad, inicio_prod, disponibilidad, comentario
        )
        OUTPUT INSERTED.*
        VALUES (
          @estado, @caratula, @version, @fase, @mrp, @fecha_mrp, @prioridad, @etapa,
          @estado_detalle, @referencia, @color, @carpinteria, @vidrio, @recepcion,
          @premarcos, @mosquitero, @complejidad, @inicio_prod, @disponibilidad, @comentario
        )
      `);

    res.status(201).json({
      ok: true,
      row: result.recordset[0],
    });
  } catch (err) {
    console.error("estadoResumen.create:", err);
    res.status(500).json({ error: "Error creando registro de estado resumen" });
  }
};