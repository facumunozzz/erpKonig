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
    .replace(/,(?=\d{3}(\D|$))/g, "")  // quita miles con coma
    .replace(",", ".");                // decimal coma -> punto

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
// IMPORTANTE: id_ubicacion NO puede ser NULL en tu tabla => se incluye en el INSERT
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


// ========================================================
// GET /ajustes - lista cabeceras
// ========================================================
exports.getAll = async (_req, res) => {
  try {
    await poolConnect;
    const pool = await getPool();
    const r = await pool.request().query(`
      SELECT 
        numero_ajuste AS id,
        numero_ajuste,
        deposito,
        motivo,
        fecha
      FROM dbo.ajustes
      ORDER BY fecha DESC, numero_ajuste DESC
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
        numero_ajuste AS id,
        numero_ajuste,
        deposito,
        motivo,
        fecha
      FROM dbo.ajustes
      WHERE numero_ajuste = @n
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
 *   motivo: string|null,
 *   items: [{ cod_articulo: string, cantidad: number }]
 * }
 */
exports.create = async (req, res) => {
  // ✅ IMPORTANTE: usuario se define DENTRO del handler (afuera no existe req)
  const usuario =
    req.user?.username ??
    req.user?.email ??
    req.user?.name ??
    null;

  const depositoId = asInt(req.body?.deposito_id);
  const ubicacionIdBody = req.body?.id_ubicacion ?? null;
  const motivo = req.body?.motivo ?? null;
  const items = Array.isArray(req.body?.items) ? req.body.items : [];

  if (!Number.isFinite(depositoId) || !items.length) {
    return res.status(400).json({ error: "Datos incompletos: depósito e items son obligatorios" });
  }

  // Consolidar items por código (evita duplicados dentro del mismo ajuste)
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

    // 1) Validar depósito y obtener nombre
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
    const nombreDeposito = dep.recordset[0].nombre;

    // 2) Resolver ubicación (NO NULL) para este ajuste
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
      arts.recordset.map((r) => [r.cod, { id_articulo: r.id_articulo, descripcion: r.descripcion }])
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
          detalle: { cod_articulo: it.cod, disponible, intento_ajuste: it.cant, quedaría: proyectado },
        });
      }
    }

    // 5) Generar próximo numero_ajuste
    const nroRes = await new sql.Request(trans).query(`
      SELECT ISNULL(MAX(numero_ajuste), 0) + 1 AS nextNro
      FROM dbo.ajustes WITH (UPDLOCK, HOLDLOCK)
    `);
    const nextNro = Number(nroRes.recordset[0].nextNro);

    // 6) Insert cabecera ✅ (antes faltaba @usr en VALUES)
    await new sql.Request(trans)
      .input("nro", sql.Int, nextNro)
      .input("depNom", sql.VarChar, nombreDeposito)
      .input("mot", sql.VarChar, toDb(motivo))
      .input("usr", sql.VarChar, usuario)
      .query(`
        INSERT INTO dbo.ajustes (numero_ajuste, deposito, motivo, fecha, usuario)
        VALUES (@nro, @depNom, @mot, GETDATE(), @usr)
      `);

    // 7) Detalle + aplicar ajustes al stock (MERGE atómico)
    // ⚠️ OJO: solo agrego "usuario" en detalles si tu tabla lo tiene.
    // Si NO existe esa columna en dbo.ajustes_detalles, COMENTÁ usuario y dejá el INSERT sin usuario.
    for (const it of normItems) {
      const { id_articulo, descripcion } = byCode.get(it.cod);

      await new sql.Request(trans)
        .input("nro", sql.Int, nextNro)
        .input("cod", sql.VarChar, it.cod)
        .input("desc", sql.VarChar, descripcion || "")
        .input("cant", sql.Int, it.cant)
        .input("usr", sql.VarChar, usuario)
        .query(`
          INSERT INTO dbo.ajustes_detalles (ajuste_id, cod_articulo, descripcion, cantidad, usuario)
          VALUES (@nro, @cod, @desc, @cant, @usr)
        `);

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
          numero_ajuste AS id,
          numero_ajuste,
          deposito,
          motivo,
          fecha
        FROM dbo.ajustes
        WHERE numero_ajuste = @n
      `);

    return res.status(201).json({ message: "Ajuste creado", ajuste: creado.recordset[0] });
  } catch (err) {
    console.error("ajustes.create:", err);
    try { if (trans) await trans.rollback(); } catch {}
    return res.status(500).json({ error: "Error al crear ajuste", detalle: err.message });
  }
};

