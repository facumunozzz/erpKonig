// backend/controllers/remitos.js
const { sql, poolConnect, getPool } = require("../db");

const up = (v) => String(v ?? "").trim().toUpperCase();
const asInt = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : NaN;
};

const ESTADO_DEFAULT = "CONFIRMADO";

// ==========================
// Helpers
// ==========================
async function resolveDeposito(pool, { deposito_id, deposito_nombre }) {
  if (deposito_id != null) {
    const id = asInt(deposito_id);
    if (!Number.isFinite(id) || id <= 0) return null;

    const r = await pool.request().input("id", sql.Int, id).query(`
      SELECT id_deposito, nombre
      FROM dbo.depositos WITH (NOLOCK)
      WHERE id_deposito = @id
    `);
    if (!r.recordset.length) return null;
    return { id_deposito: Number(r.recordset[0].id_deposito), nombre: r.recordset[0].nombre };
  }

  const nom = String(deposito_nombre ?? "").trim();
  if (!nom) return null;

  const r = await pool.request().input("n", sql.VarChar(200), nom).query(`
    SELECT TOP 1 id_deposito, nombre
    FROM dbo.depositos WITH (NOLOCK)
    WHERE UPPER(LTRIM(RTRIM(nombre))) = UPPER(LTRIM(RTRIM(@n)))
  `);
  if (!r.recordset.length) return null;
  return { id_deposito: Number(r.recordset[0].id_deposito), nombre: r.recordset[0].nombre };
}

async function resolveUbicacionOrGeneral(pool, depositoId, idUbicNullable) {
  if (idUbicNullable != null) {
    const idU = asInt(idUbicNullable);
    if (!Number.isFinite(idU) || idU <= 0) return null;

    const r = await pool.request().input("u", sql.Int, idU).query(`
      SELECT id_ubicacion, id_deposito, nombre, activa
      FROM dbo.ubicaciones WITH (NOLOCK)
      WHERE id_ubicacion = @u AND activa = 1
    `);
    if (!r.recordset.length) return null;
    if (Number(r.recordset[0].id_deposito) !== Number(depositoId)) return null;
    return r.recordset[0];
  }

  // GENERAL
  const g = await pool.request().input("dep", sql.Int, depositoId).query(`
    SELECT TOP 1 id_ubicacion, id_deposito, nombre
    FROM dbo.ubicaciones WITH (NOLOCK)
    WHERE id_deposito = @dep AND activa = 1
      AND UPPER(LTRIM(RTRIM(nombre))) = 'GENERAL'
    ORDER BY id_ubicacion
  `);
  if (g.recordset[0]) return g.recordset[0];

  // primera activa
  const any = await pool.request().input("dep", sql.Int, depositoId).query(`
    SELECT TOP 1 id_ubicacion, id_deposito, nombre
    FROM dbo.ubicaciones WITH (NOLOCK)
    WHERE id_deposito = @dep AND activa = 1
    ORDER BY id_ubicacion
  `);
  return any.recordset[0] || null;
}

async function upsertStockUbicDelta(tr, { idUbicacion, idArticulo, delta }) {
  // stock_ubicaciones: (id_ubicacion, id_articulo, cantidad int)
  const r = new sql.Request(tr);
  await r
    .input("u", sql.Int, idUbicacion)
    .input("a", sql.Int, idArticulo)
    .input("d", sql.Int, delta)
    .query(`
      MERGE dbo.stock_ubicaciones WITH (HOLDLOCK) AS t
      USING (SELECT @u AS id_ubicacion, @a AS id_articulo) AS s
        ON (t.id_ubicacion = s.id_ubicacion AND t.id_articulo = s.id_articulo)
      WHEN MATCHED THEN
        UPDATE SET cantidad = t.cantidad + @d
      WHEN NOT MATCHED THEN
        INSERT (id_ubicacion, id_articulo, cantidad)
        VALUES (s.id_ubicacion, s.id_articulo, @d);
    `);
}

