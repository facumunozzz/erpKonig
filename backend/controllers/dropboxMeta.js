// backend/controllers/dropboxMeta.js
const { getMetadata } = require("../services/dropbox");

/**
 * POST /dropbox/resolve-id
 * Body: { "path": "/Logistica/Planificacion/programador/registro-de-produccion-1.2.xlsx" }
 *
 * Respuesta: { ok: true, id: "id:....", name, path_display, path_lower }
 */
exports.resolveFileId = async (req, res) => {
  try {
    let path = String(req.body?.path || "").trim();
    if (!path) {
      return res.status(400).json({ error: "Debe enviar JSON con { path }" });
    }

    // Normalización: si no arranca con "/" y no es "id:", le agrego "/"
    if (!path.startsWith("/") && !path.startsWith("id:")) {
      path = "/" + path;
    }

    const meta = await getMetadata(path);

    // meta.id es el identificador estable (no cambia al renombrar/mover)
    return res.json({
      ok: true,
      id: meta.id,
      name: meta.name,
      path_display: meta.path_display,
      path_lower: meta.path_lower,
    });
  } catch (err) {
    const dropbox = err.response?.data || null;
    console.error("dropbox.resolveFileId:", err.message, dropbox);

    return res.status(500).json({
      error: "Error obteniendo metadata de Dropbox",
      detalle: err.message,
      dropbox,
    });
  }
};