// ==========================
// DESCARGAR PLANTILLA
// ==========================
exports.downloadTemplate = (_req, res) => {
  try {
    // No agrego Ubicación para no romper tu flujo actual:
    // el backend resuelve GENERAL automáticamente.
    const data = [["Código", "Tipo de movimiento", "Depósito", "Ubicación", "Cantidad"]];
    const ws = XLSX.utils.aoa_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Ajustes");
    const buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });

    res.setHeader("Content-Disposition", 'attachment; filename="Plantilla_Ajustes.xlsx"');
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
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

    // Validaciones duras: depósito y ubicación son obligatorios
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

  // Agrupar por depósito + ubicación (porque ahora ubicación importa)
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

    const ajustes = [];

    for (const key of Object.keys(porKey)) {
      const [depNom, ubNom] = key.split("||");

      // 1) resolver depósito por nombre
      const d = await new sql.Request(trans)
        .input("n", sql.VarChar, depNom)
        .query(`
          SELECT id_deposito, nombre
          FROM dbo.depositos WITH (UPDLOCK, HOLDLOCK)
          WHERE nombre = @n
        `);

      if (!d.recordset.length) {
        throw new Error(`Depósito inexistente: ${depNom}`);
      }

      const depId = Number(d.recordset[0].id_deposito);

      // 2) resolver ubicación por NOMBRE dentro de ese depósito (OBLIGATORIA)
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

      // 3) generar nro_ajuste
      const rN = await new sql.Request(trans).query(`
        SELECT ISNULL(MAX(numero_ajuste),0)+1 AS n
        FROM dbo.ajustes WITH (UPDLOCK, HOLDLOCK)
      `);
      const nro = Number(rN.recordset[0].n);

      await new sql.Request(trans)
        .input("n", sql.Int, nro)
        .input("d", sql.VarChar, depNom)
        .input("m", sql.VarChar, `IMPORTACIÓN EXCEL (${ubNom})`)
        .query(`
          INSERT INTO dbo.ajustes (numero_ajuste, deposito, motivo, fecha)
          VALUES(@n,@d,@m,GETDATE())
        `);

      // 4) Consolidar por código (dentro de ese depósito+ubicación)
      const agg = new Map();
      for (const it of porKey[key]) {
        const sign = it.tipo === "SALIDA" ? -it.cant : it.cant;
        agg.set(it.cod, (agg.get(it.cod) || 0) + sign);
      }

      const merged = Array.from(agg.entries())
        .map(([cod, delta]) => ({ cod, delta: Math.trunc(delta) }))
        .filter((x) => x.delta !== 0);

      for (const it of merged) {
        // artículo por código
        const art = await new sql.Request(trans)
          .input("c", sql.VarChar, it.cod)
          .query(`
            SELECT id_articulo, descripcion
            FROM dbo.articulos
            WHERE UPPER(LTRIM(RTRIM(codigo))) = @c
          `);

        if (!art.recordset.length) throw new Error(`Código inexistente: ${it.cod}`);
        const idArt = Number(art.recordset[0].id_articulo);
        const desc = art.recordset[0].descripcion || "";

        // validar stock SOLO para salidas (delta negativo)
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

        // detalle
        await new sql.Request(trans)
          .input("n", sql.Int, nro)
          .input("c", sql.VarChar, it.cod)
          .input("d", sql.VarChar, desc)
          .input("q", sql.Int, it.delta)
          .query(`
            INSERT INTO dbo.ajustes_detalles (ajuste_id, cod_articulo, descripcion, cantidad)
            VALUES(@n,@c,@d,@q)
          `);

        // aplicar delta al stock (en ESA ubicación)
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
// CONSUMIR PRODUCCIÓN (DROPBOX)  ✅ motor reusable
// ==========================
async function runConsumoProduccion() {
  let trans = null;
  let nextNro = null;

  await poolConnect;
  const pool = await getPool();

  try {
    // 0) leer fileRef (id:) desde DB
    const idRes = await pool.request()
      .input("k", sql.VarChar, "DROPBOX_PRODUCCION_FILE_ID")
      .query(`SELECT valor FROM dbo.app_settings WHERE clave = @k`);

    if (!idRes.recordset.length) {
      return { ok: false, error: "No existe configuración DROPBOX_PRODUCCION_FILE_ID" };
    }

    const fileRef = String(idRes.recordset[0].valor || "").trim();
    if (!fileRef) return { ok: false, error: "DROPBOX_PRODUCCION_FILE_ID vacío" };

    // 1) descargar excel (Dropbox API)
    const buffer = await downloadByPath(fileRef);
    const workbook = XLSX.read(buffer, { type: "buffer" });

    const ws = workbook.Sheets["materiales"];
    if (!ws) return { ok: false, error: 'No existe hoja "materiales"' };

    const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" });
    if (!rows.length) return { ok: true, message: "Hoja materiales vacía", ajustados: 0, fallidos: 0 };

    const header = rows[0];
    const dataRows = rows.slice(1);

    // 2) transacción (un ajuste por corrida)
    trans = new sql.Transaction(pool);
    await trans.begin();

    // 2.1) resolver depósito "Producción"
    const depRes = await new sql.Request(trans)
      .input("n", sql.VarChar, "Producción")
      .query(`SELECT id_deposito, nombre FROM dbo.depositos WITH (UPDLOCK, HOLDLOCK) WHERE nombre = @n`);

    if (!depRes.recordset.length) {
      await trans.rollback();
      return { ok: false, error: 'Depósito "Producción" no existe' };
    }

    const depositoId = Number(depRes.recordset[0].id_deposito);
    const depositoNombre = depRes.recordset[0].nombre;

    // 2.2) resolver ubicación GENERAL (obligatoria)
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
        error: 'Ubicación "GENERAL" no existe para depósito "Producción". Creala para continuar.'
      };
    }

    const ubicacionId = Number(ubRes.recordset[0].id_ubicacion);

    // 3) procesar filas (primero acumulamos y actualizamos stock)
    const okItems = [];
    const failItems = [];
    const agg = new Map(); // codigo -> { desc, deltaNegativo }

    for (let i = 0; i < dataRows.length; i++) {
      const excelRowIndex = i + 2;
      const r = dataRows[i];

      // "columna A siempre tiene algo" -> usamos A como fin si vacío
      const colA = String(r[0] ?? "").trim();
      if (!colA) break;

      // código en columna B (index 1)
      const codigo = up(r[1]);
      if (!codigo) {
        failItems.push({ row: excelRowIndex, codigo: null, reason: "Código vacío (col B)" });
        continue;
      }

      // F y G
      const f = toNumber0(r[5]);
      const g = toNumber0(r[6]);

      if (g >= f) continue;

      const delta = Math.trunc(f - g);
      if (delta <= 0) continue;

      // resolver artículo
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
        failItems.push({ row: excelRowIndex, codigo, reason: "No existe registro en dbo.stock para Producción/GENERAL (no se crea)" });
        continue;
      }

      const disponible = Number(existsStock.recordset[0].cantidad || 0);
      if (disponible < delta) {
        failItems.push({
          row: excelRowIndex,
          codigo,
          reason: "Stock insuficiente (negativo prohibido)",
          faltante: delta - disponible
        });
        continue;
      }

      // descuento seguro
      const ok = await tryDescontarStock(trans, {
        depositoId,
        articuloId: idArt,
        ubicacionId,
        deltaNegativo: -delta
      });

      if (!ok) {
        failItems.push({ row: excelRowIndex, codigo, reason: "No se pudo descontar (condición de stock/registro)" });
        continue;
      }

      // marcar excel: G = F
      r[6] = f;

      okItems.push({ row: excelRowIndex, codigo, idArt, desc, delta });

      // consolidar detalle (negativo)
      const prev = agg.get(codigo);
      agg.set(codigo, {
        desc,
        delta: (prev?.delta || 0) - delta
      });
    }

    // Si no hay nada para ajustar: rollback y listo (NO generamos ajuste)
    if (okItems.length === 0) {
      await trans.rollback();
      return {
        ok: true,
        message: "No hay diferencias para ajustar",
        ajustados: 0,
        fallidos: failItems.length,
        resumen_fallidos: failItems.slice(0, 50)
      };
    }

    // 4) crear cabecera de ajuste (1 por corrida) SOLO si hubo ajustes
    const nroRes = await new sql.Request(trans).query(`
      SELECT ISNULL(MAX(numero_ajuste), 0) + 1 AS nextNro
      FROM dbo.ajustes WITH (UPDLOCK, HOLDLOCK)
    `);
    nextNro = Number(nroRes.recordset[0].nextNro);

    await new sql.Request(trans)
      .input("nro", sql.Int, nextNro)
      .input("depNom", sql.VarChar, depositoNombre)
      .input("mot", sql.VarChar, "CONSUMO PRODUCCIÓN (DROPBOX)")
      .input("usr", sql.VarChar, "sistema")
      .query(`
        INSERT INTO dbo.ajustes (numero_ajuste, deposito, motivo, fecha, usuario)
        VALUES (@nro, @depNom, @mot, GETDATE(), @usr)
      `);

    // 5) insertar detalles del ajuste (consolidado)
    // ✅ igual que arriba: guardamos usuario en cabecera, detalle sin usuario/sistema
    for (const [codigo, v] of agg.entries()) {
      await new sql.Request(trans)
        .input("nro", sql.Int, nextNro)
        .input("cod", sql.VarChar, codigo)
        .input("desc", sql.VarChar, v.desc || "")
        .input("cant", sql.Int, v.delta)
        .input("usr", sql.VarChar, "sistema")
        .query(`
          INSERT INTO dbo.ajustes_detalles (ajuste_id, cod_articulo, descripcion, cantidad)
          VALUES (@nro, @cod, @desc, @cant)
        `);
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
      try { await trans.rollback(); } catch {}
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