async function upsertStockDelta(tr, { idDeposito, idUbicacion, idArticulo, delta }) {
  const r = new sql.Request(tr);

  await r
    .input("dep", sql.Int, idDeposito)
    .input("ub", sql.Int, idUbicacion)
    .input("a", sql.Int, idArticulo)
    .input("d", sql.Decimal(18, 2), delta)
    .query(`
      MERGE dbo.stock WITH (HOLDLOCK) AS t
      USING (
        SELECT 
          @dep AS id_deposito,
          @ub AS id_ubicacion,
          @a  AS id_articulo
      ) AS s
        ON (
          t.id_deposito = s.id_deposito
          AND t.id_ubicacion = s.id_ubicacion
          AND t.id_articulo = s.id_articulo
        )
      WHEN MATCHED THEN
        UPDATE SET 
          cantidad = ISNULL(t.cantidad,0) + @d
      WHEN NOT MATCHED THEN
        INSERT (
          id_deposito,
          id_ubicacion,
          id_articulo,
          cantidad,
          asignado
        )
        VALUES (
          s.id_deposito,
          s.id_ubicacion,
          s.id_articulo,
          @d,
          0
        );
    `);
}

// ==========================
// GET /remitos
// ==========================
exports.getAll = async (_req, res) => {
  try {
    await poolConnect;
    const pool = await getPool();
    const r = await pool.request().query(`
      SELECT
        numero_remito AS id,
        numero_remito,
        deposito_nombre AS deposito,
        deposito_id,
        tipo,
        usuario,
        observacion,
        estado,
        fecha
      FROM dbo.remitos WITH (NOLOCK)
      ORDER BY fecha DESC, numero_remito DESC
    `);
    res.json(r.recordset || []);
  } catch (err) {
    console.error("remitos.getAll:", err);
    res.status(500).json({ error: "Error al listar remitos", detalle: err.message });
  }
};

// ==========================
// GET /remitos/:id
// ==========================
exports.getById = async (req, res) => {
  try {
    const nro = String(req.params.id ?? "").trim();
    if (!nro) return res.status(400).json({ error: "ID inválido" });

    await poolConnect;
    const pool = await getPool();

    const cab = await pool.request().input("n", sql.VarChar(50), nro).query(`
      SELECT
        numero_remito AS id,
        numero_remito,
        deposito_nombre AS deposito,
        deposito_id,
        tipo,
        usuario,
        observacion,
        estado,
        fecha
      FROM dbo.remitos WITH (NOLOCK)
      WHERE numero_remito = @n
    `);

    if (!cab.recordset.length) return res.status(404).json({ error: "Remito no encontrado" });

    const det = await pool.request().input("n", sql.VarChar(50), nro).query(`
      SELECT
        d.cod_articulo,
        d.descripcion,
        d.cantidad,
        d.id_ubicacion,
        u.nombre AS ubicacion_nombre
      FROM dbo.remitos_detalles d WITH (NOLOCK)
      LEFT JOIN dbo.ubicaciones u WITH (NOLOCK)
        ON u.id_ubicacion = d.id_ubicacion
      WHERE d.remito_id = @n
      ORDER BY d.cod_articulo
    `);

    res.json({ cabecera: cab.recordset[0], detalle: det.recordset || [] });
  } catch (err) {
    console.error("remitos.getById:", err);
    res.status(500).json({ error: "Error al obtener detalle", detalle: err.message });
  }
};

