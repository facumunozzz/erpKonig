// backend/controllers/transferencias.js
const { sql, poolConnect, getPool } = require("../db");

function asInt(v) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : NaN;
}

const DEPOSITO_RECORTES_ID = -1;

const toUpperTrim = (v) =>
  String(v ?? "")
    .trim()
    .toUpperCase();

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

    const cab = await pool.request().input("id", sql.Int, id).query(`
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

    const det = await pool.request().input("id", sql.Int, id).query(`
        SELECT
          COALESCE(a.codigo, r.codigo) AS codigo,
          COALESCE(a.descripcion, r.descripcion) AS descripcion,
          d.cantidad
        FROM dbo.transferencias_detalle d
        LEFT JOIN dbo.articulos a
          ON a.id_articulo = d.articulo_id
        LEFT JOIN dbo.recortes r
          ON r.id_recorte = d.id_recorte
        WHERE d.transferencia_id = @id
        ORDER BY COALESCE(a.codigo, r.codigo)
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

    const r = await pool.request().input("dep", sql.Int, depositoId).query(`
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
    const codigo = String(req.query?.codigo || "")
      .trim()
      .toUpperCase();

    if (!codigo) {
      return res.status(400).json({
        error: "Debe indicar ?codigo=",
      });
    }

    await poolConnect;
    const pool = await getPool();

    const result = await pool
      .request()
      .input("codigo", sql.VarChar(100), codigo)
      .query(`
        SELECT TOP 1
          id_articulo,

          UPPER(
            LTRIM(
              RTRIM(codigo)
            )
          ) AS codigo,

          descripcion,
          proveedor,

          ISNULL(
            ubicacion,
            ''
          ) AS ubicacion

        FROM dbo.articulos

        WHERE UPPER(
          LTRIM(
            RTRIM(codigo)
          )
        ) = @codigo

        ORDER BY id_articulo DESC;
      `);

    if (!result.recordset.length) {
      return res.status(404).json({
        error: "Artículo no encontrado",
      });
    }

    return res.json(
      result.recordset[0],
    );
  } catch (err) {
    console.error(
      "transferencias.getArticuloByCodigo:",
      err,
    );

    return res.status(500).json({
      error: "Error al buscar artículo",
      detalle: err.message,
    });
  }
};

async function crearTransferenciaRecortes(req, res) {
  const usuario =
    req.user?.username ??
    req.user?.email ??
    req.user?.name ??
    null;

  const ubicacionDestinoId = asInt(req.body?.id_ubicacion_destino);
  const remitoReferencia = cleanTextOrNull(req.body?.remito_referencia);
  const fechaReal = cleanTextOrNull(req.body?.fecha_real);

  const referenteRaw = req.body?.id_referente;
  const referenteId =
    referenteRaw === null ||
    referenteRaw === undefined ||
    String(referenteRaw).trim() === ""
      ? null
      : asInt(referenteRaw);

  const itemsRaw = Array.isArray(req.body?.items) ? req.body.items : [];

  if (!Number.isInteger(ubicacionDestinoId) || ubicacionDestinoId <= 0) {
    return res.status(400).json({
      error: "Debe seleccionar la ubicación destino.",
    });
  }

  if (
    referenteId !== null &&
    (!Number.isInteger(referenteId) || referenteId <= 0)
  ) {
    return res.status(400).json({
      error: "Referente inválido.",
    });
  }

  const agrupados = new Map();

  for (const itemRaw of itemsRaw) {
    const item = {
      codigo: toUpperTrim(itemRaw?.codigo),
      id_recorte: asInt(itemRaw?.id_recorte),
      cantidad: Number(itemRaw?.cantidad),
      id_ubicacion_origen: asInt(itemRaw?.id_ubicacion_origen),
    };

    if (
      !item.codigo ||
      !Number.isInteger(item.id_recorte) ||
      item.id_recorte <= 0 ||
      !Number.isFinite(item.cantidad) ||
      item.cantidad <= 0 ||
      !Number.isInteger(item.id_ubicacion_origen) ||
      item.id_ubicacion_origen <= 0
    ) {
      continue;
    }

    const clave = `${item.id_recorte}|${item.id_ubicacion_origen}`;
    const actual = agrupados.get(clave) || {
      ...item,
      cantidad: 0,
    };

    actual.cantidad += item.cantidad;
    agrupados.set(clave, actual);
  }

  const items = Array.from(agrupados.values());

  if (!items.length) {
    return res.status(400).json({
      error: "Debe incluir al menos un recorte válido.",
    });
  }

  if (
    items.some(
      (item) => item.id_ubicacion_origen === ubicacionDestinoId,
    )
  ) {
    return res.status(400).json({
      error: "La ubicación origen y destino no pueden ser iguales.",
    });
  }

  let transaction;

  try {
    await poolConnect;
    const pool = await getPool();

    transaction = new sql.Transaction(pool);
    await transaction.begin();

    if (referenteId !== null) {
      const referenteResult = await new sql.Request(transaction)
        .input("referenteId", sql.Int, referenteId)
        .query(`
          SELECT id_referente, activo
          FROM dbo.referentes
          WHERE id_referente = @referenteId;
        `);

      if (!referenteResult.recordset.length) {
        throw new Error("El referente no existe.");
      }

      if (!referenteResult.recordset[0].activo) {
        throw new Error("El referente está inactivo.");
      }
    }

    const ubicacionDestinoResult = await new sql.Request(transaction)
      .input("id", sql.Int, ubicacionDestinoId)
      .query(`
        SELECT id_ubicacion_recorte, nombre
        FROM dbo.recortes_ubicaciones WITH (UPDLOCK, HOLDLOCK)
        WHERE id_ubicacion_recorte = @id
          AND activo = 1;
      `);

    if (!ubicacionDestinoResult.recordset.length) {
      throw new Error("La ubicación destino no existe o está inactiva.");
    }

    const ubicacionDestino = ubicacionDestinoResult.recordset[0];

    const primeraUbicacionOrigenResult = await new sql.Request(transaction)
      .input("id", sql.Int, items[0].id_ubicacion_origen)
      .query(`
        SELECT id_ubicacion_recorte, nombre
        FROM dbo.recortes_ubicaciones WITH (UPDLOCK, HOLDLOCK)
        WHERE id_ubicacion_recorte = @id
          AND activo = 1;
      `);

    if (!primeraUbicacionOrigenResult.recordset.length) {
      throw new Error("La ubicación origen no existe o está inactiva.");
    }

    const primeraUbicacionOrigen =
      primeraUbicacionOrigenResult.recordset[0];

    const cabeceraResult = await new sql.Request(transaction)
      .input(
        "origen",
        sql.VarChar(100),
        `Recortes - ${primeraUbicacionOrigen.nombre}`,
      )
      .input(
        "destino",
        sql.VarChar(100),
        `Recortes - ${ubicacionDestino.nombre}`,
      )
      .input("fechaReal", sql.Date, fechaReal)
      .input("remitoReferencia", sql.NVarChar(100), remitoReferencia)
      .input("referenteId", sql.Int, referenteId)
      .input(
        "ubicacionOrigenId",
        sql.Int,
        items[0].id_ubicacion_origen,
      )
      .input("ubicacionDestinoId", sql.Int, ubicacionDestinoId)
      .input("usuario", sql.VarChar(120), usuario)
      .query(`
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
          usuario,
          es_recortes
        )
        OUTPUT INSERTED.id
        VALUES
        (
          @origen,
          @destino,
          GETDATE(),
          COALESCE(@fechaReal, CONVERT(date, GETDATE())),
          @remitoReferencia,
          @referenteId,
          @ubicacionOrigenId,
          @ubicacionDestinoId,
          @usuario,
          1
        );
      `);

    const transferenciaId = Number(cabeceraResult.recordset[0].id);

    await new sql.Request(transaction)
      .input("transferenciaId", sql.Int, transferenciaId)
      .query(`
        UPDATE dbo.transferencias
        SET numero_transferencia = CAST(id AS VARCHAR(20))
        WHERE id = @transferenciaId;
      `);

    for (const item of items) {
      const recorteResult = await new sql.Request(transaction)
        .input("idRecorte", sql.Int, item.id_recorte)
        .input("codigo", sql.VarChar(150), item.codigo)
        .query(`
          SELECT id_recorte, codigo, descripcion
          FROM dbo.recortes WITH (UPDLOCK, HOLDLOCK)
          WHERE id_recorte = @idRecorte
            AND UPPER(LTRIM(RTRIM(codigo))) = @codigo
            AND activo = 1;
        `);

      if (!recorteResult.recordset.length) {
        throw new Error(
          `El recorte ${item.codigo} no existe o está inactivo.`,
        );
      }

      const ubicacionOrigenResult = await new sql.Request(transaction)
        .input("id", sql.Int, item.id_ubicacion_origen)
        .query(`
          SELECT id_ubicacion_recorte, nombre
          FROM dbo.recortes_ubicaciones WITH (UPDLOCK, HOLDLOCK)
          WHERE id_ubicacion_recorte = @id
            AND activo = 1;
        `);

      if (!ubicacionOrigenResult.recordset.length) {
        throw new Error(
          `La ubicación origen de ${item.codigo} no existe o está inactiva.`,
        );
      }

      const descuento = await new sql.Request(transaction)
        .input("idRecorte", sql.Int, item.id_recorte)
        .input("idUbicacion", sql.Int, item.id_ubicacion_origen)
        .input("cantidad", sql.Decimal(18, 3), item.cantidad)
        .query(`
          UPDATE dbo.stock_recortes
          SET
            cantidad = cantidad - @cantidad,
            fecha_actualizacion = SYSDATETIME()
          WHERE id_recorte = @idRecorte
            AND id_ubicacion_recorte = @idUbicacion
            AND cantidad >= @cantidad;

          SELECT @@ROWCOUNT AS afectados;
        `);

      if (Number(descuento.recordset[0]?.afectados || 0) !== 1) {
        throw new Error(`Stock insuficiente para ${item.codigo}.`);
      }

      await new sql.Request(transaction)
        .input("idRecorte", sql.Int, item.id_recorte)
        .input("idUbicacion", sql.Int, ubicacionDestinoId)
        .input("ubicacion", sql.VarChar(150), ubicacionDestino.nombre)
        .input("cantidad", sql.Decimal(18, 3), item.cantidad)
        .query(`
          UPDATE dbo.stock_recortes
          SET
            cantidad = cantidad + @cantidad,
            ubicacion = @ubicacion,
            fecha_actualizacion = SYSDATETIME()
          WHERE id_recorte = @idRecorte
            AND id_ubicacion_recorte = @idUbicacion;

          IF @@ROWCOUNT = 0
          BEGIN
            INSERT INTO dbo.stock_recortes
            (
              id_recorte,
              id_ubicacion_recorte,
              ubicacion,
              cantidad
            )
            VALUES
            (
              @idRecorte,
              @idUbicacion,
              @ubicacion,
              @cantidad
            );
          END;
        `);

      await new sql.Request(transaction)
        .input("transferenciaId", sql.Int, transferenciaId)
        .input("idRecorte", sql.Int, item.id_recorte)
        .input("cantidad", sql.Decimal(18, 3), item.cantidad)
        .input(
          "ubicacionOrigenId",
          sql.Int,
          item.id_ubicacion_origen,
        )
        .query(`
          INSERT INTO dbo.transferencias_detalle
          (
            transferencia_id,
            articulo_id,
            id_recorte,
            cantidad,
            id_ubicacion_origen
          )
          VALUES
          (
            @transferenciaId,
            NULL,
            @idRecorte,
            @cantidad,
            @ubicacionOrigenId
          );
        `);
    }

    await transaction.commit();

    return res.status(201).json({
      ok: true,
      cabecera: {
        id: transferenciaId,
        numero_transferencia: String(transferenciaId),
      },
      message: "Transferencia de recortes creada correctamente.",
    });
  } catch (error) {
    if (transaction && transaction._aborted !== true) {
      try {
        await transaction.rollback();
      } catch (rollbackError) {
        console.error("Error haciendo rollback:", rollbackError);
      }
    }

    console.error("crearTransferenciaRecortes:", error);

    return res.status(400).json({
      error: error.message || "Error al transferir recortes.",
    });
  }
}

exports.create = async (req, res) => {
  const usuario =
    req.user?.username ??
    req.user?.email ??
    req.user?.name ??
    null;

  const origenId = asInt(req.body?.origen_id);
  const destinoId = asInt(req.body?.destino_id);

  const origenEsRecortes =
  origenId === DEPOSITO_RECORTES_ID;

const destinoEsRecortes =
  destinoId === DEPOSITO_RECORTES_ID;

if (origenEsRecortes !== destinoEsRecortes) {
  return res.status(400).json({
    error:
      "Recortes solo puede transferirse entre ubicaciones del depósito Recortes.",
  });
}

if (origenEsRecortes && destinoEsRecortes) {
  return crearTransferenciaRecortes(
    req,
    res
  );
}

  const ubicacionDestinoId = asInt(
    req.body?.id_ubicacion_destino,
  );

  const remitoReferencia = cleanTextOrNull(
    req.body?.remito_referencia,
  );

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

  const itemsRaw = Array.isArray(req.body?.items)
    ? req.body.items
    : [];

  // =====================================================
  // VALIDACIONES GENERALES
  // =====================================================

  if (
    !Number.isFinite(origenId) ||
    origenId <= 0 ||
    !Number.isFinite(destinoId) ||
    destinoId <= 0
  ) {
    return res.status(400).json({
      error: "Debe indicar depósito origen y destino",
    });
  }

  if (
    !Number.isFinite(ubicacionDestinoId) ||
    ubicacionDestinoId <= 0
  ) {
    return res.status(400).json({
      error: "Debe indicar la ubicación destino",
    });
  }

  if (
    referenteId !== null &&
    !Number.isFinite(referenteId)
  ) {
    return res.status(400).json({
      error: "Referente inválido",
    });
  }

  const items = itemsRaw
    .map((item) => ({
      codigo: toUpperTrim(item?.codigo),
      cantidad: Number(item?.cantidad),
      id_ubicacion_origen: asInt(
        item?.id_ubicacion_origen,
      ),
    }))
    .filter(
      (item) =>
        item.codigo &&
        Number.isFinite(item.cantidad) &&
        item.cantidad > 0 &&
        Number.isFinite(item.id_ubicacion_origen) &&
        item.id_ubicacion_origen > 0,
    );

  if (!items.length) {
    return res.status(400).json({
      error:
        "Debe incluir al menos un artículo con cantidad mayor a 0",
    });
  }

  // Agrupar códigos repetidos
  const agrupados = new Map();

  for (const item of items) {
    const clave = `${item.codigo}|${item.id_ubicacion_origen}`;
    const actual = agrupados.get(clave) || {
      codigo: item.codigo,
      cantidad: 0,
      id_ubicacion_origen: item.id_ubicacion_origen,
    };

    actual.cantidad += item.cantidad;
    agrupados.set(clave, actual);
  }

  const itemsMerged = Array.from(agrupados.values());

  let transaction;

  try {
    await poolConnect;
    const pool = await getPool();

    transaction = new sql.Transaction(pool);
    await transaction.begin();

    const ejecutar = async (consulta, configurar) => {
      const request = new sql.Request(transaction);

      if (configurar) {
        configurar(request);
      }

      return request.query(consulta);
    };

    // =====================================================
    // VALIDAR DEPÓSITOS
    // =====================================================

    const depositosResult = await ejecutar(
      `
      SELECT
        id_deposito,
        nombre
      FROM dbo.depositos
      WHERE id_deposito IN (@origenId, @destinoId);
      `,
      (request) =>
        request
          .input("origenId", sql.Int, origenId)
          .input("destinoId", sql.Int, destinoId),
    );

    const depositoMap = new Map(
      (depositosResult.recordset || []).map((deposito) => [
        Number(deposito.id_deposito),
        String(deposito.nombre || ""),
      ]),
    );

    if (!depositoMap.has(origenId)) {
      await transaction.rollback();

      return res.status(400).json({
        error: "El depósito origen no existe",
      });
    }

    if (!depositoMap.has(destinoId)) {
      await transaction.rollback();

      return res.status(400).json({
        error: "El depósito destino no existe",
      });
    }
    
    // VALIDAR UBICACIÓN DESTINO
    const ubicacionDestinoResult = await ejecutar(
      `
      SELECT
        id_ubicacion,
        id_deposito,
        nombre,
        activa
      FROM dbo.ubicaciones WITH (UPDLOCK, HOLDLOCK)
      WHERE id_ubicacion = @ubicacionId
        AND id_deposito = @depositoId;
      `,
      (request) =>
        request
          .input(
            "ubicacionId",
            sql.Int,
            ubicacionDestinoId,
          )
          .input("depositoId", sql.Int, destinoId),
    );

    if (!ubicacionDestinoResult.recordset.length) {
      await transaction.rollback();

      return res.status(400).json({
        error:
          "La ubicación destino no pertenece al depósito destino",
      });
    }

    if (!ubicacionDestinoResult.recordset[0].activa) {
      await transaction.rollback();

      return res.status(400).json({
        error: "La ubicación destino está inactiva",
      });
    }

    const primeraUbicacionOrigenId = itemsMerged[0].id_ubicacion_origen;

const ubicacionOrigenResult = await ejecutar(
  `
  SELECT
    id_ubicacion,
    id_deposito,
    nombre,
    activa
  FROM dbo.ubicaciones WITH (UPDLOCK, HOLDLOCK)
  WHERE id_ubicacion = @ubicacionId
    AND id_deposito = @depositoId;
  `,
  (request) =>
    request
      .input("ubicacionId", sql.Int, primeraUbicacionOrigenId)
      .input("depositoId", sql.Int, origenId)
);

if (!ubicacionOrigenResult.recordset.length) {
  await transaction.rollback();

  return res.status(400).json({
    error: "La ubicación origen no pertenece al depósito origen",
  });
}

if (!ubicacionOrigenResult.recordset[0].activa) {
  await transaction.rollback();

  return res.status(400).json({
    error: "La ubicación origen está inactiva",
  });
}

const ubicacionOrigen = ubicacionOrigenResult.recordset[0];

const ubicacionDestino = ubicacionDestinoResult.recordset[0];

    // =====================================================
    // VALIDAR REFERENTE
    // =====================================================

    if (referenteId !== null) {
      const referenteResult = await ejecutar(
        `
        SELECT
          id_referente,
          nombre,
          activo
        FROM dbo.referentes
        WHERE id_referente = @referenteId;
        `,
        (request) =>
          request.input(
            "referenteId",
            sql.Int,
            referenteId,
          ),
      );

      if (!referenteResult.recordset.length) {
        await transaction.rollback();

        return res.status(400).json({
          error: "El referente no existe",
        });
      }

      if (!referenteResult.recordset[0].activo) {
        await transaction.rollback();

        return res.status(400).json({
          error: "El referente está inactivo",
        });
      }
    }

    // =====================================================
    // OBTENER ARTÍCULOS
    // =====================================================

    const parametrosCodigos = itemsMerged
      .map((_, index) => `@codigo${index}`)
      .join(",");

    const articulosResult = await ejecutar(
      `
      SELECT
        id_articulo,
        UPPER(LTRIM(RTRIM(codigo))) AS codigo,
        descripcion
      FROM dbo.articulos
      WHERE UPPER(LTRIM(RTRIM(codigo)))
        IN (${parametrosCodigos});
      `,
      (request) => {
        itemsMerged.forEach((item, index) => {
          request.input(
            `codigo${index}`,
            sql.NVarChar(100),
            item.codigo,
          );
        });
      },
    );

    const articuloMap = new Map(
      (articulosResult.recordset || []).map((articulo) => [
        String(articulo.codigo),
        {
          id_articulo: Number(articulo.id_articulo),
          descripcion: articulo.descripcion,
        },
      ]),
    );

    const codigosInexistentes = itemsMerged
      .filter((item) => !articuloMap.has(item.codigo))
      .map((item) => item.codigo);

    if (codigosInexistentes.length) {
      await transaction.rollback();

      return res.status(400).json({
        error: "Hay códigos de artículo inexistentes",
        detalle: codigosInexistentes,
      });
    }

    // =====================================================
    // VALIDAR STOCK EN LA UBICACIÓN ORIGEN
    // =====================================================

    const faltantes = [];

    for (const item of itemsMerged) {
      const articulo = articuloMap.get(item.codigo);
      const ubicacionOrigenId =
        item.id_ubicacion_origen;

      const stockResult = await ejecutar(
        `
        SELECT
          ISNULL(cantidad, 0) AS cantidad
        FROM dbo.stock WITH (UPDLOCK, HOLDLOCK)
        WHERE id_deposito = @depositoId
          AND id_ubicacion = @ubicacionId
          AND id_articulo = @articuloId;
        `,
        (request) =>
          request
            .input("depositoId", sql.Int, origenId)
            .input(
              "ubicacionId",
              sql.Int,
              ubicacionOrigenId,
            )
            .input(
              "articuloId",
              sql.Int,
              articulo.id_articulo,
            ),
      );

      const disponible = stockResult.recordset.length
        ? Number(stockResult.recordset[0].cantidad || 0)
        : 0;

      if (disponible < item.cantidad) {
        faltantes.push({
          codigo: item.codigo,
          descripcion: articulo.descripcion,
          requerido: item.cantidad,
          disponible,
          faltante: item.cantidad - disponible,
          deposito: depositoMap.get(origenId),
          ubicacion: ubicacionOrigen.nombre,
        });
      }
    }

    if (faltantes.length) {
      await transaction.rollback();

      return res.status(400).json({
        error:
          "Stock insuficiente en la ubicación origen",
        faltantes,
      });
    }

    // =====================================================
    // INSERTAR CABECERA
    // =====================================================

    const origenTexto =
      `${depositoMap.get(origenId)} - ${ubicacionOrigen.nombre}`;

    const destinoTexto =
      `${depositoMap.get(destinoId)} - ${ubicacionDestino.nombre}`;

    const cabeceraResult = await ejecutar(
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
      OUTPUT INSERTED.id
      VALUES
      (
        @origen,
        @destino,
        GETDATE(),
        COALESCE(@fechaReal, CONVERT(date, GETDATE())),
        @remitoReferencia,
        @referenteId,
        @ubicacionOrigenId,
        @ubicacionDestinoId,
        @usuario
      );
      `,
      (request) =>
        request
          .input(
            "origen",
            sql.VarChar(100),
            origenTexto,
          )
          .input(
            "destino",
            sql.VarChar(100),
            destinoTexto,
          )
          .input("fechaReal", sql.Date, fechaReal)
          .input(
            "remitoReferencia",
            sql.NVarChar(100),
            remitoReferencia,
          )
          .input(
            "referenteId",
            sql.Int,
            referenteId,
          )
          .input(
            "ubicacionOrigenId",
            sql.Int,
            itemsMerged[0]?.id_ubicacion_origen,
          )
          .input(
            "ubicacionDestinoId",
            sql.Int,
            ubicacionDestinoId,
          )
          .input(
            "usuario",
            sql.VarChar(120),
            usuario,
          ),
    );

    const transferenciaId = Number(
      cabeceraResult.recordset[0].id,
    );

    await ejecutar(
      `
      UPDATE dbo.transferencias
      SET numero_transferencia =
        CAST(id AS VARCHAR(20))
      WHERE id = @transferenciaId;
      `,
      (request) =>
        request.input(
          "transferenciaId",
          sql.Int,
          transferenciaId,
        ),
    );

    // =====================================================
    // DETALLE Y MOVIMIENTO DE STOCK
    // =====================================================

    for (const item of itemsMerged) {
      const articulo = articuloMap.get(item.codigo);
      const cantidad = Number(item.cantidad);

      // Descontar exclusivamente de la ubicación origen
      const descuentoResult = await ejecutar(
        `
        UPDATE dbo.stock
        SET cantidad = cantidad - @cantidad
        WHERE id_deposito = @depositoId
          AND id_ubicacion = @ubicacionId
          AND id_articulo = @articuloId
          AND cantidad >= @cantidad;

        SELECT @@ROWCOUNT AS filas;
        `,
        (request) =>
          request
            .input(
              "cantidad",
              sql.Decimal(18, 2),
              cantidad,
            )
            .input("depositoId", sql.Int, origenId)
            .input(
              "ubicacionId",
              sql.Int,
              item.id_ubicacion_origen,
            )
            .input(
              "articuloId",
              sql.Int,
              articulo.id_articulo,
            ),
      );

      const filasDescontadas = Number(
        descuentoResult.recordset?.[0]?.filas || 0,
      );

      if (filasDescontadas !== 1) {
        throw new Error(
          `No se pudo descontar el artículo ${item.codigo} de la ubicación ${ubicacionOrigen.nombre}`,
        );
      }

      // Sumar exclusivamente en la ubicación destino
      await ejecutar(
        `
        MERGE dbo.stock WITH (HOLDLOCK) AS destino

        USING
        (
          SELECT
            @depositoId AS id_deposito,
            @ubicacionId AS id_ubicacion,
            @articuloId AS id_articulo
        ) AS origen

        ON destino.id_deposito = origen.id_deposito
        AND destino.id_ubicacion = origen.id_ubicacion
        AND destino.id_articulo = origen.id_articulo

        WHEN MATCHED THEN
          UPDATE SET
            cantidad = destino.cantidad + @cantidad

        WHEN NOT MATCHED THEN
          INSERT
          (
            id_deposito,
            id_ubicacion,
            id_articulo,
            cantidad,
            asignado
          )
          VALUES
          (
            origen.id_deposito,
            origen.id_ubicacion,
            origen.id_articulo,
            @cantidad,
            0
          );
        `,
        (request) =>
          request
            .input(
              "depositoId",
              sql.Int,
              destinoId,
            )
            .input(
              "ubicacionId",
              sql.Int,
              ubicacionDestinoId,
            )
            .input(
              "articuloId",
              sql.Int,
              articulo.id_articulo,
            )
            .input(
              "cantidad",
              sql.Decimal(18, 2),
              cantidad,
            ),
      );

      // Guardar detalle
      await ejecutar(
        `
        INSERT INTO dbo.transferencias_detalle
        (
          transferencia_id,
          articulo_id,
          cantidad,
          id_ubicacion_origen
        )
        VALUES
        (
          @transferenciaId,
          @articuloId,
          @cantidad,
          @ubicacionOrigenId
        );
        `,
        (request) =>
          request
            .input(
              "transferenciaId",
              sql.Int,
              transferenciaId,
            )
            .input(
              "articuloId",
              sql.Int,
              articulo.id_articulo,
            )
            .input(
              "cantidad",
              sql.Int,
              Math.trunc(cantidad),
            )
            .input(
              "ubicacionOrigenId",
              sql.Int,
              item.id_ubicacion_origen,
            ),
      );
    }

    await transaction.commit();

    return res.status(201).json({
      message: "Transferencia creada correctamente",
      transferencia: {
        id: transferenciaId,
        numero_transferencia: String(
          transferenciaId,
        ),
        origen: origenTexto,
        destino: destinoTexto,
        id_deposito_origen: origenId,
        id_deposito_destino: destinoId,
        id_ubicacion_origen: itemsMerged[0]?.id_ubicacion_origen,
        id_ubicacion_destino: ubicacionDestinoId,
        fecha_real:
          fechaReal ||
          new Date().toISOString().slice(0, 10),
        remito_referencia: remitoReferencia,
        id_referente: referenteId,
        usuario,
      },
    });
  } catch (err) {
    console.error("transferencias.create:", err);

    try {
      if (transaction) {
        await transaction.rollback();
      }
    } catch (rollbackError) {
      console.error(
        "Error haciendo rollback:",
        rollbackError,
      );
    }

    return res.status(500).json({
      error: "Error al crear la transferencia",
      detalle: err.message,
    });
  }
};

