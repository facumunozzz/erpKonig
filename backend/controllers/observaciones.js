const { sql, poolConnect, getPool } = require("../db");

// ======================================================
// GET /observaciones
// Lista todas las observaciones, más nuevas primero
// ======================================================
exports.getAll = async (_req, res) => {
  try {
    await poolConnect;
    const pool = await getPool();

    const result = await pool.request().query(`
      SELECT
        id_observacion,
        observacion,
        fecha,
        CONVERT(VARCHAR(10), fecha, 103)
          + ' '
          + CONVERT(VARCHAR(8), fecha, 108) AS fecha_formateada,
        usuario,
        id_usuario
      FROM dbo.observaciones_produccion
      ORDER BY fecha DESC, id_observacion DESC;
    `);

    return res.json(result.recordset || []);
  } catch (err) {
    console.error("observaciones.getAll:", err);

    return res.status(500).json({
      error: "Error al listar observaciones",
      detalle: err.message,
    });
  }
};

// ======================================================
// POST /observaciones
// Crea una observación usando el usuario autenticado
// ======================================================
exports.create = async (req, res) => {
  try {
    const observacion = String(req.body?.observacion || "").trim();

    if (!observacion) {
      return res.status(400).json({
        error: "La observación no puede estar vacía",
      });
    }

    const idUsuarioRaw = req.user?.sub;
    const idUsuario = Number(idUsuarioRaw);

    const usuario =
      req.user?.username ?? req.user?.email ?? req.user?.name ?? null;

    if (!usuario) {
      return res.status(401).json({
        error: "No se pudo identificar al usuario autenticado",
      });
    }

    await poolConnect;
    const pool = await getPool();

    const request = pool
      .request()
      .input("observacion", sql.NVarChar(sql.MAX), observacion)
      .input("usuario", sql.NVarChar(150), String(usuario).trim());

    if (Number.isInteger(idUsuario) && idUsuario > 0) {
      request.input("idUsuario", sql.Int, idUsuario);
    } else {
      request.input("idUsuario", sql.Int, null);
    }

    const result = await request.query(`
      INSERT INTO dbo.observaciones_produccion
      (
        observacion,
        fecha,
        usuario,
        id_usuario
      )
      OUTPUT
        INSERTED.id_observacion,
        INSERTED.observacion,
        INSERTED.fecha,
        CONVERT(VARCHAR(10), INSERTED.fecha, 103)
          + ' '
          + CONVERT(VARCHAR(8), INSERTED.fecha, 108) AS fecha_formateada,
        INSERTED.usuario,
        INSERTED.id_usuario
      VALUES
      (
        @observacion,
        GETDATE(),
        @usuario,
        @idUsuario
      );
    `);

    return res.status(201).json({
      ok: true,
      message: "Observación creada correctamente",
      observacion: result.recordset?.[0] || null,
    });
  } catch (err) {
    console.error("observaciones.create:", err);

    return res.status(500).json({
      error: "Error al crear la observación",
      detalle: err.message,
    });
  }
};
