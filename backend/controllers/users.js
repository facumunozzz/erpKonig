const bcrypt = require('bcryptjs');
const { sql, poolConnect, getPool } = require('../db');

const toDb = v => (v == null || String(v).trim() === '' ? null : String(v).trim());
const up = v => (toDb(v)?.toUpperCase() ?? null);

/**
 * ========================================================
 * POST /users
 * Crea un nuevo usuario (solo ADMIN)
 * ========================================================
 */
exports.create = async (req, res) => {
  let trans;
  try {
    const username = up(req.body?.username);
    const password = String(req.body?.password || '');
    const email = toDb(req.body?.email);
    const nombre = toDb(req.body?.nombre);
    const roles = Array.isArray(req.body?.roles) ? req.body.roles.map(up) : ['USER'];

    if (!username || !password) {
      return res.status(400).json({ error: 'Usuario y contraseña requeridos' });
    }
    if (password.length < 6) {
      return res.status(400).json({ error: 'La contraseña debe tener al menos 6 caracteres' });
    }

    await poolConnect;
    const pool = await getPool();
    trans = new sql.Transaction(pool);
    await trans.begin();

    // --- Verificar unicidad username / email ---
    {
      const rqCheck = new sql.Request(trans);
      const dup = await rqCheck
        .input('un', sql.VarChar(100), username)
        .input('em', sql.VarChar(160), email)
        .query(`
          SELECT TOP 1 1 as x
          FROM usuarios
          WHERE UPPER(LTRIM(RTRIM(username))) = @un
             OR ( @em IS NOT NULL AND UPPER(LTRIM(RTRIM(email))) = UPPER(LTRIM(RTRIM(@em))) )
        `);
      if (dup.recordset.length) {
        await trans.rollback();
        return res.status(409).json({ error: 'Ya existe un usuario con ese username o email' });
      }
    }

    // --- Crear usuario ---
    const hash = await bcrypt.hash(password, 10);
    const rqUser = new sql.Request(trans);
    rqUser.input('un', sql.VarChar, username);
    rqUser.input('nm', sql.VarChar, nombre);
    rqUser.input('em', sql.VarChar, email);
    rqUser.input('ph', sql.VarChar, hash);

    const insU = await rqUser.query(`
      INSERT INTO usuarios (username, nombre, email, password_hash, is_active, created_at)
      OUTPUT INSERTED.id_usuario, INSERTED.username, INSERTED.nombre, INSERTED.email, INSERTED.created_at
      VALUES (@un, @nm, @em, @ph, 1, SYSDATETIME())
    `);

    const user = insU.recordset[0];
    const uid = user.id_usuario;

    // --- Asignar roles ---
    for (const r of roles) {
      const rqRole = new sql.Request(trans);
      rqRole.input('rn', sql.VarChar(100), r);

      const ex = await rqRole.query(`SELECT id_rol FROM roles WHERE nombre = @rn`);
      let rid;
      if (ex.recordset.length) {
        rid = ex.recordset[0].id_rol;
      } else {
        const rqInsertRole = new sql.Request(trans);
        rqInsertRole.input('rn2', sql.VarChar, r);
        const insR = await rqInsertRole.query(`
          INSERT INTO roles (nombre, is_system)
          OUTPUT INSERTED.id_rol
          VALUES (@rn2, 0)
        `);
        rid = insR.recordset[0].id_rol;
      }

      const rqLink = new sql.Request(trans);
      await rqLink
        .input('uid', sql.Int, uid)
        .input('rid', sql.Int, rid)
        .query(`INSERT INTO usuario_roles (id_usuario, id_rol) VALUES (@uid, @rid)`);
    }

    await trans.commit();
    res.status(201).json({ message: 'Usuario creado correctamente', user, roles });
    } catch (err) {
      try { if (trans) await trans.rollback(); } catch {}
      console.error('users.create:', err);
      res.status(500).json({
        error: 'Error al crear usuario', 
        detalle: err.message, 
        code: err.code, 
        number: err.number});
    }
};

/**
 * ========================================================
 * GET /users
 * Lista todos los usuarios con sus roles
 * ========================================================
 */
