const { sql, poolConnect, getPool } = require('../db');

// --- Obtener todos los usuarios con cantidad de utilidades ---
exports.getAllUsersWithUtilidades = async (_req, res) => {
  try {
    await poolConnect;
    const pool = await getPool();

    const users = await pool.request().query(`
      SELECT u.id_usuario, u.username, u.nombre,
             COUNT(uu.utilidad) AS utilidades
      FROM usuarios u
      LEFT JOIN usuario_utilidades uu ON uu.id_usuario = u.id_usuario
      GROUP BY u.id_usuario, u.username, u.nombre
      ORDER BY u.username
    `);

    res.json(users.recordset);
  } catch (err) {
    console.error('utilidades.getAllUsersWithUtilidades:', err);
    res.status(500).json({ error: 'Error al listar usuarios' });
  }
};

// --- Obtener utilidades de un usuario ---
exports.getUtilidadesByUser = async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ error: 'ID inválido' });

    await poolConnect;
    const pool = await getPool();

    const data = await pool.request()
      .input('id', sql.Int, id)
      .query(`SELECT utilidad FROM usuario_utilidades WHERE id_usuario = @id`);

    res.json(data.recordset.map(r => r.utilidad));
  } catch (err) {
    console.error('utilidades.getUtilidadesByUser:', err);
    res.status(500).json({ error: 'Error al obtener utilidades del usuario' });
  }
};

// --- Actualizar utilidades para un usuario ---
exports.updateUtilidadesForUser = async (req, res) => {
  let trans;
  try {
    const id = Number(req.params.id);
    const { utilidades } = req.body;
    if (!Array.isArray(utilidades)) return res.status(400).json({ error: 'Formato inválido' });

    await poolConnect;
    const pool = await getPool();
    trans = new sql.Transaction(pool);
    await trans.begin();

    const rqDel = new sql.Request(trans);
    await rqDel.input('id', sql.Int, id).query(`DELETE FROM usuario_utilidades WHERE id_usuario = @id`);

    for (const u of utilidades) {
      const rqIns = new sql.Request(trans);
      await rqIns
        .input('id', sql.Int, id)
        .input('ut', sql.VarChar, u)
        .query(`INSERT INTO usuario_utilidades (id_usuario, utilidad) VALUES (@id, @ut)`);
    }

    await trans.commit();

    // 🔹 Consulta rápida del nuevo total
    const totalRes = await pool.request()
      .input('id', sql.Int, id)
      .query(`SELECT COUNT(*) AS total FROM usuario_utilidades WHERE id_usuario = @id`);

    const total = totalRes.recordset[0].total;

    res.json({
      message: 'Utilidades actualizadas correctamente',
      utilidades,
      total
    });
  } catch (err) {
    try { if (trans) await trans.rollback(); } catch {}
    console.error('utilidades.updateUtilidadesForUser:', err);
    res.status(500).json({ error: 'Error al actualizar utilidades' });
  }
};
