const { sql, poolConnect, getPool } = require("../db");
const { resolverOperacionUsuario } = require("../utils/operacionUsuario");

async function soloOperacionUsuario(req, res, next) {
  try {
    const id = Number(req.params.id);

    // Dejamos que el controlador valide IDs inválidos.
    if (!Number.isInteger(id) || id <= 0) {
      return next();
    }

    await poolConnect;
    const pool = await getPool();

    const operacionUsuario = await resolverOperacionUsuario(pool, req);
    const usuarioActual =
      req.user?.username ||
      req.user?.email ||
      req.user?.name ||
      null;

    // Si el nombre del usuario NO coincide con ninguna operación,
    // no aplicamos restricción: puede trabajar con todas las operaciones.
    if (!operacionUsuario) {
      req.operacionUsuario = null;
      return next();
    }

    const result = await pool
      .request()
      .input("id", sql.Int, id)
      .input("operacionUsuario", sql.NVarChar(150), operacionUsuario)
      .input("usuarioActual", sql.NVarChar(255), usuarioActual)
      .query(`
        SELECT TOP 1 ot.id_ot
        FROM dbo.ordenes_trabajo ot WITH (NOLOCK)
        LEFT JOIN dbo.ordenes_trabajo origen WITH (NOLOCK)
          ON origen.id_ot = ot.id_ot_origen
        WHERE ot.id_ot = @id
          AND (
            -- Indirecto independiente: sólo su creador puede operar sobre él
            -- cuando el usuario está restringido por operación.
            (
              UPPER(LTRIM(RTRIM(ISNULL(ot.tipo_ot, 'PRODUCTIVA')))) = 'INDIRECTO'
              AND ot.id_ot_origen IS NULL
              AND LTRIM(RTRIM(ISNULL(ot.usuario_creacion, '')))
                  COLLATE Latin1_General_100_CI_AI
                = LTRIM(RTRIM(ISNULL(@usuarioActual, '')))
                  COLLATE Latin1_General_100_CI_AI
            )
            OR
            (
              CASE
                WHEN UPPER(LTRIM(RTRIM(ISNULL(ot.tipo_ot, 'PRODUCTIVA')))) = 'INDIRECTO'
                  THEN origen.operacion
                ELSE ot.operacion
              END
            ) COLLATE Latin1_General_100_CI_AI
              = @operacionUsuario COLLATE Latin1_General_100_CI_AI
          );
      `);

    if (!result.recordset.length) {
      // 404 en vez de 403 para no revelar la existencia de OTs
      // de otras operaciones.
      return res.status(404).json({
        error: "Orden de trabajo no encontrada",
      });
    }

    req.operacionUsuario = operacionUsuario;
    return next();
  } catch (error) {
    console.error("soloOperacionUsuario:", error);

    return res.status(500).json({
      error: "Error al validar la operación del usuario",
      detalle: error.message,
    });
  }
}

module.exports = soloOperacionUsuario;