exports.getAll = async (_req, res) => {
  try {
    await poolConnect;
    const pool = await getPool();

    const users = await pool.request().query(`
      SELECT id_usuario, username, nombre, email, is_active, created_at
      FROM usuarios
      ORDER BY created_at DESC
    `);

    const roles = await pool.request().query(`
      SELECT ur.id_usuario, r.nombre AS rol
      FROM usuario_roles ur
      JOIN roles r ON r.id_rol = ur.id_rol
    `);

    const rolesByUser = roles.recordset.reduce((acc, row) => {
      (acc[row.id_usuario] ||= []).push(row.rol);
      return acc;
    }, {});

    const rows = users.recordset.map(u => ({
      ...u,
      roles: rolesByUser[u.id_usuario] || []
    }));

    res.json(rows);
  } catch (err) {
    console.error('users.getAll:', err);
    res.status(500).json({ error: 'Error al listar usuarios' });
  }
};

/**
 * ========================================================
 * DELETE /users
 * Borra todos los usuarios (solo ADMIN)
 * ========================================================
 */
exports.removeAll = async (_req, res) => {
  let trans;
  try {
    await poolConnect;
    const pool = await getPool();
    trans = new sql.Transaction(pool);
    await trans.begin();

    const rq = new sql.Request(trans);
    await rq.query(`DELETE FROM usuario_roles;`);
    await rq.query(`DELETE FROM usuarios;`);
    await rq.query(`
      IF EXISTS(
        SELECT 1 FROM sys.columns 
        WHERE object_id = OBJECT_ID('dbo.usuarios') AND is_identity = 1
      )
      DBCC CHECKIDENT ('dbo.usuarios', RESEED, 0);
    `);

    await trans.commit();
    res.json({ ok: true, message: 'Todos los usuarios eliminados' });
  } catch (err) {
    try { if (trans) await trans.rollback(); } catch {}
    console.error('users.removeAll:', err);
    res.status(500).json({ error: 'No se pudieron borrar los usuarios' });
  }
};

/**
 * ========================================================
 * DELETE /users/:id
 * Borra un usuario específico
 * ========================================================
 */
exports.removeOne = async (req, res) => {
  const id = Number(req.params.id);
  if (!id) return res.status(400).json({ error: 'ID inválido' });

  let trans;
  try {
    await poolConnect;
    const pool = await getPool();
    trans = new sql.Transaction(pool);
    await trans.begin();

    // 1) utilidades
    await new sql.Request(trans)
      .input('id', sql.Int, id)
      .query(`DELETE FROM dbo.usuario_utilidades WHERE id_usuario = @id`);

    // 2) roles
    await new sql.Request(trans)
      .input('id', sql.Int, id)
      .query(`DELETE FROM dbo.usuario_roles WHERE id_usuario = @id`);

    // 3) usuario
    await new sql.Request(trans)
      .input('id', sql.Int, id)
      .query(`DELETE FROM dbo.usuarios WHERE id_usuario = @id`);

    await trans.commit();
    res.json({ ok: true, message: 'Usuario eliminado correctamente' });

  } catch (err) {
    console.error('users.removeOne:', err);
    try { if (trans) await trans.rollback(); } catch {}
    res.status(500).json({ error: 'Error al eliminar usuario', detalle: err.message });
  }
};

// ========================================================
// ELIMINAR USUARIO
// ========================================================
exports.deleteUser = async (req, res) => {
  let trans;
  try {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ error: 'ID inválido' });

    await poolConnect;
    const pool = await getPool();
    trans = new sql.Transaction(pool);
    await trans.begin();
    const rq = new sql.Request(trans);

    // 🔹 Borrar primero utilidades
    await rq.input('id', sql.Int, id)
      .query(`DELETE FROM usuario_utilidades WHERE id_usuario = @id;`);

    // 🔹 Luego los roles
    await rq.input('id2', sql.Int, id)
      .query(`DELETE FROM usuario_roles WHERE id_usuario = @id2;`);

    // 🔹 Finalmente el usuario
    const delU = await rq.input('id3', sql.Int, id)
      .query(`DELETE FROM usuarios WHERE id_usuario = @id3;`);

    await trans.commit();

    res.json({ ok: true, deleted_usuarios: delU.rowsAffected?.[0] ?? 0 });
  } catch (err) {
    try { if (trans) await trans.rollback(); } catch {}
    console.error('users.deleteUser:', err);
    res.status(500).json({ error: 'Error al eliminar el usuario' });
  }
};

