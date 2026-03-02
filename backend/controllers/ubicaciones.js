// backend/controllers/ubicaciones.js
const { sql, poolConnect, getPool } = require("../db");

function asInt(v) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : NaN;
}
const normName = (v) => String(v ?? "").trim().toUpperCase();

// ============================================================================
// GET /ubicaciones   (opcional: ?deposito_id=...)
// ============================================================================
exports.getAll = async (req, res) => {
  try {
    await poolConnect;
    const pool = await getPool();

    const depId = req.query?.deposito_id != null ? asInt(req.query.deposito_id) : null;

    if (depId != null && !Number.isFinite(depId)) {
      return res.status(400).json({ error: "deposito_id inválido" });
    }

    const r = await pool
      .request()
      .input("dep", sql.Int, depId)
      .query(`
        SELECT id_ubicacion, id_deposito, nombre, activa
        FROM dbo.ubicaciones WITH (NOLOCK)
        WHERE (@dep IS NULL OR id_deposito = @dep)
        ORDER BY id_deposito, nombre
      `);

    return res.json(r.recordset || []);
  } catch (err) {
    console.error("ubicaciones.getAll:", err);
    return res.status(500).json({ error: "Error al listar ubicaciones", detalle: err.message });
  }
};

// ============================================================================
// GET /ubicaciones/:id
// ============================================================================
exports.getById = async (req, res) => {
  const id = asInt(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json({ error: "ID inválido" });

  try {
    await poolConnect;
    const pool = await getPool();

    const r = await pool
      .request()
      .input("id", sql.Int, id)
      .query(`
        SELECT id_ubicacion, id_deposito, nombre, activa
        FROM dbo.ubicaciones WITH (NOLOCK)
        WHERE id_ubicacion = @id
      `);

    if (!r.recordset.length) return res.status(404).json({ error: "Ubicación no encontrada" });
    return res.json(r.recordset[0]);
  } catch (err) {
    console.error("ubicaciones.getById:", err);
    return res.status(500).json({ error: "Error al obtener ubicación", detalle: err.message });
  }
};

// ============================================================================
// GET /ubicaciones/by-deposito?deposito_id=...
// (si querés conservar tu endpoint original "getByDeposito")
// ============================================================================
exports.getByDeposito = async (req, res) => {
  const depositoId = asInt(req.query?.deposito_id);
  if (!Number.isFinite(depositoId) || depositoId <= 0) {
    return res.status(400).json({ error: "Debe indicar ?deposito_id=..." });
  }

  try {
    await poolConnect;
    const pool = await getPool();

    const r = await pool
      .request()
      .input("dep", sql.Int, depositoId)
      .query(`
        SELECT id_ubicacion, id_deposito, nombre, activa
        FROM dbo.ubicaciones WITH (NOLOCK)
        WHERE id_deposito = @dep
        ORDER BY 
          CASE WHEN UPPER(LTRIM(RTRIM(nombre))) = 'GENERAL' THEN 0 ELSE 1 END,
          nombre;
      `);

    return res.json(r.recordset || []);
  } catch (err) {
    console.error("ubicaciones.getByDeposito:", err);
    return res.status(500).json({ error: "Error al listar ubicaciones", detalle: err.message });
  }
};

// ============================================================================
// POST /ubicaciones
// body: { deposito_id, nombre }
// (sin duplicados por depósito)
// ============================================================================
exports.create = async (req, res) => {
  const depositoId = asInt(req.body?.deposito_id);
  const nombreRaw = req.body?.nombre;

  if (!Number.isFinite(depositoId) || depositoId <= 0) {
    return res.status(400).json({ error: "Depósito inválido" });
  }

  const nombre = String(nombreRaw ?? "").trim();
  const nombreN = normName(nombre);

  if (!nombreN) {
    return res.status(400).json({ error: "El nombre de la ubicación no puede estar vacío" });
  }

  let trans;
  try {
    await poolConnect;
    const pool = await getPool();

    trans = new sql.Transaction(pool);
    await trans.begin();

    const execT = async (sqlText, bindFn) => {
      const r = new sql.Request(trans);
      if (bindFn) bindFn(r);
      return r.query(sqlText);
    };

    // 1) Validar depósito
    const dep = await execT(
      `
      SELECT id_deposito
      FROM dbo.depositos WITH (UPDLOCK, HOLDLOCK)
      WHERE id_deposito = @dep
      `,
      (r) => r.input("dep", sql.Int, depositoId)
    );

    if (!dep.recordset.length) {
      await trans.rollback();
      return res.status(400).json({ error: `Depósito inexistente: ${depositoId}` });
    }

    // 2) Duplicado en ese depósito
    const existe = await execT(
      `
      SELECT TOP 1 id_ubicacion, nombre
      FROM dbo.ubicaciones WITH (UPDLOCK, HOLDLOCK)
      WHERE id_deposito = @dep
        AND UPPER(LTRIM(RTRIM(nombre))) = @nom
      `,
      (r) =>
        r
          .input("dep", sql.Int, depositoId)
          .input("nom", sql.VarChar(200), nombreN)
    );

    if (existe.recordset.length) {
      await trans.rollback();
      return res.status(409).json({
        error: "La ubicación ya existe en ese depósito",
        detalle: {
          id_ubicacion: existe.recordset[0].id_ubicacion,
          nombre: existe.recordset[0].nombre,
        },
      });
    }

    // 3) Insertar (activa=1)
    const ins = await execT(
      `
      INSERT INTO dbo.ubicaciones (id_deposito, nombre, activa)
      OUTPUT INSERTED.id_ubicacion, INSERTED.id_deposito, INSERTED.nombre, INSERTED.activa
      VALUES (@dep, @nombre, 1);
      `,
      (r) =>
        r
          .input("dep", sql.Int, depositoId)
          .input("nombre", sql.VarChar(200), nombre)
    );

    await trans.commit();
    return res.status(201).json({ ok: true, ubicacion: ins.recordset[0] });
  } catch (err) {
    console.error("ubicaciones.create:", err);
    try {
      if (trans) await trans.rollback();
    } catch {}
    return res.status(500).json({ error: "Error al crear ubicación", detalle: err.message });
  }
};

// ============================================================================
// PUT /ubicaciones/:id
// body: { nombre?, activa? }
// ============================================================================
exports.update = async (req, res) => {
  const id = asInt(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json({ error: "ID inválido" });

  const nombre = req.body?.nombre != null ? String(req.body.nombre).trim() : null;
  const activa = req.body?.activa != null ? Number(req.body.activa) : null;

  if (nombre == null && activa == null) {
    return res.status(400).json({ error: "Debe enviar nombre y/o activa" });
  }

  try {
    await poolConnect;
    const pool = await getPool();

    // si cambia nombre, controlamos duplicado por depósito
    if (nombre != null) {
      const cur = await pool.request().input("id", sql.Int, id).query(`
        SELECT id_deposito, nombre FROM dbo.ubicaciones WHERE id_ubicacion = @id
      `);
      if (!cur.recordset.length) return res.status(404).json({ error: "Ubicación no encontrada" });

      const depId = Number(cur.recordset[0].id_deposito);
      const nombreN = normName(nombre);

      const dup = await pool
        .request()
        .input("dep", sql.Int, depId)
        .input("nom", sql.VarChar(200), nombreN)
        .input("id", sql.Int, id)
        .query(`
          SELECT TOP 1 id_ubicacion
          FROM dbo.ubicaciones
          WHERE id_deposito = @dep
            AND UPPER(LTRIM(RTRIM(nombre))) = @nom
            AND id_ubicacion <> @id
        `);

      if (dup.recordset.length) {
        return res.status(409).json({ error: "Ya existe esa ubicación en el depósito" });
      }
    }

    const r = await pool
      .request()
      .input("id", sql.Int, id)
      .input("nombre", sql.VarChar(200), nombre)
      .input("activa", sql.Bit, activa == null ? null : activa ? 1 : 0)
      .query(`
        UPDATE dbo.ubicaciones
        SET
          nombre = COALESCE(@nombre, nombre),
          activa = COALESCE(@activa, activa)
        WHERE id_ubicacion = @id;

        SELECT id_ubicacion, id_deposito, nombre, activa
        FROM dbo.ubicaciones
        WHERE id_ubicacion = @id;
      `);

    if (!r.recordset.length) return res.status(404).json({ error: "Ubicación no encontrada" });
    return res.json({ ok: true, ubicacion: r.recordset[0] });
  } catch (err) {
    console.error("ubicaciones.update:", err);
    return res.status(500).json({ error: "Error al actualizar ubicación", detalle: err.message });
  }
};

// ============================================================================
// DELETE /ubicaciones/:id
// (si preferís, lo podés cambiar por "activa=0" en vez de borrar)
// ============================================================================
exports.remove = async (req, res) => {
  const id = asInt(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json({ error: "ID inválido" });

  try {
    await poolConnect;
    const pool = await getPool();

    // soft delete: activa = 0
    const r = await pool
      .request()
      .input("id", sql.Int, id)
      .query(`
        UPDATE dbo.ubicaciones SET activa = 0 WHERE id_ubicacion = @id;
        SELECT @@ROWCOUNT AS affected;
      `);

    const affected = Number(r.recordset?.[0]?.affected || 0);
    if (!affected) return res.status(404).json({ error: "Ubicación no encontrada" });

    return res.json({ ok: true });
  } catch (err) {
    console.error("ubicaciones.remove:", err);
    return res.status(500).json({ error: "Error al eliminar ubicación", detalle: err.message });
  }
};