// ==========================
// GET /remitos/articulo?codigo=XXX
// (autocompletar por código o barra)
// ==========================
exports.getArticuloByCodigo = async (req, res) => {
  try {
    const q = up(req.query?.codigo);
    if (!q) return res.status(400).json({ error: "Debe indicar ?codigo=" });

    await poolConnect;
    const pool = await getPool();

    const r = await pool
      .request()
      .input("q", sql.VarChar(80), q)
      .query(`
        SELECT TOP 1
          id_articulo,
          UPPER(LTRIM(RTRIM(codigo))) AS codigo,
          descripcion
        FROM dbo.articulos WITH (NOLOCK)
        WHERE UPPER(LTRIM(RTRIM(codigo))) = @q
           OR (cod_barra IS NOT NULL AND UPPER(LTRIM(RTRIM(cod_barra))) = @q)
        ORDER BY id_articulo DESC
      `);

    if (!r.recordset.length) return res.status(404).json({ error: "Artículo no encontrado" });
    return res.json(r.recordset[0]);
  } catch (err) {
    console.error("remitos.getArticuloByCodigo:", err);
    res.status(500).json({ error: "Error al buscar artículo", detalle: err.message });
  }
};

// ==========================
// POST /remitos
// body:
// {
//   nro_remito, tipo, deposito_id?, deposito_nombre?,
//   usuario?, observacion?,
//   items: [{ cod_articulo, cantidad, id_ubicacion? }]
// }
// ==========================
exports.create = async (req, res) => {
  const body = req.body || {};

  const nro_remito = String(body.nro_remito ?? "").trim();
  const tipo = up(body.tipo); // ENTRADA | SALIDA
  const usuario = body.usuario != null ? String(body.usuario).trim() : null;
  const observacion = body.observacion != null ? String(body.observacion).trim() : null;

  const itemsRaw = Array.isArray(body.items) ? body.items : [];

  if (!nro_remito || (tipo !== "ENTRADA" && tipo !== "SALIDA") || !itemsRaw.length) {
    return res.status(400).json({ error: "Datos incompletos (nro_remito, tipo, items)" });
  }

  const normItems = itemsRaw
    .map((it) => ({
      cod: up(it.cod_articulo ?? it.cod ?? it.codigo),
      cant: asInt(it.cantidad),
      id_ubicacion: it.id_ubicacion == null ? null : asInt(it.id_ubicacion),
    }))
    .filter((i) => i.cod && Number.isFinite(i.cant) && i.cant > 0);

  if (!normItems.length) return res.status(400).json({ error: "Ítems inválidos" });

  let trans;
  try {
    await poolConnect;
    const pool = await getPool();

    // 0) Depósito
    const dep = await resolveDeposito(pool, {
      deposito_id: body.deposito_id,
      deposito_nombre: body.deposito_nombre,
    });

    if (!dep) {
      return res.status(400).json({ error: "Depósito inválido o inexistente" });
    }

    // 1) Transacción
    trans = new sql.Transaction(pool);
    await trans.begin();

    const execT = async (sqlText, bindFn) => {
      const r = new sql.Request(trans);
      if (bindFn) bindFn(r);
      return r.query(sqlText);
    };

    // 2) Remito único
    const chk = await execT(
      `SELECT 1 FROM dbo.remitos WITH (UPDLOCK, HOLDLOCK) WHERE numero_remito = @n`,
      (r) => r.input("n", sql.VarChar(50), nro_remito)
    );
    if (chk.recordset.length) {
      await trans.rollback();
      return res.status(400).json({ error: "Número de remito ya existe" });
    }

    // 3) Resolver artículos
    const cods = Array.from(new Set(normItems.map((i) => i.cod)));
    const ph = cods.map((_, i) => `@c${i}`).join(",");
    const rqArts = new sql.Request(trans);
    cods.forEach((c, i) => rqArts.input(`c${i}`, sql.VarChar(80), c));

    const arts = await rqArts.query(`
      SELECT id_articulo,
             UPPER(LTRIM(RTRIM(codigo))) AS cod,
             descripcion
      FROM dbo.articulos WITH (NOLOCK)
      WHERE UPPER(LTRIM(RTRIM(codigo))) IN (${ph})
    `);

    const byCod = new Map(arts.recordset.map((r) => [r.cod, r]));
    const faltan = cods.filter((c) => !byCod.has(c));
    if (faltan.length) {
      await trans.rollback();
      return res.status(400).json({ error: "Códigos inexistentes", detalle: faltan });
    }

    // 4) Resolver ubicaciones por ítem (si no viene => GENERAL)
    //    Validar que pertenezcan al depósito
    const itemsResolved = [];
    for (const it of normItems) {
      const u = await resolveUbicacionOrGeneral(pool, dep.id_deposito, it.id_ubicacion);
      if (!u) {
        await trans.rollback();
        return res.status(400).json({
          error: "Ubicación inválida o no pertenece al depósito",
          detalle: { cod_articulo: it.cod, id_ubicacion: it.id_ubicacion },
        });
      }
      itemsResolved.push({ ...it, id_ubicacion: Number(u.id_ubicacion), ubicacion_nombre: u.nombre });
    }

    // 5) Validar stock si SALIDA (por ubicación)
    if (tipo === "SALIDA") {
      for (const it of itemsResolved) {
        const art = byCod.get(it.cod);
        const idArt = Number(art.id_articulo);

        const r = await execT(
          `
          SELECT ISNULL(SUM(cantidad),0) AS q
          FROM dbo.stock_ubicaciones WITH (UPDLOCK, HOLDLOCK)
          WHERE id_ubicacion = @u AND id_articulo = @a
          `,
          (rq) => rq.input("u", sql.Int, it.id_ubicacion).input("a", sql.Int, idArt)
        );

        const disp = Number(r.recordset?.[0]?.q || 0);
        if (disp < it.cant) {
          await trans.rollback();
          return res.status(400).json({
            error: "Stock insuficiente en ubicación",
            detalle: { cod_articulo: it.cod, id_ubicacion: it.id_ubicacion, disponible: disp, requerido: it.cant },
          });
        }
      }
    }

    // 6) Insert cabecera (incluye estado)
    await execT(
      `
      INSERT INTO dbo.remitos
        (numero_remito, fecha, deposito_id, deposito_nombre, tipo, usuario, observacion, estado)
      VALUES
        (@n, GETDATE(), @depId, @depNom, @t, @u, @o, @estado)
      `,
      (r) =>
        r
          .input("n", sql.VarChar(50), nro_remito)
          .input("depId", sql.Int, dep.id_deposito)
          .input("depNom", sql.VarChar(200), dep.nombre)
          .input("t", sql.VarChar(20), tipo)
          .input("u", sql.VarChar(120), usuario)
          .input("o", sql.VarChar(400), observacion || null)
          .input("estado", sql.VarChar(30), ESTADO_DEFAULT)
    );

    // 7) Detalle + stock (por ubicación)
    for (const it of itemsResolved) {
      const art = byCod.get(it.cod);
      const idArt = Number(art.id_articulo);
      const signed = tipo === "SALIDA" ? -it.cant : it.cant;

      await execT(
        `
        INSERT INTO dbo.remitos_detalles
          (remito_id, cod_articulo, descripcion, cantidad, id_ubicacion)
        VALUES
          (@r, @c, @desc, @q, @ub)
        `,
        (r) =>
          r
            .input("r", sql.VarChar(50), nro_remito)
            .input("c", sql.VarChar(80), it.cod)
            .input("desc", sql.VarChar(300), art.descripcion)
            .input("q", sql.Int, it.cant)
            .input("ub", sql.Int, it.id_ubicacion)
      );

      // stock_ubicaciones
      await upsertStockUbicDelta(trans, {
        idUbicacion: it.id_ubicacion,
        idArticulo: idArt,
        delta: signed,
      });

      // stock (depósito + ubicación)
      await upsertStockDelta(trans, {
        idDeposito: dep.id_deposito,
        idUbicacion: it.id_ubicacion,
        idArticulo: idArt,
        delta: signed,
      });
    }

    await trans.commit();
    return res.status(201).json({ ok: true, numero_remito: nro_remito });
  } catch (err) {
    console.error("remitos.create:", err);
    try {
      if (trans) await trans.rollback();
    } catch {}
    return res.status(500).json({ error: "Error al crear remito", detalle: err.message });
  }
};
