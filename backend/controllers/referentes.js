const { sql, poolConnect, getPool } = require("../db");

exports.getAll = async (_req, res) => {
  try {
    await poolConnect;
    const pool = await getPool();

    const r = await pool.request().query(`
      SELECT id_referente, nombre, activo
      FROM dbo.referentes
      ORDER BY activo DESC, nombre ASC
    `);

    res.json(r.recordset || []);
  } catch (err) {
    console.error("referentes.getAll:", err);
    res.status(500).json({
      error: "Error al listar referentes",
      detalle: err.message,
    });
  }
};

exports.create = async (req, res) => {
  try {
    const nombre = String(req.body?.nombre ?? "").trim();

    if (!nombre) {
      return res.status(400).json({ error: "Nombre obligatorio" });
    }

    await poolConnect;
    const pool = await getPool();

    const r = await pool
      .request()
      .input("n", sql.VarChar, nombre)
      .query(`
        INSERT INTO dbo.referentes (nombre, activo)
        VALUES (@n, 1);

        SELECT SCOPE_IDENTITY() AS id_referente;
      `);

    res.status(201).json({
      ok: true,
      id_referente: Number(r.recordset[0].id_referente),
    });
  } catch (err) {
    console.error("referentes.create:", err);
    res.status(500).json({
      error: "Error al crear referente",
      detalle: err.message,
    });
  }
};

exports.update = async (req, res) => {
  try {
    const id = Number(req.params.id);

    if (!Number.isInteger(id)) {
      return res.status(400).json({ error: "ID inválido" });
    }

    const nombre =
      req.body?.nombre != null ? String(req.body.nombre).trim() : null;

    const activo = req.body?.activo;

    if (nombre != null && !nombre) {
      return res.status(400).json({ error: "Nombre inválido" });
    }

    await poolConnect;
    const pool = await getPool();

    const rq = pool.request().input("id", sql.Int, id);

    if (nombre != null) rq.input("n", sql.VarChar, nombre);
    if (activo != null) rq.input("a", sql.Bit, activo ? 1 : 0);

    const r = await rq.query(`
      UPDATE dbo.referentes
      SET
        nombre = COALESCE(@n, nombre),
        activo = COALESCE(@a, activo)
      WHERE id_referente = @id;

      SELECT @@ROWCOUNT AS affected;
    `);

    if (Number(r.recordset[0].affected) !== 1) {
      return res.status(404).json({ error: "Referente no encontrado" });
    }

    res.json({ ok: true });
  } catch (err) {
    console.error("referentes.update:", err);
    res.status(500).json({
      error: "Error al actualizar referente",
      detalle: err.message,
    });
  }
};

exports.delete = async (req, res) => {
  try {
    const id = Number(req.params.id);

    if (!Number.isInteger(id)) {
      return res.status(400).json({ error: "ID inválido" });
    }

    await poolConnect;
    const pool = await getPool();

    const usedAjustes = await pool.request().input("id", sql.Int, id).query(`
      SELECT TOP 1 1 AS used
      FROM dbo.ajustes
      WHERE id_referente = @id
    `);

    if (usedAjustes.recordset.length) {
      return res.status(400).json({
        error:
          "No se puede borrar: el referente ya fue usado en ajustes. Desactiválo.",
      });
    }

    const usedTransferencias = await pool.request().input("id", sql.Int, id).query(`
      SELECT TOP 1 1 AS used
      FROM dbo.transferencias
      WHERE id_referente = @id
    `);

    if (usedTransferencias.recordset.length) {
      return res.status(400).json({
        error:
          "No se puede borrar: el referente ya fue usado en transferencias. Desactiválo.",
      });
    }

    const r = await pool.request().input("id", sql.Int, id).query(`
      DELETE FROM dbo.referentes
      WHERE id_referente = @id;

      SELECT @@ROWCOUNT AS affected;
    `);

    if (Number(r.recordset[0].affected) !== 1) {
      return res.status(404).json({ error: "Referente no encontrado" });
    }

    res.json({ ok: true });
  } catch (err) {
    console.error("referentes.delete:", err);
    res.status(500).json({
      error: "Error al borrar referente",
      detalle: err.message,
    });
  }
};