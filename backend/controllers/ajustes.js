// backend/controllers/ajustes.js
const { sql, poolConnect, getPool } = require("../db");
const XLSX = require("xlsx");
const axios = require("axios");
const { downloadByPath, uploadOverwriteByPath } = require("../services/dropbox");

// ------------------------ helpers ------------------------
const toDb = (v) => (v == null || String(v).trim() === "" ? null : String(v).trim());
const up = (v) => (toDb(v)?.toUpperCase() ?? null);

function toNumber0(v) {
  if (v === null || v === undefined) return 0;
  if (typeof v === "number" && Number.isFinite(v)) return v;

  const s = String(v).trim();
  if (!s) return 0;

  // normaliza 1.234,56 o 1,234.56 o 1234,56
  const cleaned = s
    .replace(/\s/g, "")
    .replace(/\.(?=\d{3}(\D|$))/g, "") // quita miles con punto
    .replace(/,(?=\d{3}(\D|$))/g, "") // quita miles con coma
    .replace(",", "."); // decimal coma -> punto

  const n = Number(cleaned);
  return Number.isFinite(n) ? n : 0;
}

function asInt(v) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : NaN;
}

// Resuelve/valida id_ubicacion para un depósito.
// - Si viene ubicacionId: valida que exista y pertenezca al depósito
// - Si no viene: busca "GENERAL" y si no existe, la primera del depósito
async function resolveUbicacionId(trans, { depositoId, ubicacionId }) {
  const dep = asInt(depositoId);
  if (!Number.isFinite(dep)) throw new Error("Depósito inválido");

  const ub = ubicacionId == null ? NaN : asInt(ubicacionId);

  // 1) si el cliente manda ubicación, validar
  if (Number.isFinite(ub) && ub > 0) {
    const r = await new sql.Request(trans)
      .input("dep", sql.Int, dep)
      .input("ub", sql.Int, ub)
      .query(`
        SELECT id_ubicacion
        FROM dbo.ubicaciones
        WHERE id_deposito = @dep AND id_ubicacion = @ub
      `);
    if (!r.recordset.length) {
      throw new Error(`Ubicación inválida (${ub}) para el depósito ${dep}`);
    }
    return ub;
  }

  // 2) si no manda ubicación: buscar GENERAL
  let rGen = await new sql.Request(trans)
    .input("dep", sql.Int, dep)
    .query(`
      SELECT TOP 1 id_ubicacion
      FROM dbo.ubicaciones
      WHERE id_deposito = @dep
        AND UPPER(LTRIM(RTRIM(nombre))) = 'GENERAL'
      ORDER BY id_ubicacion
    `);

  if (rGen.recordset.length) return Number(rGen.recordset[0].id_ubicacion);

  // 3) fallback: primera ubicación del depósito
  let rAny = await new sql.Request(trans)
    .input("dep", sql.Int, dep)
    .query(`
      SELECT TOP 1 id_ubicacion
      FROM dbo.ubicaciones
      WHERE id_deposito = @dep
      ORDER BY id_ubicacion
    `);

  if (rAny.recordset.length) return Number(rAny.recordset[0].id_ubicacion);

  // 4) no hay ubicaciones
  throw new Error(
    `El depósito ${dep} no tiene ubicaciones. Creá una ubicación "GENERAL" para poder ajustar stock.`
  );
}

// Lee stock actual (suma) para validar
async function getStockActual(trans, { depositoId, articuloId, ubicacionId }) {
  const rq = new sql.Request(trans);
  const r = await rq
    .input("dep", sql.Int, depositoId)
    .input("art", sql.Int, articuloId)
    .input("ub", sql.Int, ubicacionId ?? null)
    .query(`
      SELECT ISNULL(SUM(cantidad),0) AS q
      FROM dbo.stock WITH (UPDLOCK, HOLDLOCK)
      WHERE id_deposito = @dep
        AND id_articulo = @art
        AND (@ub IS NULL OR id_ubicacion = @ub)
    `);
  return Number(r.recordset?.[0]?.q || 0);
}

async function tryDescontarStock(trans, { depositoId, articuloId, ubicacionId, deltaNegativo }) {
  // deltaNegativo debe ser NEGATIVO (ej -5)
  const rq = new sql.Request(trans);
  const r = await rq
    .input("dep", sql.Int, depositoId)
    .input("art", sql.Int, articuloId)
    .input("ub", sql.Int, ubicacionId)
    .input("delta", sql.Int, deltaNegativo)
    .query(`
      UPDATE dbo.stock
      SET cantidad = cantidad + @delta
      WHERE id_deposito = @dep
        AND id_articulo = @art
        AND id_ubicacion = @ub
        AND (cantidad + @delta) >= 0;

      SELECT @@ROWCOUNT AS affected;
    `);

  return Number(r.recordset?.[0]?.affected || 0) === 1;
}

