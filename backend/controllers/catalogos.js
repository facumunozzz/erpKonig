const { sql, poolConnect, getPool } = require("../db");

const TABLAS = {
  proveedores: {
    table: "dbo.proveedores",
    id: "id_proveedor",
    campo: "nombre",
    articuloCampo: "proveedor",
    label: "Proveedor",
  },
  folios: {
    table: "dbo.folios",
    id: "id_folio",
    campo: "nombre",
    articuloCampo: "folio",
    label: "Folio",
  },
  tipos: {
    table: "dbo.tipos",
    id: "id_tipo",
    campo: "nombre",
    articuloCampo: "tipo",
    label: "Tipo",
  },
};

function getCfg(tipo) {
  const cfg = TABLAS[tipo];
  if (!cfg) {
    const err = new Error("Tipo de catálogo inválido");
    err.status = 400;
    throw err;
  }
  return cfg;
}

function toDb(v) {
  const s = String(v ?? "").trim();
  return s === "" ? null : s;
}

// LISTAR
exports.listar = async (req, res) => {
  try {
    const cfg = getCfg(req.params.tipo);
    await poolConnect;
    const pool = await getPool();

    const rs = await pool.request().query(`
      SET NOCOUNT ON;
      SELECT ${cfg.id} AS id, ${cfg.campo} AS nombre, activo
      FROM ${cfg.table}
      ORDER BY ${cfg.campo};
    `);

    res.json(rs.recordset || []);
  } catch (err) {
    console.error("catalogos.listar:", err);
    res.status(err.status || 500).json({ error: err.message || "Error al listar catálogo" });
  }
};

// CREAR
exports.crear = async (req, res) => {
  try {
    const cfg = getCfg(req.params.tipo);
    const nombre = toDb(req.body?.nombre);

    if (!nombre) {
      return res.status(400).json({ error: `Debe indicar nombre de ${cfg.label.toLowerCase()}` });
    }

    await poolConnect;
    const pool = await getPool();

    const dup = await pool.request()
      .input("nombre", sql.VarChar(200), nombre)
      .query(`
        SET NOCOUNT ON;
        SELECT TOP 1 1
        FROM ${cfg.table}
        WHERE UPPER(LTRIM(RTRIM(${cfg.campo}))) = UPPER(LTRIM(RTRIM(@nombre)));
      `);

    if (dup.recordset.length) {
      return res.status(409).json({ error: `${cfg.label} ya existente` });
    }

    const ins = await pool.request()
      .input("nombre", sql.VarChar(200), nombre)
      .query(`
        SET NOCOUNT ON;
        INSERT INTO ${cfg.table} (${cfg.campo}, activo)
        OUTPUT INSERTED.${cfg.id} AS id, INSERTED.${cfg.campo} AS nombre, INSERTED.activo
        VALUES (@nombre, 1);
      `);

    res.status(201).json(ins.recordset[0]);
  } catch (err) {
    console.error("catalogos.crear:", err);
    res.status(err.status || 500).json({ error: err.message || "Error al crear registro" });
  }
};

// ACTUALIZAR
exports.actualizar = async (req, res) => {
  try {
    const cfg = getCfg(req.params.tipo);
    const id = Number(req.params.id);
    const nombre = toDb(req.body?.nombre);

    if (!Number.isInteger(id)) {
      return res.status(400).json({ error: "ID inválido" });
    }
    if (!nombre) {
      return res.status(400).json({ error: `Debe indicar nombre de ${cfg.label.toLowerCase()}` });
    }

    await poolConnect;
    const pool = await getPool();

    const dup = await pool.request()
      .input("id", sql.Int, id)
      .input("nombre", sql.VarChar(200), nombre)
      .query(`
        SET NOCOUNT ON;
        SELECT TOP 1 1
        FROM ${cfg.table}
        WHERE UPPER(LTRIM(RTRIM(${cfg.campo}))) = UPPER(LTRIM(RTRIM(@nombre)))
          AND ${cfg.id} <> @id;
      `);

    if (dup.recordset.length) {
      return res.status(409).json({ error: `${cfg.label} ya existente` });
    }

    const upd = await pool.request()
      .input("id", sql.Int, id)
      .input("nombre", sql.VarChar(200), nombre)
      .query(`
        SET NOCOUNT ON;
        UPDATE ${cfg.table}
           SET ${cfg.campo} = @nombre
         WHERE ${cfg.id} = @id;
      `);

    if (!upd.rowsAffected[0]) {
      return res.status(404).json({ error: `${cfg.label} no encontrado` });
    }

    res.json({ message: `${cfg.label} actualizado` });
  } catch (err) {
    console.error("catalogos.actualizar:", err);
    res.status(err.status || 500).json({ error: err.message || "Error al actualizar registro" });
  }
};

// BORRAR SOLO SI NO ESTÁ EN USO
exports.eliminar = async (req, res) => {
  try {
    const cfg = getCfg(req.params.tipo);
    const id = Number(req.params.id);

    if (!Number.isInteger(id)) {
      return res.status(400).json({ error: "ID inválido" });
    }

    await poolConnect;
    const pool = await getPool();

    // 1) obtener nombre
    const itemRs = await pool.request()
      .input("id", sql.Int, id)
      .query(`
        SET NOCOUNT ON;
        SELECT ${cfg.id} AS id, ${cfg.campo} AS nombre
        FROM ${cfg.table}
        WHERE ${cfg.id} = @id;
      `);

    if (!itemRs.recordset.length) {
      return res.status(404).json({ error: `${cfg.label} no encontrado` });
    }

    const nombre = itemRs.recordset[0].nombre;

    // 2) verificar uso en artículos
    const usoRs = await pool.request()
      .input("nombre", sql.VarChar(200), nombre)
      .query(`
        SET NOCOUNT ON;
        SELECT COUNT(*) AS usados
        FROM dbo.articulos
        WHERE UPPER(LTRIM(RTRIM(${cfg.articuloCampo}))) = UPPER(LTRIM(RTRIM(@nombre)));
      `);

    const usados = Number(usoRs.recordset[0]?.usados || 0);
    if (usados > 0) {
      return res.status(409).json({
        error: `No se puede borrar. Hay ${usados} artículo(s) usando este ${cfg.label.toLowerCase()}.`,
      });
    }

    // 3) borrar
    await pool.request()
      .input("id", sql.Int, id)
      .query(`
        DELETE FROM ${cfg.table}
        WHERE ${cfg.id} = @id;
      `);

    res.json({ message: `${cfg.label} eliminado` });
  } catch (err) {
    console.error("catalogos.eliminar:", err);
    res.status(err.status || 500).json({ error: err.message || "Error al eliminar registro" });
  }
};