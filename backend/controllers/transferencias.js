// backend/controllers/transferencias.js
const { sql, poolConnect, getPool } = require("../db");

function asInt(v) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : NaN;
}
const toUpperTrim = (v) => String(v ?? "").trim().toUpperCase();

// ============================================================================
// GET /transferencias
// ============================================================================
exports.getAll = async (_req, res) => {
  try {
    await poolConnect;
    const pool = await getPool();
    const r = await pool.request().query(`
      SELECT id, numero_transferencia, origen, destino, fecha,
             id_ubicacion_origen, id_ubicacion_destino
      FROM dbo.transferencias
      ORDER BY fecha DESC, id DESC
    `);
    res.json(r.recordset || []);
  } catch (err) {
    console.error("transferencias.getAll:", err);
    res.status(500).json({
      error: "Error al listar transferencias",
      detalle: err.message,
    });
  }
};

// ============================================================================
// GET /transferencias/:id  (cabecera + detalle)
// ============================================================================
exports.getById = async (req, res) => {
  try {
    const id = asInt(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ error: "ID inválido" });

    await poolConnect;
    const pool = await getPool();

    const cab = await pool
      .request()
      .input("id", sql.Int, id)
      .query(`
        SELECT id, numero_transferencia, origen, destino, fecha,
               id_ubicacion_origen, id_ubicacion_destino
        FROM dbo.transferencias
        WHERE id = @id
      `);

    if (!cab.recordset.length)
      return res.status(404).json({ error: "Transferencia no encontrada" });

    // ✅ schema real: transferencias_detalle tiene articulo_id (no codigo)
    const det = await pool
      .request()
      .input("id", sql.Int, id)
      .query(`
        SELECT 
          a.codigo,
          a.descripcion,
          d.cantidad
        FROM dbo.transferencias_detalle d
        JOIN dbo.articulos a ON a.id_articulo = d.articulo_id
        WHERE d.transferencia_id = @id
        ORDER BY a.codigo
      `);

    res.json({ cabecera: cab.recordset[0], detalle: det.recordset || [] });
  } catch (err) {
    console.error("transferencias.getById:", err);
    res.status(500).json({
      error: "Error al obtener transferencia",
      detalle: err.message,
    });
  }
};

// ============================================================================
// GET /transferencias/ubicaciones/:depositoId
// ============================================================================
exports.getUbicacionesByDeposito = async (req, res) => {
  try {
    const depositoId = asInt(req.params.depositoId);
    if (!Number.isFinite(depositoId))
      return res.status(400).json({ error: "Depósito inválido" });

    await poolConnect;
    const pool = await getPool();

    const r = await pool
      .request()
      .input("dep", sql.Int, depositoId)
      .query(`
        SELECT id_ubicacion, id_deposito, nombre
        FROM dbo.ubicaciones
        WHERE id_deposito = @dep AND activa = 1
        ORDER BY 
          CASE WHEN UPPER(LTRIM(RTRIM(nombre))) = 'GENERAL' THEN 0 ELSE 1 END,
          nombre
      `);

    res.json(r.recordset || []);
  } catch (err) {
    console.error("transferencias.getUbicacionesByDeposito:", err);
    res.status(500).json({
      error: "Error al listar ubicaciones",
      detalle: err.message,
    });
  }
};

// ============================================================================
// GET /transferencias/articulo?codigo=XXX
// (autocompletar descripción por código o código de barra)
// ============================================================================
exports.getArticuloByCodigo = async (req, res) => {
  try {
    const q = toUpperTrim(req.query?.codigo);
    if (!q) return res.status(400).json({ error: "Debe indicar ?codigo=" });

    await poolConnect;
    const pool = await getPool();

    // Busca por codigo o cod_barra si existe
    const r = await pool
      .request()
      .input("q", sql.VarChar, q)
      .query(`
        SELECT TOP 1
          id_articulo,
          UPPER(LTRIM(RTRIM(codigo))) AS codigo,
          descripcion
        FROM dbo.articulos
        WHERE UPPER(LTRIM(RTRIM(codigo))) = @q
           OR (cod_barra IS NOT NULL AND UPPER(LTRIM(RTRIM(cod_barra))) = @q)
        ORDER BY id_articulo DESC
      `);

    if (!r.recordset.length) return res.status(404).json({ error: "Artículo no encontrado" });

    res.json(r.recordset[0]);
  } catch (err) {
    console.error("transferencias.getArticuloByCodigo:", err);
    res.status(500).json({ error: "Error al buscar artículo", detalle: err.message });
  }
};