// UPSERT atómico (evita UQ_stock_art_dep en concurrencia)
// Ajusta cantidad = cantidad + @delta
async function upsertStockDelta(trans, { depositoId, articuloId, ubicacionId, delta }) {
  const rq = new sql.Request(trans);
  await rq
    .input("dep", sql.Int, depositoId)
    .input("art", sql.Int, articuloId)
    .input("ub", sql.Int, ubicacionId)
    .input("delta", sql.Int, delta)
    .query(`
      MERGE dbo.stock WITH (HOLDLOCK) AS t
      USING (SELECT @dep AS id_deposito, @art AS id_articulo, @ub AS id_ubicacion) AS s
      ON (
        t.id_deposito = s.id_deposito
        AND t.id_articulo = s.id_articulo
        AND t.id_ubicacion = s.id_ubicacion
      )
      WHEN MATCHED THEN
        UPDATE SET cantidad = t.cantidad + @delta
      WHEN NOT MATCHED THEN
        INSERT (id_deposito, id_articulo, id_ubicacion, cantidad)
        VALUES (s.id_deposito, s.id_articulo, s.id_ubicacion, @delta);
    `);
}

// Detecta si existe columna "usuario" en dbo.ajustes_detalles, para no romper tu DB si no la tiene
async function detallesTieneUsuario(trans) {
  const r = await new sql.Request(trans).query(`
    SELECT TOP 1 1 AS ok
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = 'dbo'
      AND TABLE_NAME = 'ajustes_detalles'
      AND COLUMN_NAME = 'usuario'
  `);
  return r.recordset.length > 0;
}

// Inserta detalle con o sin usuario según exista la columna
async function insertDetalle(trans, { ajusteId, cod, desc, cantidad, usuario }) {
  const conUsuario = await detallesTieneUsuario(trans);

  const rq = new sql.Request(trans)
    .input("nro", sql.Int, ajusteId)
    .input("cod", sql.VarChar, cod)
    .input("desc", sql.VarChar, desc || "")
    .input("cant", sql.Int, cantidad);

  if (conUsuario) rq.input("usr", sql.VarChar, usuario ?? null);

  await rq.query(
    conUsuario
      ? `
        INSERT INTO dbo.ajustes_detalles (ajuste_id, cod_articulo, descripcion, cantidad, usuario)
        VALUES (@nro, @cod, @desc, @cant, @usr)
      `
      : `
        INSERT INTO dbo.ajustes_detalles (ajuste_id, cod_articulo, descripcion, cantidad)
        VALUES (@nro, @cod, @desc, @cant)
      `
  );
}

// Busca motivo por id (valida activo)
async function requireMotivoActivo(trans, motivoId) {
  const r = await new sql.Request(trans)
    .input("id", sql.Int, motivoId)
    .query(`
      SELECT id_motivo, nombre, activo
      FROM dbo.ajustes_motivos WITH (UPDLOCK, HOLDLOCK)
      WHERE id_motivo = @id
    `);

  if (!r.recordset.length) throw new Error("Motivo inválido");
  if (!r.recordset[0].activo) throw new Error("Motivo inactivo");

  return {
    id_motivo: Number(r.recordset[0].id_motivo),
    nombre: String(r.recordset[0].nombre || ""),
  };
}

// Busca motivo por nombre (para import/dropbox)
async function getMotivoIdByNombreActivo(trans, nombreExactoUpper) {
  const r = await new sql.Request(trans)
    .input("n", sql.VarChar, nombreExactoUpper)
    .query(`
      SELECT TOP 1 id_motivo
      FROM dbo.ajustes_motivos WITH (UPDLOCK, HOLDLOCK)
      WHERE UPPER(LTRIM(RTRIM(nombre))) = @n
        AND activo = 1
      ORDER BY id_motivo
    `);

  if (!r.recordset.length) return null;
  return Number(r.recordset[0].id_motivo);
}

// ========================================================
// MOTIVOS (ABM)
// ========================================================
exports.getMotivos = async (_req, res) => {
  try {
    await poolConnect;
    const pool = await getPool();
    const r = await pool.request().query(`
      SELECT id_motivo, nombre, activo
      FROM dbo.ajustes_motivos
      ORDER BY activo DESC, nombre ASC
    `);
    res.json(r.recordset || []);
  } catch (err) {
    console.error("ajustes.getMotivos:", err);
    res.status(500).json({ error: "Error al listar motivos", detalle: err.message });
  }
};

