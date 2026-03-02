// backend/controllers/depositos.js
const { sql, poolConnect, getPool } = require('../db');

const toDb = (v) => (v == null || String(v).trim() === '' ? null : String(v).trim());

exports.getAll = async (req, res) => {
  try {
    await poolConnect;
    const pool = await getPool();
    const r = await pool.request().query(`
      SELECT id_deposito, nombre
      FROM dbo.depositos
      ORDER BY nombre
    `);
    res.json(r.recordset);
  } catch (err) {
    console.error('depositos.getAll error:', err);
    res.status(500).json({ error: 'Error al obtener depósitos', detalle: err.message });
  }
};

exports.getById = async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(400).json({ error: 'ID inválido' });

    await poolConnect;
    const pool = await getPool();
    const r = await pool.request()
      .input('id', sql.Int, id)
      .query(`
        SELECT id_deposito, nombre
        FROM dbo.depositos
        WHERE id_deposito = @id
      `);

    if (!r.recordset.length) return res.status(404).json({ error: 'Depósito no encontrado' });
    res.json(r.recordset[0]);
  } catch (err) {
    console.error('depositos.getById error:', err);
    res.status(500).json({ error: 'Error al obtener depósito', detalle: err.message });
  }
};

exports.create = async (req, res) => {
  try {
    let { nombre } = req.body || {};
    nombre = toDb(nombre);
    if (!nombre) return res.status(400).json({ error: 'Debe indicar nombre' });

    await poolConnect;
    const pool = await getPool();

    const dup = await pool.request()
      .input('n', sql.VarChar, nombre.toUpperCase())
      .query(`SELECT 1 FROM dbo.depositos WHERE UPPER(LTRIM(RTRIM(nombre))) = @n`);

    if (dup.recordset.length) return res.status(409).json({ error: 'Ya existe un depósito con ese nombre' });

    const ins = await pool.request()
      .input('nombre', sql.VarChar, nombre)
      .query(`
        INSERT INTO dbo.depositos (nombre)
        OUTPUT INSERTED.id_deposito, INSERTED.nombre
        VALUES (@nombre)
      `);

    res.status(201).json(ins.recordset[0]);
  } catch (err) {
    console.error('depositos.create error:', err);
    res.status(500).json({ error: 'Error al crear depósito', detalle: err.message });
  }
};

exports.update = async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(400).json({ error: 'ID inválido' });

    let { nombre } = req.body || {};
    nombre = toDb(nombre);
    if (!nombre) return res.status(400).json({ error: 'Debe indicar nombre' });

    await poolConnect;
    const pool = await getPool();

    const r = await pool.request()
      .input('id', sql.Int, id)
      .input('nombre', sql.VarChar, nombre)
      .query(`UPDATE dbo.depositos SET nombre = @nombre WHERE id_deposito = @id`);

    if (r.rowsAffected?.[0] === 0) return res.status(404).json({ error: 'Depósito no encontrado' });
    res.json({ message: 'Depósito actualizado' });
  } catch (err) {
    console.error('depositos.update error:', err);
    res.status(500).json({ error: 'Error al actualizar depósito', detalle: err.message });
  }
};

exports.remove = async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(400).json({ error: 'ID inválido' });

    await poolConnect;
    const pool = await getPool();

    const r = await pool.request()
      .input('id', sql.Int, id)
      .query(`DELETE FROM dbo.depositos WHERE id_deposito = @id`);

    if (r.rowsAffected?.[0] === 0) return res.status(404).json({ error: 'Depósito no encontrado' });
    res.json({ message: 'Depósito eliminado' });
  } catch (err) {
    console.error('depositos.remove error:', err);
    res.status(500).json({ error: 'Error al eliminar depósito', detalle: err.message });
  }
};
