// backend/controllers/transferencias.js
const { sql, poolConnect, getPool } = require("../db");

function asInt(v) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : NaN;
}

const toUpperTrim = (v) => String(v ?? "").trim().toUpperCase();

const cleanTextOrNull = (v) => {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s === "" ? null : s;
};

// ============================================================================
// GET /transferencias
// ============================================================================
exports.getAll = async (_req, res) => {
  try {
    await poolConnect;
    const pool = await getPool();

    const r = await pool.request().query(`
      SELECT 
        t.id,
        t.numero_transferencia,
        t.origen,
        t.destino,
        t.fecha,
        t.fecha_real,
        t.remito_referencia,
        t.id_referente,
        r.nombre AS referente,
        t.id_ubicacion_origen,
        t.id_ubicacion_destino
      FROM dbo.transferencias t
      LEFT JOIN dbo.referentes r ON r.id_referente = t.id_referente
      ORDER BY t.fecha DESC, t.id DESC
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
// GET /transferencias/:id
// ============================================================================
exports.getById = async (req, res) => {
  try {
    const id = asInt(req.params.id);

    if (!Number.isFinite(id)) {
      return res.status(400).json({ error: "ID inválido" });
    }

    await poolConnect;
    const pool = await getPool();

    const cab = await pool
      .request()
      .input("id", sql.Int, id)
      .query(`
        SELECT 
          t.id,
          t.numero_transferencia,
          t.origen,
          t.destino,
          t.fecha,
          t.fecha_real,
          t.remito_referencia,
          t.id_referente,
          r.nombre AS referente,
          t.id_ubicacion_origen,
          t.id_ubicacion_destino
        FROM dbo.transferencias t
        LEFT JOIN dbo.referentes r ON r.id_referente = t.id_referente
        WHERE t.id = @id
      `);

    if (!cab.recordset.length) {
      return res.status(404).json({ error: "Transferencia no encontrada" });
    }

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

    res.json({
      cabecera: cab.recordset[0],
      detalle: det.recordset || [],
    });
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
// Se deja por compatibilidad, aunque el nuevo frontend ya no lo usa.
// ============================================================================
exports.getUbicacionesByDeposito = async (req, res) => {
  try {
    const depositoId = asInt(req.params.depositoId);

    if (!Number.isFinite(depositoId)) {
      return res.status(400).json({ error: "Depósito inválido" });
    }

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
// ============================================================================
exports.getArticuloByCodigo = async (req, res) => {
  try {
    const q = toUpperTrim(req.query?.codigo);

    if (!q) {
      return res.status(400).json({ error: "Debe indicar ?codigo=" });
    }

    await poolConnect;
    const pool = await getPool();

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

    if (!r.recordset.length) {
      return res.status(404).json({ error: "Artículo no encontrado" });
    }

    res.json(r.recordset[0]);
  } catch (err) {
    console.error("transferencias.getArticuloByCodigo:", err);
    res.status(500).json({
      error: "Error al buscar artículo",
      detalle: err.message,
    });
  }
};

// ============================================================================
// POST /transferencias
//
// Nuevo criterio:
// - El usuario solo elige DEPÓSITO / ALMACÉN.
// - No se pide ubicación en pantalla.
// - Internamente se usa ubicación GENERAL o la primera activa para registrar.
// - No permite origen y destino iguales.
// ============================================================================
exports.create = async (req, res) => {
  const usuario =
    req.user?.username ??
    req.user?.email ??
    req.user?.name ??
    null;

  const origenId = asInt(req.body?.origen_id);
  const destinoId = asInt(req.body?.destino_id);

  const remitoReferencia = cleanTextOrNull(req.body?.remito_referencia);

  const referenteRaw = req.body?.id_referente;
  const referenteId =
    referenteRaw === null ||
    referenteRaw === undefined ||
    String(referenteRaw).trim() === ""
      ? null
      : asInt(referenteRaw);

  const fechaRealRaw = req.body?.fecha_real;
  const fechaReal =
    fechaRealRaw === null ||
    fechaRealRaw === undefined ||
    String(fechaRealRaw).trim() === ""
      ? null
      : String(fechaRealRaw).trim();

  const itemsRaw = Array.isArray(req.body?.items) ? req.body.items : [];

  if (!Number.isFinite(origenId) || !Number.isFinite(destinoId)) {
    return res.status(400).json({
      error: "Debe indicar depósito origen y destino",
    });
  }

  if (Number(origenId) === Number(destinoId)) {
    return res.status(400).json({
      error: "El depósito origen y destino deben ser distintos",
    });
  }

  if (referenteId !== null && !Number.isFinite(referenteId)) {
    return res.status(400).json({ error: "Referente inválido" });
  }

  const items = itemsRaw
    .map((it) => ({
      codigo: toUpperTrim(it.codigo),
      cantidad: asInt(it.cantidad),
    }))
    .filter(
      (it) =>
        it.codigo &&
        Number.isFinite(it.cantidad) &&
        it.cantidad > 0
    );

  if (!items.length) {
    return res.status(400).json({
      error: "Debe incluir items con cantidad mayor a 0",
    });
  }

  const agg = new Map();

  for (const it of items) {
    agg.set(it.codigo, (agg.get(it.codigo) || 0) + it.cantidad);
  }

  const itemsMerged = Array.from(agg.entries()).map(([codigo, cantidad]) => ({
    codigo,
    cantidad,
  }));

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

    // ------------------------------------------------------------------------
    // Helper: devuelve ubicación GENERAL del depósito o la primera activa.
    // Aunque el usuario ya no la elija, la tabla stock necesita id_ubicacion.
    // ------------------------------------------------------------------------
    const resolveUbicacionInterna = async (idDeposito) => {
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
        WHERE id_deposito = @dep
          AND activa = 1
        ORDER BY id_ubicacion
        `,
        (r) => r.input("dep", sql.Int, idDeposito)
      );

      return any.recordset[0] || null;
    };

    // ------------------------------------------------------------------------
    // Helper: suma/resta stock en una ubicación concreta.
    // Para el destino se suma en GENERAL o primera ubicación activa.
    // ------------------------------------------------------------------------
    const upsertStockDelta = async ({
      idDeposito,
      idArticulo,
      idUbicacion,
      delta,
    }) => {
      await execQ(
        `
        MERGE dbo.stock WITH (HOLDLOCK) AS t
        USING (
          SELECT 
            @dep AS id_deposito, 
            @art AS id_articulo, 
            @ub AS id_ubicacion
        ) AS s
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

    // ------------------------------------------------------------------------
    // Helper: descuenta stock del depósito origen sin que el usuario elija
    // ubicación. Consume desde las ubicaciones con stock disponible.
    // Primero GENERAL, luego el resto.
    // ------------------------------------------------------------------------
    const consumirStockDesdeDeposito = async ({
      idDeposito,
      idArticulo,
      cantidad,
    }) => {
      let restante = Number(cantidad);

      const rows = await execQ(
        `
        SELECT 
          s.id_stock,
          s.id_ubicacion,
          s.cantidad,
          u.nombre AS ubicacion
        FROM dbo.stock s WITH (UPDLOCK, HOLDLOCK)
        LEFT JOIN dbo.ubicaciones u ON u.id_ubicacion = s.id_ubicacion
        WHERE s.id_deposito = @dep
          AND s.id_articulo = @art
          AND s.cantidad > 0
        ORDER BY
          CASE WHEN UPPER(LTRIM(RTRIM(ISNULL(u.nombre, '')))) = 'GENERAL' THEN 0 ELSE 1 END,
          s.id_ubicacion,
          s.id_stock
        `,
        (r) =>
          r
            .input("dep", sql.Int, idDeposito)
            .input("art", sql.Int, idArticulo)
      );

      for (const row of rows.recordset || []) {
        if (restante <= 0) break;

        const disponibleFila = Number(row.cantidad || 0);
        const tomar = Math.min(disponibleFila, restante);

        if (tomar <= 0) continue;

        const upd = await execQ(
          `
          UPDATE dbo.stock
          SET cantidad = cantidad - @cant
          WHERE id_stock = @idStock
            AND cantidad >= @cant;

          SELECT @@ROWCOUNT AS affected;
          `,
          (r) =>
            r
              .input("idStock", sql.Int, Number(row.id_stock))
              .input("cant", sql.Int, tomar)
        );

        const affected = Number(upd.recordset?.[0]?.affected || 0);

        if (affected !== 1) {
          throw new Error(
            "No se pudo descontar stock. Volvé a intentar la operación."
          );
        }

        restante -= tomar;
      }

      if (restante > 0) {
        throw new Error(
          `Stock insuficiente. Faltan ${restante} unidades para descontar.`
        );
      }
    };

    // ------------------------------------------------------------------------
    // Depósitos
    // ------------------------------------------------------------------------
    const deps = await execQ(`
      SELECT id_deposito, nombre
      FROM dbo.depositos
    `);

    const depMap = new Map(
      deps.recordset.map((d) => [Number(d.id_deposito), String(d.nombre || "")])
    );

    if (!depMap.has(origenId)) {
      await trans.rollback();
      return res.status(400).json({ error: "Depósito origen inexistente" });
    }

    if (!depMap.has(destinoId)) {
      await trans.rollback();
      return res.status(400).json({ error: "Depósito destino inexistente" });
    }

    // ------------------------------------------------------------------------
    // Referente
    // ------------------------------------------------------------------------
    if (referenteId !== null) {
      const ref = await execQ(
        `
        SELECT id_referente, nombre, activo
        FROM dbo.referentes WITH (UPDLOCK, HOLDLOCK)
        WHERE id_referente = @id
        `,
        (r) => r.input("id", sql.Int, referenteId)
      );

      if (!ref.recordset.length) {
        await trans.rollback();
        return res.status(400).json({ error: "Referente inexistente" });
      }

      if (!ref.recordset[0].activo) {
        await trans.rollback();
        return res.status(400).json({ error: "Referente inactivo" });
      }
    }

    // ------------------------------------------------------------------------
    // Ubicaciones internas automáticas
    // ------------------------------------------------------------------------
    const uOrigen = await resolveUbicacionInterna(origenId);
    const uDestino = await resolveUbicacionInterna(destinoId);

    if (!uOrigen) {
      await trans.rollback();
      return res.status(400).json({
        error:
          "El depósito origen no tiene ninguna ubicación activa. Creá una ubicación GENERAL.",
      });
    }

    if (!uDestino) {
      await trans.rollback();
      return res.status(400).json({
        error:
          "El depósito destino no tiene ninguna ubicación activa. Creá una ubicación GENERAL.",
      });
    }

    // ------------------------------------------------------------------------
    // Artículos
    // ------------------------------------------------------------------------
    const inList = itemsMerged.map((_, i) => `@c${i}`).join(",");

    const arts = await execQ(
      `
      SELECT 
        id_articulo,
        UPPER(LTRIM(RTRIM(codigo))) AS codigo,
        descripcion
      FROM dbo.articulos
      WHERE UPPER(LTRIM(RTRIM(codigo))) IN (${inList})
      `,
      (r) =>
        itemsMerged.forEach((it, i) =>
          r.input(`c${i}`, sql.VarChar, it.codigo)
        )
    );

    const artIdByCodigo = new Map(
      arts.recordset.map((a) => [String(a.codigo), Number(a.id_articulo)])
    );

    const faltan = itemsMerged
      .filter((it) => !artIdByCodigo.has(it.codigo))
      .map((it) => it.codigo);

    if (faltan.length) {
      await trans.rollback();
      return res.status(400).json({
        error: "Códigos inexistentes",
        detalle: faltan,
      });
    }

    // ------------------------------------------------------------------------
    // Validar stock total por depósito origen
    // Ya no validamos ubicación, porque el usuario trabaja por almacén.
    // ------------------------------------------------------------------------
    const faltantesStock = [];

    for (const it of itemsMerged) {
      const idArt = artIdByCodigo.get(it.codigo);

      const chk = await execQ(
        `
        SELECT ISNULL(SUM(cantidad), 0) AS q
        FROM dbo.stock WITH (UPDLOCK, HOLDLOCK)
        WHERE id_deposito = @dep
          AND id_articulo = @art
        `,
        (r) =>
          r
            .input("dep", sql.Int, origenId)
            .input("art", sql.Int, Number(idArt))
      );

      const disponible = Number(chk.recordset[0]?.q || 0);

      if (disponible < it.cantidad) {
        faltantesStock.push({
          codigo: it.codigo,
          requerido: it.cantidad,
          disponible,
        });
      }
    }

    if (faltantesStock.length) {
      await trans.rollback();
      return res.status(400).json({
        error: "Stock insuficiente en depósito origen",
        faltantes: faltantesStock,
      });
    }

    // ------------------------------------------------------------------------
    // Cabecera
    // Ahora se guarda solo el nombre del depósito, sin mostrar ubicación.
    // Internamente se guardan id_ubicacion_origen/destino para compatibilidad.
    // ------------------------------------------------------------------------
    const origenTxt = depMap.get(origenId);
    const destinoTxt = depMap.get(destinoId);

    const ins = await execQ(
      `
      INSERT INTO dbo.transferencias
      (
        origen,
        destino,
        fecha,
        fecha_real,
        remito_referencia,
        id_referente,
        id_ubicacion_origen,
        id_ubicacion_destino,
        usuario
      )
      OUTPUT INSERTED.id AS id
      VALUES
      (
        @origen,
        @destino,
        GETDATE(),
        COALESCE(@fechaReal, CONVERT(date, GETDATE())),
        @remitoReferencia,
        @referenteId,
        @uO,
        @uD,
        @usr
      )
      `,
      (r) =>
        r
          .input("origen", sql.VarChar, origenTxt)
          .input("destino", sql.VarChar, destinoTxt)
          .input("fechaReal", sql.Date, fechaReal)
          .input("remitoReferencia", sql.VarChar, remitoReferencia)
          .input("referenteId", sql.Int, referenteId)
          .input("uO", sql.Int, Number(uOrigen.id_ubicacion))
          .input("uD", sql.Int, Number(uDestino.id_ubicacion))
          .input("usr", sql.VarChar, usuario)
    );

    const transferenciaId = Number(ins.recordset[0].id);

    await execQ(
      `
      UPDATE dbo.transferencias
      SET numero_transferencia = CAST(id AS VARCHAR(20))
      WHERE id = @id
      `,
      (r) => r.input("id", sql.Int, transferenciaId)
    );

    // ------------------------------------------------------------------------
    // Detalle + movimientos de stock
    // ------------------------------------------------------------------------
    for (const it of itemsMerged) {
      const idArt = artIdByCodigo.get(it.codigo);
      const qty = Number(it.cantidad);

      await execQ(
        `
        INSERT INTO dbo.transferencias_detalle
        (
          transferencia_id,
          articulo_id,
          cantidad
        )
        VALUES
        (
          @tid,
          @artId,
          @qty
        )
        `,
        (r) =>
          r
            .input("tid", sql.Int, transferenciaId)
            .input("artId", sql.Int, Number(idArt))
            .input("qty", sql.Int, qty)
      );

      await consumirStockDesdeDeposito({
        idDeposito: origenId,
        idArticulo: Number(idArt),
        cantidad: qty,
      });

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
        fecha_real: fechaReal || new Date().toISOString().slice(0, 10),
        remito_referencia: remitoReferencia,
        id_referente: referenteId,
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

// ============================================================================
// GET /transferencias/stock-articulo?codigo=XXX&deposito_id=1
//
// Nuevo criterio:
// - Si no viene ubicacion_id, devuelve stock total del depósito.
// - Si viene ubicacion_id, lo respeta por compatibilidad con pantallas viejas.
// ============================================================================
exports.getStockArticulo = async (req, res) => {
  try {
    const codigo = String(req.query.codigo || "").trim().toUpperCase();
    const depositoId = Number(req.query.deposito_id);
    const ubicacionId = req.query.ubicacion_id
      ? Number(req.query.ubicacion_id)
      : null;

    if (!codigo || !depositoId) {
      return res.status(400).json({
        error: "Debe indicar codigo y deposito_id",
      });
    }

    await poolConnect;
    const pool = await getPool();

    const r = await pool
      .request()
      .input("codigo", sql.VarChar, codigo)
      .input("dep", sql.Int, depositoId)
      .input("ub", sql.Int, ubicacionId)
      .query(`
        SELECT 
          ISNULL(SUM(s.cantidad), 0) AS stock
        FROM dbo.articulos a
        LEFT JOIN dbo.stock s 
          ON s.id_articulo = a.id_articulo
         AND s.id_deposito = @dep
         AND (@ub IS NULL OR s.id_ubicacion = @ub)
        WHERE UPPER(LTRIM(RTRIM(a.codigo))) = @codigo
      `);

    res.json({
      codigo,
      deposito_id: depositoId,
      ubicacion_id: ubicacionId,
      stock: Number(r.recordset[0]?.stock || 0),
    });
  } catch (err) {
    console.error("transferencias.getStockArticulo:", err);
    res.status(500).json({
      error: "Error al consultar stock del artículo",
      detalle: err.message,
    });
  }
};