exports.createMotivo = async (req, res) => {
  try {
    const nombre = String(req.body?.nombre ?? "").trim();
    if (!nombre) return res.status(400).json({ error: "Nombre obligatorio" });

    await poolConnect;
    const pool = await getPool();

    const r = await pool
      .request()
      .input("n", sql.VarChar, nombre)
      .query(`
        INSERT INTO dbo.ajustes_motivos (nombre, activo)
        VALUES (@n, 1);
        SELECT SCOPE_IDENTITY() AS id_motivo;
      `);

    return res.status(201).json({ ok: true, id_motivo: Number(r.recordset[0].id_motivo) });
  } catch (err) {
    if (String(err.message || "").toLowerCase().includes("unique")) {
      return res.status(400).json({ error: "Ya existe un motivo con ese nombre" });
    }
    console.error("ajustes.createMotivo:", err);
    res.status(500).json({ error: "Error al crear motivo", detalle: err.message });
  }
};

exports.updateMotivo = async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(400).json({ error: "ID inválido" });

    const nombre = req.body?.nombre != null ? String(req.body.nombre).trim() : null;
    const activo = req.body?.activo;

    if (nombre != null && !nombre) return res.status(400).json({ error: "Nombre inválido" });

    await poolConnect;
    const pool = await getPool();

    const rq = pool.request().input("id", sql.Int, id);
    if (nombre != null) rq.input("n", sql.VarChar, nombre);
    if (activo != null) rq.input("a", sql.Bit, activo ? 1 : 0);

    const r = await rq.query(`
      UPDATE dbo.ajustes_motivos
      SET
        nombre = COALESCE(@n, nombre),
        activo = COALESCE(@a, activo)
      WHERE id_motivo = @id;

      SELECT @@ROWCOUNT AS affected;
    `);

    if (Number(r.recordset[0].affected) !== 1)
      return res.status(404).json({ error: "Motivo no encontrado" });
    return res.json({ ok: true });
  } catch (err) {
    if (String(err.message || "").toLowerCase().includes("unique")) {
      return res.status(400).json({ error: "Ya existe un motivo con ese nombre" });
    }
    console.error("ajustes.updateMotivo:", err);
    res.status(500).json({ error: "Error al actualizar motivo", detalle: err.message });
  }
};

exports.deleteMotivo = async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(400).json({ error: "ID inválido" });

    await poolConnect;
    const pool = await getPool();

    const used = await pool.request().input("id", sql.Int, id).query(`
      SELECT TOP 1 1 AS used
      FROM dbo.ajustes
      WHERE motivo_id = @id
    `);
    if (used.recordset.length) {
      return res.status(400).json({
        error:
          "No se puede borrar: el motivo ya fue usado en ajustes. Desactiválo (activo=0).",
      });
    }

    const r = await pool.request().input("id", sql.Int, id).query(`
      DELETE FROM dbo.ajustes_motivos WHERE id_motivo = @id;
      SELECT @@ROWCOUNT AS affected;
    `);

    if (Number(r.recordset[0].affected) !== 1)
      return res.status(404).json({ error: "Motivo no encontrado" });
    return res.json({ ok: true });
  } catch (err) {
    console.error("ajustes.deleteMotivo:", err);
    res.status(500).json({ error: "Error al borrar motivo", detalle: err.message });
  }
};

// ========================================================
// GET /ajustes - lista cabeceras
// ========================================================
exports.getAll = async (_req, res) => {
  try {
    await poolConnect;
    const pool = await getPool();
    const r = await pool.request().query(`
      SELECT 
        a.numero_ajuste AS id,
        a.numero_ajuste,
        a.deposito,
        m.nombre AS motivo,
        a.fecha
      FROM dbo.ajustes a
      LEFT JOIN dbo.ajustes_motivos m ON m.id_motivo = a.motivo_id
      ORDER BY a.fecha DESC, a.numero_ajuste DESC
    `);
    res.json(r.recordset || []);
  } catch (err) {
    console.error("ajustes.getAll:", err);
    res.status(500).json({ error: "Error al listar ajustes", detalle: err.message });
  }
};