exports.getStockArticulo = async (req, res) => {
  try {
    const codigo = String(req.query.codigo || "")
      .trim()
      .toUpperCase();

    const depositoId = Number(req.query.deposito_id);

    if (
      !codigo ||
      !Number.isInteger(depositoId) ||
      depositoId <= 0
    ) {
      return res.status(400).json({
        error: "Debe indicar codigo y deposito_id válidos",
      });
    }

    await poolConnect;
    const pool = await getPool();

    const result = await pool
      .request()
      .input("codigo", sql.VarChar(100), codigo)
      .input("depositoId", sql.Int, depositoId)
      .query(`
        SELECT
          a.id_articulo,

          UPPER(
            LTRIM(
              RTRIM(a.codigo)
            )
          ) AS codigo,

          a.descripcion,

          ISNULL(
            a.ubicacion,
            ''
          ) AS ubicacion,

          ISNULL(
            SUM(
              CASE
                WHEN s.id_deposito = @depositoId
                  THEN ISNULL(s.cantidad, 0)
                ELSE 0
              END
            ),
            0
          ) AS stock_deposito,

          ISNULL(
            SUM(
              ISNULL(s.cantidad, 0)
            ),
            0
          ) AS stock_total

        FROM dbo.articulos a

        LEFT JOIN dbo.stock s
          ON s.id_articulo = a.id_articulo

        WHERE UPPER(
          LTRIM(
            RTRIM(a.codigo)
          )
        ) = @codigo

        GROUP BY
          a.id_articulo,
          a.codigo,
          a.descripcion,
          a.ubicacion;
      `);

    if (!result.recordset.length) {
      return res.status(404).json({
        error: "Artículo no encontrado",
      });
    }

    const articulo = result.recordset[0];

    const stockDeposito = Number(
      articulo.stock_deposito || 0,
    );

    const stockTotal = Number(
      articulo.stock_total || 0,
    );

    return res.json({
      id_articulo: Number(articulo.id_articulo),

      codigo: articulo.codigo,

      descripcion:
        articulo.descripcion || "",

      ubicacion:
        articulo.ubicacion || "",

      /*
       * Se conserva stock para compatibilidad
       * con cualquier pantalla anterior.
       */
      stock: stockDeposito,

      stock_deposito:
        stockDeposito,

      stock_total:
        stockTotal,
    });
  } catch (err) {
    console.error(
      "transferencias.getStockArticulo:",
      err,
    );

    return res.status(500).json({
      error:
        "Error al consultar stock del artículo",

      detalle:
        err.message,
    });
  }
};