/**
 * ========================================================
 * PUT /users/:id
 * Edita usuario y permite cambiar contraseña sin pedir la actual
 * Solo ADMIN
 * ========================================================
 */
exports.update = async (req, res) => {
  const id = Number(req.params.id);
  if (!id) return res.status(400).json({ error: "ID inválido" });

  let trans;

  try {
    const username = up(req.body?.username);
    const nombre = toDb(req.body?.nombre);
    const email = toDb(req.body?.email);
    const password = String(req.body?.password || "");
    const roles = Array.isArray(req.body?.roles) && req.body.roles.length
      ? req.body.roles.map(up)
      : ["USER"];

    if (!username) {
      return res.status(400).json({ error: "El usuario es obligatorio" });
    }

    if (password && password.length < 6) {
      return res.status(400).json({
        error: "La contraseña debe tener al menos 6 caracteres",
      });
    }

    await poolConnect;
    const pool = await getPool();

    trans = new sql.Transaction(pool);
    await trans.begin();

    // Verificar que no exista otro usuario con el mismo username o email
    const dup = await new sql.Request(trans)
      .input("id", sql.Int, id)
      .input("un", sql.VarChar(100), username)
      .input("em", sql.VarChar(160), email)
      .query(`
        SELECT TOP 1 1 AS x
        FROM dbo.usuarios
        WHERE id_usuario <> @id
          AND (
            UPPER(LTRIM(RTRIM(username))) = @un
            OR (
              @em IS NOT NULL
              AND UPPER(LTRIM(RTRIM(email))) = UPPER(LTRIM(RTRIM(@em)))
            )
          )
      `);

    if (dup.recordset.length) {
      await trans.rollback();
      return res.status(409).json({
        error: "Ya existe otro usuario con ese username o email",
      });
    }

    // Si vino contraseña, actualizamos password_hash.
    // Si vino vacía, dejamos la contraseña actual.
    if (password) {
      const hash = await bcrypt.hash(password, 10);

      await new sql.Request(trans)
        .input("id", sql.Int, id)
        .input("un", sql.VarChar(100), username)
        .input("nm", sql.VarChar(160), nombre)
        .input("em", sql.VarChar(160), email)
        .input("ph", sql.VarChar, hash)
        .query(`
          UPDATE dbo.usuarios
          SET username = @un,
              nombre = @nm,
              email = @em,
              password_hash = @ph
          WHERE id_usuario = @id
        `);
    } else {
      await new sql.Request(trans)
        .input("id", sql.Int, id)
        .input("un", sql.VarChar(100), username)
        .input("nm", sql.VarChar(160), nombre)
        .input("em", sql.VarChar(160), email)
        .query(`
          UPDATE dbo.usuarios
          SET username = @un,
              nombre = @nm,
              email = @em
          WHERE id_usuario = @id
        `);
    }

    // Reemplazar roles
    await new sql.Request(trans)
      .input("id", sql.Int, id)
      .query(`
        DELETE FROM dbo.usuario_roles
        WHERE id_usuario = @id
      `);

    for (const r of roles) {
      const ex = await new sql.Request(trans)
        .input("rn", sql.VarChar(100), r)
        .query(`
          SELECT id_rol
          FROM dbo.roles
          WHERE nombre = @rn
        `);

      let rid;

      if (ex.recordset.length) {
        rid = ex.recordset[0].id_rol;
      } else {
        const insR = await new sql.Request(trans)
          .input("rn", sql.VarChar(100), r)
          .query(`
            INSERT INTO dbo.roles (nombre, is_system)
            OUTPUT INSERTED.id_rol
            VALUES (@rn, 0)
          `);

        rid = insR.recordset[0].id_rol;
      }

      await new sql.Request(trans)
        .input("uid", sql.Int, id)
        .input("rid", sql.Int, rid)
        .query(`
          INSERT INTO dbo.usuario_roles (id_usuario, id_rol)
          VALUES (@uid, @rid)
        `);
    }

    await trans.commit();

    res.json({
      ok: true,
      message: password
        ? "Usuario y contraseña actualizados correctamente"
        : "Usuario actualizado correctamente",
    });

  } catch (err) {
    try { if (trans) await trans.rollback(); } catch {}

    console.error("users.update:", err);

    res.status(500).json({
      error: "Error al actualizar usuario",
      detalle: err.message,
    });
  }
};