// ========================================================
// GET /ajustes/:id - cabecera + detalle
// ========================================================
exports.getById = async (req, res) => {
  try {
    const nro = Number(req.params.id);
    if (!Number.isInteger(nro)) return res.status(400).json({ error: "Número inválido" });

    await poolConnect;
    const pool = await getPool();

    const cab = await pool.request().input("n", sql.Int, nro).query(`
      SELECT 
        a.numero_ajuste AS id,
        a.numero_ajuste,
        a.deposito,
        a.motivo_id,
        m.nombre AS motivo,
        a.fecha,
        a.usuario
      FROM dbo.ajustes a
      LEFT JOIN dbo.ajustes_motivos m ON m.id_motivo = a.motivo_id
      WHERE a.numero_ajuste = @n
    `);
    if (!cab.recordset.length) return res.status(404).json({ error: "Ajuste no encontrado" });

    const det = await pool.request().input("n", sql.Int, nro).query(`
      SELECT 
        ajuste_id,
        cod_articulo,
        descripcion,
        cantidad
      FROM dbo.ajustes_detalles
      WHERE ajuste_id = @n
      ORDER BY cod_articulo
    `);

    res.json({ cabecera: cab.recordset[0], detalle: det.recordset || [] });
  } catch (err) {
    console.error("ajustes.getById:", err);
    res.status(500).json({ error: "Error al obtener detalle", detalle: err.message });
  }
};

/**
 * POST /ajustes
 * body: {
 *   deposito_id: number,
 *   id_ubicacion?: number|null,
 *   motivo_id: number,
 *   items: [{ cod_articulo: string, cantidad: number }]
 * }
 */
exports.create = async (req, res) => {
  const usuario = req.user?.username ?? req.user?.email ?? req.user?.name ?? null;

  const depositoId = asInt(req.body?.deposito_id);
  const ubicacionIdBody = req.body?.id_ubicacion ?? null;

  const motivoId = asInt(req.body?.motivo_id);
  if (!Number.isFinite(motivoId) || motivoId <= 0) {
    return res.status(400).json({ error: "Motivo obligatorio" });
  }

  const items = Array.isArray(req.body?.items) ? req.body.items : [];
  if (!Number.isFinite(depositoId) || !items.length) {
    return res
      .status(400)
      .json({ error: "Datos incompletos: depósito e items son obligatorios" });
  }

  // Consolidar items por código
  const agg = new Map();
  for (const it of items) {
    const cod = up(it?.cod_articulo);
    const cant = Number(it?.cantidad);
    if (!cod || !Number.isFinite(cant) || cant === 0) continue;
    agg.set(cod, (agg.get(cod) || 0) + cant);
  }
  const normItems = Array.from(agg.entries()).map(([cod, cant]) => ({ cod, cant }));
  if (!normItems.length) return res.status(400).json({ error: "Items inválidos" });

  let trans;
  try {
    await poolConnect;
    const pool = await getPool();
    trans = new sql.Transaction(pool);
    await trans.begin();

    // 1) Validar depósito
    const dep = await new sql.Request(trans)
      .input("d", sql.Int, depositoId)
      .query(`
        SELECT id_deposito, nombre
        FROM dbo.depositos WITH (UPDLOCK, HOLDLOCK)
        WHERE id_deposito = @d
      `);

    if (!dep.recordset.length) {
      await trans.rollback();
      return res.status(400).json({ error: `Depósito inexistente: ${depositoId}` });
    }
    const nombreDeposito = String(dep.recordset[0].nombre || "");

    // 1.b) Validar motivo
    let motivoNombre = "";
    try {
      const mot = await requireMotivoActivo(trans, motivoId);
      motivoNombre = mot.nombre;
    } catch (e) {
      await trans.rollback();
      return res.status(400).json({ error: e.message || "Motivo inválido" });
    }

    // 2) Resolver ubicación
    const ubicacionId = await resolveUbicacionId(trans, {
      depositoId,
      ubicacionId: ubicacionIdBody,
    });

    // 3) Resolver artículos por código
    const cods = normItems.map((i) => i.cod);
    const placeholders = cods.map((_, i) => `@c${i}`).join(",");
    const rqArts = new sql.Request(trans);
    cods.forEach((c, i) => rqArts.input(`c${i}`, sql.VarChar, c));

    const arts = await rqArts.query(`
      SELECT 
        id_articulo,
        UPPER(LTRIM(RTRIM(codigo))) AS cod,
        descripcion
      FROM dbo.articulos
      WHERE UPPER(LTRIM(RTRIM(codigo))) IN (${placeholders})
    `);

    const byCode = new Map(
      arts.recordset.map((r) => [
        r.cod,
        { id_articulo: Number(r.id_articulo), descripcion: String(r.descripcion || "") },
      ])
    );

    const faltantes = normItems.filter((i) => !byCode.has(i.cod)).map((i) => i.cod);
    if (faltantes.length) {
      await trans.rollback();
      return res.status(400).json({ error: "Códigos inexistentes", detalle: faltantes });
    }

    // 4) Validar stock proyectado
    for (const it of normItems) {
      const { id_articulo } = byCode.get(it.cod);
      const disponible = await getStockActual(trans, { depositoId, articuloId: id_articulo });
      const proyectado = disponible + it.cant;
      if (proyectado < 0) {
        await trans.rollback();
        return res.status(400).json({
          error: "Stock insuficiente para ajustar",
          detalle: {
            cod_articulo: it.cod,
            disponible,
            intento_ajuste: it.cant,
            quedaría: proyectado,
          },
        });
      }
    }

    // 5) Próximo nro
    const nroRes = await new sql.Request(trans).query(`
      SELECT ISNULL(MAX(numero_ajuste), 0) + 1 AS nextNro
      FROM dbo.ajustes WITH (UPDLOCK, HOLDLOCK)
    `);
    const nextNro = Number(nroRes.recordset[0].nextNro);

    // 6) Cabecera
    await new sql.Request(trans)
      .input("nro", sql.Int, nextNro)
      .input("depNom", sql.VarChar, nombreDeposito)
      .input("motId", sql.Int, motivoId)
      .input("motNom", sql.VarChar, motivoNombre) // legacy
      .input("usr", sql.VarChar, usuario)
      .query(`
        INSERT INTO dbo.ajustes (numero_ajuste, deposito, motivo_id, motivo, fecha, usuario)
        VALUES (@nro, @depNom, @motId, @motNom, GETDATE(), @usr)
      `);

    // 7) Detalles + stock
    for (const it of normItems) {
      const { id_articulo, descripcion } = byCode.get(it.cod);

      await insertDetalle(trans, {
        ajusteId: nextNro,
        cod: it.cod,
        desc: descripcion || "",
        cantidad: it.cant,
        usuario,
      });

      await upsertStockDelta(trans, {
        depositoId,
        articuloId: id_articulo,
        ubicacionId,
        delta: it.cant,
      });
    }

    await trans.commit();

    const creado = await (await getPool())
      .request()
      .input("n", sql.Int, nextNro)
      .query(`
        SELECT 
          a.numero_ajuste AS id,
          a.numero_ajuste,
          a.deposito,
          m.nombre AS motivo,
          a.fecha
        FROM dbo.ajustes a
        LEFT JOIN dbo.ajustes_motivos m ON m.id_motivo = a.motivo_id
        WHERE a.numero_ajuste = @n
      `);

    return res.status(201).json({ message: "Ajuste creado", ajuste: creado.recordset[0] });
  } catch (err) {
    console.error("ajustes.create:", err);
    try {
      if (trans) await trans.rollback();
    } catch {}
    return res.status(500).json({ error: "Error al crear ajuste", detalle: err.message });
  }
};

