const express = require("express");
const router = express.Router();

const controller = require("../controllers/observaciones");
const { authRequired } = require("../middleware/auth");
const { sql, poolConnect, getPool } = require("../db");

// ======================================================
// ACCESO A OBSERVACIONES
// ADMIN: entra siempre.
// USUARIO NORMAL: necesita la utilidad "Observaciones".
// ======================================================
async function observacionesRequired(req, res, next) {
  try {
    const esAdmin =
      req.user?.is_admin === true ||
      req.user?.is_admin === 1 ||
      (Array.isArray(req.user?.roles) && req.user.roles.includes("ADMIN"));

    if (esAdmin) {
      return next();
    }

    const idUsuario = Number(req.user?.sub);

    if (!Number.isInteger(idUsuario) || idUsuario <= 0) {
      return res.status(403).json({
        error: "Usuario sin permiso para Observaciones",
      });
    }

    await poolConnect;
    const pool = await getPool();

    const result = await pool
      .request()
      .input("idUsuario", sql.Int, idUsuario)
      .input("utilidad", sql.VarChar(100), "Observaciones").query(`
        SELECT TOP 1 1 AS permitido
        FROM dbo.usuario_utilidades
        WHERE id_usuario = @idUsuario
          AND utilidad = @utilidad;
      `);

    if (!result.recordset.length) {
      return res.status(403).json({
        error: "No tiene habilitada la utilidad Observaciones",
      });
    }

    return next();
  } catch (err) {
    console.error("observacionesRequired:", err);

    return res.status(500).json({
      error: "Error al validar permiso de Observaciones",
      detalle: err.message,
    });
  }
}

router.get("/", authRequired, observacionesRequired, controller.getAll);

router.post("/", authRequired, observacionesRequired, controller.create);

module.exports = router;
