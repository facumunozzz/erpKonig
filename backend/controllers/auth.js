const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { sql, poolConnect, getPool } = require('../db');

// --- Helpers ---
const toDb = v => (v == null || String(v).trim() === '' ? null : String(v).trim());
const up = v => (toDb(v)?.toUpperCase() ?? null);

// --- Config global JWT ---
const JWT_SECRET = process.env.JWT_SECRET || 'facundo12345';
const JWT_EXPIRES = process.env.JWT_EXPIRES || '8h';

// --- Función auxiliar: traer usuario + roles ---
async function getUserWithRolesByUsername(uNorm) {
  await poolConnect;
  const pool = await getPool();

  // Usuario
  const u = await pool.request()
    .input('u', sql.VarChar, uNorm)
    .query(`
      SELECT id_usuario, username, password_hash, is_active, nombre, email, created_at
      FROM usuarios
      WHERE UPPER(LTRIM(RTRIM(username))) = @u
    `);

  if (!u.recordset.length) return null;
  const user = u.recordset[0];

  // Roles asociados
  const rs = await pool.request()
    .input('uid', sql.Int, user.id_usuario)
    .query(`
      SELECT r.nombre
      FROM usuario_roles ur
      JOIN roles r ON r.id_rol = ur.id_rol
      WHERE ur.id_usuario = @uid
      ORDER BY r.nombre
    `);

  user.roles = rs.recordset.map(r => r.nombre);
  return user;
}

// ========================================================
// LOGIN
// ========================================================
exports.login = async (req, res) => {
  try {
    const username = up(req.body?.username);
    const password = String(req.body?.password || '');

    if (!username || !password) {
      return res.status(400).json({ error: 'Usuario y contraseña requeridos' });
    }

    const user = await getUserWithRolesByUsername(username);
    if (!user) return res.status(401).json({ error: 'Credenciales inválidas' });
    if (!user.is_active) return res.status(403).json({ error: 'Usuario inactivo' });

    // Comparar contraseña hash
    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) return res.status(401).json({ error: 'Credenciales inválidas' });

    const pool = await getPool();

    // 🔹 Obtener utilidades asignadas al usuario
    const utilsRes = await pool.request()
      .input('id', sql.Int, user.id_usuario)
      .query(`SELECT utilidad FROM usuario_utilidades WHERE id_usuario = @id`);

    const utilidades = utilsRes.recordset.map(r => r.utilidad);

    // Crear payload y token JWT
    const payload = {
      sub: user.id_usuario,
      username: user.username,
      roles: user.roles,
      is_admin: user.roles.includes('ADMIN')
    };

    const token = jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES });

    // 🔹 Respuesta final completa
    res.json({
      message: 'Login exitoso',
      token,
      user: {
        id_usuario: user.id_usuario,
        username: user.username,
        roles: user.roles,
        nombre: user.nombre,
        email: user.email,
        utilidades // 👈 agregado
      }
    });
  } catch (err) {
    console.error('❌ auth.login error:', err);
    res.status(500).json({ error: 'Error interno en login' });
  }
};

// ========================================================
// BOOTSTRAP ADMIN (crear primer usuario ADMIN si no hay ninguno)
// ========================================================
exports.bootstrapAdmin = async (req, res) => {
  let trans;
  try {
    await poolConnect;
    const pool = await getPool();

    // Verificar si ya existen usuarios
    const c = await pool.request().query(`SELECT COUNT(1) AS c FROM usuarios`);
    if (Number(c.recordset[0].c) > 0) {
      return res.status(403).json({ error: 'Bootstrap deshabilitado: ya existen usuarios' });
    }

    const username = up(req.body?.username);
    const password = String(req.body?.password || '');
    const email = toDb(req.body?.email);
    const nombre = toDb(req.body?.nombre);

    if (!username || !password) {
      return res.status(400).json({ error: 'Usuario y contraseña requeridos' });
    }
    if (password.length < 6) {
      return res.status(400).json({ error: 'La contraseña debe tener al menos 6 caracteres' });
    }

    const hash = await bcrypt.hash(password, 10);

    trans = new sql.Transaction(pool);
    await trans.begin();
    const rq = new sql.Request(trans);

    // Asegurar existencia de rol ADMIN
    const rAdmin = await rq.query(`SELECT id_rol FROM roles WHERE nombre = 'ADMIN'`);
    let adminId;
    if (rAdmin.recordset.length) {
      adminId = rAdmin.recordset[0].id_rol;
    } else {
      const insR = await rq.query(`
        INSERT INTO roles (nombre, is_system)
        OUTPUT INSERTED.id_rol
        VALUES ('ADMIN', 1)
      `);
      adminId = insR.recordset[0].id_rol;
    }

    // Crear usuario ADMIN
    const insU = await rq
      .input('un', sql.VarChar, username)
      .input('nm', sql.VarChar, nombre)
      .input('em', sql.VarChar, email)
      .input('ph', sql.VarChar, hash)
      .query(`
        INSERT INTO usuarios (username, nombre, email, password_hash, is_active)
        OUTPUT INSERTED.id_usuario, INSERTED.username
        VALUES (@un, @nm, @em, @ph, 1)
      `);

    const uid = insU.recordset[0].id_usuario;

    // Vincular rol ADMIN
    await rq
      .input('uid', sql.Int, uid)
      .input('rid', sql.Int, adminId)
      .query(`INSERT INTO usuario_roles (id_usuario, id_rol) VALUES (@uid, @rid)`);

    await trans.commit();

    res.status(201).json({
      message: 'Usuario ADMIN creado correctamente',
      username,
      id_usuario: uid
    });
  } catch (err) {
    try { if (trans) await trans.rollback(); } catch {}
    console.error('❌ auth.bootstrapAdmin error:', err);
    res.status(500).json({ error: 'Error al crear usuario ADMIN' });
  }
};

// ========================================================
// ME: Devuelve los datos del usuario autenticado
// ========================================================
exports.me = async (req, res) => {
  try {
    if (!req.user) return res.status(401).json({ error: 'No autenticado' });
    res.json({ user: req.user });
  } catch (err) {
    console.error('❌ auth.me error:', err);
    res.status(500).json({ error: 'Error obteniendo usuario actual' });
  }
};