// ==========================
// DESCARGAR PLANTILLA
// ==========================
exports.downloadTemplate = (_req, res) => {
  try {
    const data = [["Código", "Tipo de movimiento", "Depósito", "Ubicación", "Cantidad"]];
    const ws = XLSX.utils.aoa_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Ajustes");
    const buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });

    res.setHeader("Content-Disposition", 'attachment; filename="Plantilla_Ajustes.xlsx"');
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    return res.status(200).send(buffer);
  } catch (err) {
    return res.status(500).json({ error: "Error al generar plantilla" });
  }
};

// ==========================
// IMPORTAR DESDE EXCEL  (requiere Depósito y Ubicación)
// ==========================
exports.importarDesdeExcel = async (req, res) => {
  if (!req.file) return res.status(400).json({ error: "No se recibió archivo" });

  let rows;
  try {
    const wb = XLSX.read(req.file.buffer, { type: "buffer" });
    const sheet = wb.Sheets[wb.SheetNames[0]];
    rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });
  } catch {
    return res.status(400).json({ error: "Archivo inválido" });
  }

  if (!rows || rows.length < 2) {
    return res.status(400).json({ error: "El Excel no tiene datos" });
  }

  rows.shift(); // header

  const errores = [];
  const movimientos = [];

  rows.forEach((r, i) => {
    const fila = i + 2;

    // Plantilla: Código | Tipo de movimiento | Depósito | Ubicación | Cantidad
    const [codRaw, tipoRaw, depRaw, ubRaw, cantRaw] = r;

    const cod = up(codRaw);
    const dep = toDb(depRaw);
    const ub = toDb(ubRaw);
    const tipo = String(tipoRaw || "").trim().toUpperCase();
    const cant = toNumber0(cantRaw);

    if (!cod) return errores.push({ fila, error: "Código vacío" });
    if (!dep) return errores.push({ fila, error: "Depósito vacío (obligatorio)" });
    if (!ub) return errores.push({ fila, error: "Ubicación vacía (obligatoria)" });
    if (!Number.isFinite(cant) || cant <= 0) return errores.push({ fila, error: "Cantidad inválida" });

    if (!["ENTRADA", "SALIDA"].includes(tipo)) {
      return errores.push({ fila, error: "Tipo inválido (use ENTRADA o SALIDA)" });
    }

    movimientos.push({ fila, cod, dep, ub, tipo, cant });
  });

  if (errores.length) return res.status(400).json({ errores });

  // Agrupar por depósito + ubicación
  const porKey = {};
  movimientos.forEach((m) => {
    const key = `${m.dep}||${m.ub}`;
    porKey[key] ??= [];
    porKey[key].push(m);
  });

  let trans;
  try {
    await poolConnect;
    const pool = await getPool();
    trans = new sql.Transaction(pool);
    await trans.begin();

    const motivoIdExcel = await getMotivoIdByNombreActivo(trans, "IMPORTACIÓN EXCEL");
    if (!motivoIdExcel) {
      throw new Error('Falta motivo "IMPORTACIÓN EXCEL" en dbo.ajustes_motivos (o está inactivo)');
    }

    const ajustes = [];

    for (const key of Object.keys(porKey)) {
      const [depNom, ubNom] = key.split("||");

      // 1) depósito por nombre
      const d = await new sql.Request(trans)
        .input("n", sql.VarChar, depNom)
        .query(`
          SELECT id_deposito, nombre
          FROM dbo.depositos WITH (UPDLOCK, HOLDLOCK)
          WHERE nombre = @n
        `);

      if (!d.recordset.length) throw new Error(`Depósito inexistente: ${depNom}`);
      const depId = Number(d.recordset[0].id_deposito);

      // 2) ubicación por nombre (obligatoria)
      const ubRes = await new sql.Request(trans)
        .input("dep", sql.Int, depId)
        .input("ubNom", sql.VarChar, ubNom)
        .query(`
          SELECT TOP 1 id_ubicacion
          FROM dbo.ubicaciones WITH (UPDLOCK, HOLDLOCK)
          WHERE id_deposito = @dep
            AND UPPER(LTRIM(RTRIM(nombre))) = UPPER(LTRIM(RTRIM(@ubNom)))
        `);

      if (!ubRes.recordset.length) {
        throw new Error(`Ubicación inexistente: "${ubNom}" para depósito "${depNom}"`);
      }
      const ubId = Number(ubRes.recordset[0].id_ubicacion);

      // 3) nro ajuste
      const rN = await new sql.Request(trans).query(`
        SELECT ISNULL(MAX(numero_ajuste),0)+1 AS n
        FROM dbo.ajustes WITH (UPDLOCK, HOLDLOCK)
      `);
      const nro = Number(rN.recordset[0].n);

      await new sql.Request(trans)
        .input("n", sql.Int, nro)
        .input("d", sql.VarChar, depNom)
        .input("mid", sql.Int, motivoIdExcel)
        .input("m", sql.VarChar, `IMPORTACIÓN EXCEL (${ubNom})`)
        .query(`
          INSERT INTO dbo.ajustes (numero_ajuste, deposito, motivo_id, motivo, fecha, usuario)
          VALUES(@n,@d,@mid,@m,GETDATE(),'sistema')
        `);

      // 4) consolidar por código
      const agg = new Map();
      for (const it of porKey[key]) {
        const sign = it.tipo === "SALIDA" ? -it.cant : it.cant;
        agg.set(it.cod, (agg.get(it.cod) || 0) + sign);
      }

      const merged = Array.from(agg.entries())
        .map(([cod, delta]) => ({ cod, delta: Math.trunc(delta) }))
        .filter((x) => x.delta !== 0);

      for (const it of merged) {
        const art = await new sql.Request(trans)
          .input("c", sql.VarChar, it.cod)
          .query(`
            SELECT id_articulo, descripcion
            FROM dbo.articulos
            WHERE UPPER(LTRIM(RTRIM(codigo))) = @c
          `);

        if (!art.recordset.length) throw new Error(`Código inexistente: ${it.cod}`);
        const idArt = Number(art.recordset[0].id_articulo);
        const desc = String(art.recordset[0].descripcion || "");

        // validar stock para salidas
        if (it.delta < 0) {
          const disponible = await getStockActual(trans, {
            depositoId: depId,
            articuloId: idArt,
            ubicacionId: ubId,
          });
          if (disponible + it.delta < 0) {
            throw new Error(`Stock insuficiente para ${it.cod} en ${depNom}/${ubNom}`);
          }
        }

        await insertDetalle(trans, {
          ajusteId: nro,
          cod: it.cod,
          desc,
          cantidad: it.delta,
          usuario: "sistema",
        });

        await upsertStockDelta(trans, {
          depositoId: depId,
          articuloId: idArt,
          ubicacionId: ubId,
          delta: it.delta,
        });
      }

      ajustes.push({ deposito: depNom, ubicacion: ubNom, numero_ajuste: nro });
    }

    await trans.commit();
    res.json({ ok: true, ajustes });
  } catch (e) {
    try {
      if (trans) await trans.rollback();
    } catch {}
    res.status(400).json({ error: String(e?.message || e) });
  }
};

