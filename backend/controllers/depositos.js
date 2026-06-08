// backend/controllers/depositos.js
const { sql, poolConnect, getPool } = require("../db");

const toDb = (v) =>
  v == null || String(v).trim() === "" ? null : String(v).trim();

const norm = (v) => String(v ?? "").trim().toUpperCase();

function asInt(v) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : NaN;
}

exports.getAll = async (_req, res) => {
  try {
    await poolConnect;
    const pool = await getPool();

    const r = await pool.request().query(`
      SET NOCOUNT ON;

      SELECT id_deposito, nombre
      FROM dbo.depositos
      ORDER BY nombre;
    `);

    res.json(r.recordset || []);
  } catch (err) {
    console.error("depositos.getAll error:", err);
    res.status(500).json({
      error: "Error al obtener depósitos",
      detalle: err.message,
    });
  }
};

exports.getById = async (req, res) => {
  try {
    const id = asInt(req.params.id);

    if (!Number.isFinite(id)) {
      return res.status(400).json({ error: "ID inválido" });
    }

    await poolConnect;
    const pool = await getPool();

    const r = await pool.request()
      .input("id", sql.Int, id)
      .query(`
        SET NOCOUNT ON;

        SELECT id_deposito, nombre
        FROM dbo.depositos
        WHERE id_deposito = @id;
      `);

    if (!r.recordset.length) {
      return res.status(404).json({ error: "Depósito no encontrado" });
    }

    res.json(r.recordset[0]);
  } catch (err) {
    console.error("depositos.getById error:", err);
    res.status(500).json({
      error: "Error al obtener depósito",
      detalle: err.message,
    });
  }
};

exports.create = async (req, res) => {
  try {
    let { nombre } = req.body || {};

    nombre = toDb(nombre);

    if (!nombre) {
      return res.status(400).json({ error: "Debe indicar nombre" });
    }

    await poolConnect;
    const pool = await getPool();

    const dup = await pool.request()
      .input("n", sql.VarChar(200), norm(nombre))
      .query(`
        SET NOCOUNT ON;

        SELECT TOP 1 id_deposito
        FROM dbo.depositos
        WHERE UPPER(LTRIM(RTRIM(nombre))) = @n;
      `);

    if (dup.recordset.length) {
      return res.status(409).json({
        error: "Ya existe un depósito con ese nombre",
      });
    }

    /*
      IMPORTANTE:
      No usamos OUTPUT INSERTED porque dbo.depositos tiene triggers activos.
      SQL Server no permite OUTPUT sin INTO cuando hay triggers habilitados.
    */

    const ins = await pool.request()
      .input("nombre", sql.VarChar(200), nombre)
      .query(`
        SET NOCOUNT ON;

        DECLARE @NuevoId INT;

        INSERT INTO dbo.depositos (nombre)
        VALUES (@nombre);

        SET @NuevoId = CONVERT(INT, SCOPE_IDENTITY());

        SELECT id_deposito, nombre
        FROM dbo.depositos
        WHERE id_deposito = @NuevoId;
      `);

    if (!ins.recordset.length) {
      return res.status(500).json({
        error: "El depósito fue creado, pero no se pudo recuperar el registro insertado",
      });
    }

    res.status(201).json(ins.recordset[0]);
  } catch (err) {
    console.error("depositos.create error:", err);
    res.status(500).json({
      error: "Error al crear depósito",
      detalle: err.message,
    });
  }
};

exports.update = async (req, res) => {
  try {
    const id = asInt(req.params.id);

    if (!Number.isFinite(id)) {
      return res.status(400).json({ error: "ID inválido" });
    }

    let { nombre } = req.body || {};

    nombre = toDb(nombre);

    if (!nombre) {
      return res.status(400).json({ error: "Debe indicar nombre" });
    }

    await poolConnect;
    const pool = await getPool();

    const cur = await pool.request()
      .input("id", sql.Int, id)
      .query(`
        SET NOCOUNT ON;

        SELECT id_deposito, nombre
        FROM dbo.depositos
        WHERE id_deposito = @id;
      `);

    if (!cur.recordset.length) {
      return res.status(404).json({ error: "Depósito no encontrado" });
    }

    const dup = await pool.request()
      .input("n", sql.VarChar(200), norm(nombre))
      .input("id", sql.Int, id)
      .query(`
        SET NOCOUNT ON;

        SELECT TOP 1 id_deposito
        FROM dbo.depositos
        WHERE UPPER(LTRIM(RTRIM(nombre))) = @n
          AND id_deposito <> @id;
      `);

    if (dup.recordset.length) {
      return res.status(409).json({
        error: "Ya existe un depósito con ese nombre",
      });
    }

    await pool.request()
      .input("id", sql.Int, id)
      .input("nombre", sql.VarChar(200), nombre)
      .query(`
        SET NOCOUNT ON;

        UPDATE dbo.depositos
        SET nombre = @nombre
        WHERE id_deposito = @id;
      `);

    const updated = await pool.request()
      .input("id", sql.Int, id)
      .query(`
        SET NOCOUNT ON;

        SELECT id_deposito, nombre
        FROM dbo.depositos
        WHERE id_deposito = @id;
      `);

    res.json(updated.recordset[0]);
  } catch (err) {
    console.error("depositos.update error:", err);
    res.status(500).json({
      error: "Error al actualizar depósito",
      detalle: err.message,
    });
  }
};

/**
 * DELETE /depositos/:id
 * BORRADO REAL
 * - No borra tablas, solo filas relacionadas.
 * - Usa el stored procedure dbo.sp_borrar_deposito.
 */
exports.remove = async (req, res) => {
  const id = Number(req.params.id);

  if (!Number.isInteger(id)) {
    return res.status(400).json({ error: "ID inválido" });
  }

  try {
    await poolConnect;
    const pool = await getPool();

    await pool.request()
      .input("id", sql.Int, id)
      .query(`
        SET NOCOUNT ON;

        EXEC dbo.sp_borrar_deposito @id_deposito = @id;
      `);

    return res.json({ ok: true });
  } catch (err) {
    console.error("depositos.remove error:", err);
    return res.status(500).json({
      error: "Error al eliminar depósito",
      detalle: err.message,
    });
  }
};