// ============================================================================
// POST /transferencias
// body:
// {
//   origen_id, destino_id,
//   id_ubicacion_origen?: null,
//   id_ubicacion_destino?: null,
//   items: [{ codigo, cantidad }]
// }
// ============================================================================
// ============================================================================
// POST /transferencias
// body:
// {
//   origen_id, destino_id,
//   id_ubicacion_origen?: null,
//   id_ubicacion_destino?: null,
//   items: [{ codigo, cantidad }]
// }
// ============================================================================

exports.create = async (req, res) => {
  const usuario =
    req.user?.username ??
    req.user?.email ??
    req.user?.name ??
    null;

  const origenId = asInt(req.body?.origen_id);
  const destinoId = asInt(req.body?.destino_id);

  const ubicO = req.body?.id_ubicacion_origen == null ? null : asInt(req.body.id_ubicacion_origen);
  const ubicD = req.body?.id_ubicacion_destino == null ? null : asInt(req.body.id_ubicacion_destino);

  const itemsRaw = Array.isArray(req.body?.items) ? req.body.items : [];

  if (!Number.isFinite(origenId) || !Number.isFinite(destinoId)) {
    return res.status(400).json({ error: "Debe indicar depósito origen y destino" });
  }
  if (ubicO !== null && !Number.isFinite(ubicO)) return res.status(400).json({ error: "Ubicación origen inválida" });
  if (ubicD !== null && !Number.isFinite(ubicD)) return res.status(400).json({ error: "Ubicación destino inválida" });

  const items = itemsRaw
    .map((it) => ({ codigo: toUpperTrim(it.codigo), cantidad: asInt(it.cantidad) }))
    .filter((it) => it.codigo && Number.isFinite(it.cantidad) && it.cantidad > 0);

  if (!items.length) {
    return res.status(400).json({ error: "Debe incluir items con cantidad > 0" });
  }

  // Consolidar items por código
  const agg = new Map();
  for (const it of items) agg.set(it.codigo, (agg.get(it.codigo) || 0) + it.cantidad);
  const itemsMerged = Array.from(agg.entries()).map(([codigo, cantidad]) => ({ codigo, cantidad }));

  let trans;
  try {
    await poolConnect;
    const pool = await getPool();

    trans = new sql.Transaction(pool);
    await trans.begin();

    const execQ = async (sqlText, bindFn) => {
      const r = new sql.Request(trans);
      if (bindFn) bindFn(r);
      return r.query(sqlText);
    };

    // ---------------------------------------
    // Helper MERGE sobre dbo.stock (FUENTE REAL)
    // ---------------------------------------
    const upsertStockDelta = async ({ idDeposito, idArticulo, idUbicacion, delta }) => {
      await execQ(
        `
        MERGE dbo.stock WITH (HOLDLOCK) AS t
        USING (SELECT @dep AS id_deposito, @art AS id_articulo, @ub AS id_ubicacion) AS s
          ON (
            t.id_deposito = s.id_deposito
            AND t.id_articulo = s.id_articulo
            AND t.id_ubicacion = s.id_ubicacion
          )
        WHEN MATCHED THEN
          UPDATE SET cantidad = t.cantidad + @d
        WHEN NOT MATCHED THEN
          INSERT (id_deposito, id_articulo, id_ubicacion, cantidad)
          VALUES (s.id_deposito, s.id_articulo, s.id_ubicacion, @d);
        `,
        (r) =>
          r
            .input("dep", sql.Int, idDeposito)
            .input("art", sql.Int, idArticulo)
            .input("ub", sql.Int, idUbicacion)
            .input("d", sql.Int, delta)
      );
    };

    // ---------------------------------------
    // Depósitos
    // ---------------------------------------
    const deps = await execQ(`SELECT id_deposito, nombre FROM dbo.depositos`);
    const depMap = new Map(deps.recordset.map((d) => [Number(d.id_deposito), d.nombre]));

    if (!depMap.has(origenId)) {
      await trans.rollback();
      return res.status(400).json({ error: "Depósito origen inexistente" });
    }
    if (!depMap.has(destinoId)) {
      await trans.rollback();
      return res.status(400).json({ error: "Depósito destino inexistente" });
    }

    // ---------------------------------------
    // Ubicaciones (si vienen null, buscamos GENERAL; si no hay, primera activa)
    // ---------------------------------------
    async function resolveUbicacionOrGeneral(idDeposito, idUbicacionNullable) {
      if (idUbicacionNullable != null) {
        const u = await execQ(
          `
          SELECT id_ubicacion, id_deposito, nombre
          FROM dbo.ubicaciones
          WHERE id_ubicacion = @uid AND activa = 1
          `,
          (r) => r.input("uid", sql.Int, idUbicacionNullable)
        );
        if (!u.recordset.length) return null;
        if (Number(u.recordset[0].id_deposito) !== Number(idDeposito)) return null;
        return u.recordset[0];
      }

      const g = await execQ(
        `
        SELECT TOP 1 id_ubicacion, id_deposito, nombre
        FROM dbo.ubicaciones
        WHERE id_deposito = @dep
          AND activa = 1
          AND UPPER(LTRIM(RTRIM(nombre))) = 'GENERAL'
        ORDER BY id_ubicacion
        `,
        (r) => r.input("dep", sql.Int, idDeposito)
      );

      if (g.recordset[0]) return g.recordset[0];

      const any = await execQ(
        `
        SELECT TOP 1 id_ubicacion, id_deposito, nombre
        FROM dbo.ubicaciones
        WHERE id_deposito = @dep AND activa = 1
        ORDER BY id_ubicacion
        `,
        (r) => r.input("dep", sql.Int, idDeposito)
      );

      return any.recordset[0] || null;
    }

    const uOrigen = await resolveUbicacionOrGeneral(origenId, ubicO);
    const uDestino = await resolveUbicacionOrGeneral(destinoId, ubicD);
    
    if (Number(origenId) === Number(destinoId)) {
      if (Number(uOrigen.id_ubicacion) === Number(uDestino.id_ubicacion)) {
        await trans.rollback();
        return res.status(400).json({
          error: "Origen y destino no pueden ser el mismo depósito y la misma ubicación.",
        });
      }
    }

    if (!uOrigen) {
      await trans.rollback();
      return res.status(400).json({
        error: "Ubicación origen inválida o no pertenece al depósito",
      });
    }
    if (!uDestino) {
      await trans.rollback();
      return res.status(400).json({
        error: "Ubicación destino inválida o no pertenece al depósito",
      });
    }

    // ---------------------------------------
    // Validar artículos por código
    // ---------------------------------------
    const inList = itemsMerged.map((_, i) => `@c${i}`).join(",");
    const arts = await execQ(
      `
      SELECT id_articulo, UPPER(LTRIM(RTRIM(codigo))) AS codigo, descripcion
      FROM dbo.articulos
      WHERE UPPER(LTRIM(RTRIM(codigo))) IN (${inList})
      `,
      (r) => itemsMerged.forEach((it, i) => r.input(`c${i}`, sql.VarChar, it.codigo))
    );

    const artIdByCodigo = new Map(arts.recordset.map((a) => [a.codigo, Number(a.id_articulo)]));
    const faltan = itemsMerged.filter((it) => !artIdByCodigo.has(it.codigo)).map((it) => it.codigo);

    if (faltan.length) {
      await trans.rollback();
      return res.status(400).json({ error: "Códigos inexistentes", detalle: faltan });
    }

    // ---------------------------------------
    // ✅ Validar stock en ubicación ORIGEN usando dbo.stock
    // (id_deposito + id_ubicacion + id_articulo)
    // ---------------------------------------
    const faltantesStock = [];
    for (const it of itemsMerged) {
      const idArt = artIdByCodigo.get(it.codigo);

      const chk = await execQ(
        `
        SELECT ISNULL(SUM(cantidad),0) AS q
        FROM dbo.stock WITH (UPDLOCK, HOLDLOCK)
        WHERE id_deposito = @dep
          AND id_ubicacion = @uO
          AND id_articulo = @a1
        `,
        (r) =>
          r
            .input("dep", sql.Int, origenId)
            .input("uO", sql.Int, Number(uOrigen.id_ubicacion))
            .input("a1", sql.Int, Number(idArt))
      );

      const disp = Number(chk.recordset[0]?.q || 0);
      if (disp < it.cantidad) {
        faltantesStock.push({
          codigo: it.codigo,
          requerido: it.cantidad,
          disponible: disp,
        });
      }
    }

    if (faltantesStock.length) {
      await trans.rollback();
      return res.status(400).json({
        error: "Stock insuficiente en ubicación origen",
        faltantes: faltantesStock,
      });
    }

    // ---------------------------------------
    // Cabecera
    // ---------------------------------------
    const origenTxt = `${depMap.get(origenId)} - ${uOrigen.nombre}`;
    const destinoTxt = `${depMap.get(destinoId)} - ${uDestino.nombre}`;

    const ins = await execQ(
      `
      INSERT INTO dbo.transferencias (origen, destino, fecha, id_ubicacion_origen, id_ubicacion_destino, usuario)
      OUTPUT INSERTED.id AS id
      VALUES (@origen, @destino, GETDATE(), @uO2, @uD2, @usr)
      `,
      (r) =>
        r
          .input("origen", sql.VarChar, origenTxt)
          .input("destino", sql.VarChar, destinoTxt)
          .input("uO2", sql.Int, Number(uOrigen.id_ubicacion))
          .input("uD2", sql.Int, Number(uDestino.id_ubicacion))
          .input("usr", sql.VarChar, usuario)
    );

    const transferenciaId = Number(ins.recordset[0].id);

    await execQ(
      `UPDATE dbo.transferencias SET numero_transferencia = CAST(id AS VARCHAR(20)) WHERE id = @id`,
      (r) => r.input("id", sql.Int, transferenciaId)
    );

    // ---------------------------------------
    // Detalle + movimientos (SOLO dbo.stock)
    // ---------------------------------------
    for (const it of itemsMerged) {
      const idArt = artIdByCodigo.get(it.codigo);
      const qty = Number(it.cantidad);

      await execQ(
        `
        INSERT INTO dbo.transferencias_detalle (transferencia_id, articulo_id, cantidad)
        VALUES (@tid, @artId, @qty)
        `,
        (r) =>
          r
            .input("tid", sql.Int, transferenciaId)
            .input("artId", sql.Int, Number(idArt))
            .input("qty", sql.Int, qty)
      );

      // (-) stock origen (dep+ubic)
      await upsertStockDelta({
        idDeposito: origenId,
        idArticulo: Number(idArt),
        idUbicacion: Number(uOrigen.id_ubicacion),
        delta: -qty,
      });

      // (+) stock destino (dep+ubic)
      await upsertStockDelta({
        idDeposito: destinoId,
        idArticulo: Number(idArt),
        idUbicacion: Number(uDestino.id_ubicacion),
        delta: qty,
      });
    }

    await trans.commit();

    res.status(201).json({
      message: "Transferencia creada",
      id: transferenciaId,
      cabecera: {
        id: transferenciaId,
        numero_transferencia: String(transferenciaId),
        fecha: new Date(),
        origen: origenTxt,
        destino: destinoTxt,
        id_ubicacion_origen: Number(uOrigen.id_ubicacion),
        id_ubicacion_destino: Number(uDestino.id_ubicacion),
        usuario,
      },
    });
  } catch (err) {
    try {
      if (trans) await trans.rollback();
    } catch {}
    console.error("transferencias.create:", err);
    res.status(500).json({
      error: "Error al crear transferencia",
      detalle: err.message,
    });
  }
};