// ==========================
// CONSUMIR PRODUCCIÓN (DROPBOX)
// ==========================
async function runConsumoProduccion() {
  let trans = null;
  let nextNro = null;

  await poolConnect;
  const pool = await getPool();

  try {
    // 0) leer fileRef (id:) desde DB
    const idRes = await pool
      .request()
      .input("k", sql.VarChar, "DROPBOX_PRODUCCION_FILE_ID")
      .query(`SELECT valor FROM dbo.app_settings WHERE clave = @k`);

    if (!idRes.recordset.length) {
      return { ok: false, error: "No existe configuración DROPBOX_PRODUCCION_FILE_ID" };
    }

    const fileRef = String(idRes.recordset[0].valor || "").trim();
    if (!fileRef) return { ok: false, error: "DROPBOX_PRODUCCION_FILE_ID vacío" };

    // 1) descargar excel
    const buffer = await downloadByPath(fileRef);
    const workbook = XLSX.read(buffer, { type: "buffer" });

    const ws = workbook.Sheets["materiales"];
    if (!ws) return { ok: false, error: 'No existe hoja "materiales"' };

    const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" });
    if (!rows.length) return { ok: true, message: "Hoja materiales vacía", ajustados: 0, fallidos: 0 };

    const header = rows[0];
    const dataRows = rows.slice(1);

    // 2) transacción
    trans = new sql.Transaction(pool);
    await trans.begin();

    const motivoIdDropbox = await getMotivoIdByNombreActivo(trans, "CONSUMO PRODUCCIÓN (DROPBOX)");
    if (!motivoIdDropbox) {
      await trans.rollback();
      return {
        ok: false,
        error:
          'Falta motivo "CONSUMO PRODUCCIÓN (DROPBOX)" en dbo.ajustes_motivos (o está inactivo)',
      };
    }

    // 2.1) depósito Producción
    const depRes = await new sql.Request(trans)
      .input("n", sql.VarChar, "Producción")
      .query(
        `SELECT id_deposito, nombre FROM dbo.depositos WITH (UPDLOCK, HOLDLOCK) WHERE nombre = @n`
      );

    if (!depRes.recordset.length) {
      await trans.rollback();
      return { ok: false, error: 'Depósito "Producción" no existe' };
    }

    const depositoId = Number(depRes.recordset[0].id_deposito);
    const depositoNombre = String(depRes.recordset[0].nombre || "");

    // 2.2) ubicación GENERAL
    const ubRes = await new sql.Request(trans)
      .input("dep", sql.Int, depositoId)
      .query(`
        SELECT TOP 1 id_ubicacion
        FROM dbo.ubicaciones WITH (UPDLOCK, HOLDLOCK)
        WHERE id_deposito = @dep
          AND UPPER(LTRIM(RTRIM(nombre))) = 'GENERAL'
      `);

    if (!ubRes.recordset.length) {
      await trans.rollback();
      return {
        ok: false,
        error: 'Ubicación "GENERAL" no existe para depósito "Producción". Creala para continuar.',
      };
    }

    const ubicacionId = Number(ubRes.recordset[0].id_ubicacion);

    // 3) procesar filas
    const okItems = [];
    const failItems = [];
    const agg = new Map(); // codigo -> { desc, deltaNegativo }

    for (let i = 0; i < dataRows.length; i++) {
      const excelRowIndex = i + 2;
      const r = dataRows[i];

      const colA = String(r[0] ?? "").trim();
      if (!colA) break;

      const codigo = up(r[1]);
      if (!codigo) {
        failItems.push({ row: excelRowIndex, codigo: null, reason: "Código vacío (col B)" });
        continue;
      }

      const f = toNumber0(r[5]);
      const g = toNumber0(r[6]);

      if (g >= f) continue;

      const delta = Math.trunc(f - g);
      if (delta <= 0) continue;

      const artRes = await new sql.Request(trans)
        .input("c", sql.VarChar, codigo)
        .query(`
          SELECT TOP 1 id_articulo, descripcion
          FROM dbo.articulos WITH (UPDLOCK, HOLDLOCK)
          WHERE UPPER(LTRIM(RTRIM(codigo))) = @c
        `);

      if (!artRes.recordset.length) {
        failItems.push({ row: excelRowIndex, codigo, reason: "Código no existe en dbo.articulos" });
        continue;
      }

      const idArt = Number(artRes.recordset[0].id_articulo);
      const desc = String(artRes.recordset[0].descripcion || "");

      // debe existir registro en stock (no crear)
      const existsStock = await new sql.Request(trans)
        .input("dep", sql.Int, depositoId)
        .input("art", sql.Int, idArt)
        .input("ub", sql.Int, ubicacionId)
        .query(`
          SELECT TOP 1 cantidad
          FROM dbo.stock WITH (UPDLOCK, HOLDLOCK)
          WHERE id_deposito = @dep AND id_articulo = @art AND id_ubicacion = @ub
        `);

      if (!existsStock.recordset.length) {
        failItems.push({
          row: excelRowIndex,
          codigo,
          reason: "No existe registro en dbo.stock para Producción/GENERAL (no se crea)",
        });
        continue;
      }

      const disponible = Number(existsStock.recordset[0].cantidad || 0);
      if (disponible < delta) {
        failItems.push({
          row: excelRowIndex,
          codigo,
          reason: "Stock insuficiente (negativo prohibido)",
          faltante: delta - disponible,
        });
        continue;
      }

      const ok = await tryDescontarStock(trans, {
        depositoId,
        articuloId: idArt,
        ubicacionId,
        deltaNegativo: -delta,
      });

      if (!ok) {
        failItems.push({
          row: excelRowIndex,
          codigo,
          reason: "No se pudo descontar (condición de stock/registro)",
        });
        continue;
      }

      // marcar excel: G = F
      r[6] = f;

      okItems.push({ row: excelRowIndex, codigo, idArt, desc, delta });

      const prev = agg.get(codigo);
      agg.set(codigo, {
        desc,
        delta: (prev?.delta || 0) - delta,
      });
    }

    // si no hay nada: rollback
    if (okItems.length === 0) {
      await trans.rollback();
      return {
        ok: true,
        message: "No hay diferencias para ajustar",
        ajustados: 0,
        fallidos: failItems.length,
        resumen_fallidos: failItems.slice(0, 50),
      };
    }

    // 4) cabecera ajuste
    const nroRes = await new sql.Request(trans).query(`
      SELECT ISNULL(MAX(numero_ajuste), 0) + 1 AS nextNro
      FROM dbo.ajustes WITH (UPDLOCK, HOLDLOCK)
    `);
    nextNro = Number(nroRes.recordset[0].nextNro);

    await new sql.Request(trans)
      .input("nro", sql.Int, nextNro)
      .input("depNom", sql.VarChar, depositoNombre)
      .input("motId", sql.Int, motivoIdDropbox)
      .input("mot", sql.VarChar, "CONSUMO PRODUCCIÓN (DROPBOX)")
      .input("usr", sql.VarChar, "sistema")
      .query(`
        INSERT INTO dbo.ajustes (numero_ajuste, deposito, motivo_id, motivo, fecha, usuario)
        VALUES (@nro, @depNom, @motId, @mot, GETDATE(), @usr)
      `);

    // 5) detalles consolidado
    for (const [codigo, v] of agg.entries()) {
      await insertDetalle(trans, {
        ajusteId: nextNro,
        cod: codigo,
        desc: v.desc || "",
        cantidad: v.delta,
        usuario: "sistema",
      });
    }

    // 6) re-escribir excel
    const outRows = [header, ...dataRows];
    workbook.Sheets["materiales"] = XLSX.utils.aoa_to_sheet(outRows);
    const outBuffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });

    // 7) subir overwrite
    await uploadOverwriteByPath(fileRef, outBuffer);

    // 8) commit
    await trans.commit();

    return {
      ok: true,
      numero_ajuste: nextNro,
      ajustados: okItems.length,
      fallidos: failItems.length,
      resumen_fallidos: failItems.slice(0, 50),
    };
  } catch (err) {
    if (trans) {
      try {
        await trans.rollback();
      } catch {}
    }
    throw err;
  }
}

// Endpoint (botón)
exports.consumirProduccionDropbox = async (_req, res) => {
  try {
    const result = await runConsumoProduccion();
    return res.json(result);
  } catch (err) {
    const status = err?.response?.status;
    const dropboxBody = err?.response?.data;
    console.error("consumirProduccionDropbox ERROR:", { message: err.message, status, dropboxBody });
    return res.status(500).json({
      error: "Error al consumir producción",
      detalle: err.message,
      status,
      dropbox: dropboxBody || null,
    });
  }
};

// Export interno para cron
exports._runConsumoProduccion = runConsumoProduccion;