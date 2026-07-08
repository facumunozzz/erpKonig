const { sql, poolConnect, getPool } = require("../db");

const limpiarTexto = (valor) => String(valor ?? "").trim();

const normalizarCodigo = (valor) =>
  limpiarTexto(valor).toUpperCase();

const normalizarUbicacion = (valor) =>
  limpiarTexto(valor).toUpperCase();

// =====================================================
// GET /stock-recortes
// Lista todos los recortes con cantidades y ubicaciones
// =====================================================
exports.getAll = async (_req, res) => {
  try {
    await poolConnect;
    const pool = await getPool();

    const result = await pool.request().query(`
      SET NOCOUNT ON;

      SELECT
        r.id_recorte,
        r.codigo,
        r.descripcion,
        r.medida,
        r.obra_version,
        ISNULL(SUM(sr.cantidad), 0) AS cantidad_total
      FROM dbo.recortes r WITH (NOLOCK)
      LEFT JOIN dbo.stock_recortes sr WITH (NOLOCK)
        ON sr.id_recorte = r.id_recorte
      WHERE r.activo = 1
      GROUP BY
        r.id_recorte,
        r.codigo,
        r.descripcion,
        r.medida,
        r.obra_version
      ORDER BY
        r.codigo,
        r.medida;
    `);

    const recortes = result.recordset || [];

    if (!recortes.length) {
      return res.json([]);
    }

    const ubicacionesResult = await pool.request().query(`
      SET NOCOUNT ON;

      SELECT
        sr.id_stock_recorte,
        sr.id_recorte,
        sr.ubicacion,
        sr.cantidad
      FROM dbo.stock_recortes sr WITH (NOLOCK)
      INNER JOIN dbo.recortes r WITH (NOLOCK)
        ON r.id_recorte = sr.id_recorte
      WHERE r.activo = 1
        AND sr.cantidad <> 0
      ORDER BY
        sr.id_recorte,
        sr.ubicacion;
    `);

    const ubicacionesPorRecorte = new Map();

    for (const fila of ubicacionesResult.recordset || []) {
      const idRecorte = Number(fila.id_recorte);

      if (!ubicacionesPorRecorte.has(idRecorte)) {
        ubicacionesPorRecorte.set(idRecorte, []);
      }

      ubicacionesPorRecorte.get(idRecorte).push({
        id_stock_recorte: Number(fila.id_stock_recorte),
        ubicacion: fila.ubicacion ?? "",
        cantidad: Number(fila.cantidad || 0),
      });
    }

    const salida = recortes.map((recorte) => {
      const idRecorte = Number(recorte.id_recorte);
      const ubicaciones =
        ubicacionesPorRecorte.get(idRecorte) || [];

      return {
        id_recorte: idRecorte,
        codigo: recorte.codigo,
        descripcion: recorte.descripcion,
        medida: recorte.medida ?? "",
        cantidad: Number(recorte.cantidad_total || 0),
        ubicaciones,
        ubicaciones_label: ubicaciones
          .map((item) => item.ubicacion)
          .join(" / "),
        obra_version: recorte.obra_version ?? "",
      };
    });

    return res.json(salida);
  } catch (err) {
    console.error("Error en stockRecortes.getAll:", err);

    return res.status(500).json({
      error: "Error al obtener el stock de recortes.",
      detalle: err.message,
    });
  }
};

// =====================================================
// GET /stock-recortes/:id
// Obtiene un recorte con todas sus ubicaciones
// =====================================================
exports.getById = async (req, res) => {
  const idRecorte = Number(req.params.id);

  if (!Number.isInteger(idRecorte) || idRecorte <= 0) {
    return res.status(400).json({
      error: "El ID del recorte no es válido.",
    });
  }

  try {
    await poolConnect;
    const pool = await getPool();

    const result = await pool
      .request()
      .input("idRecorte", sql.Int, idRecorte)
      .query(`
        SET NOCOUNT ON;

        SELECT
          r.id_recorte,
          r.codigo,
          r.descripcion,
          r.medida,
          ISNULL(SUM(sr.cantidad), 0) AS cantidad
        FROM dbo.recortes r WITH (NOLOCK)
        LEFT JOIN dbo.stock_recortes sr WITH (NOLOCK)
          ON sr.id_recorte = r.id_recorte
        WHERE r.id_recorte = @idRecorte
          AND r.activo = 1
        GROUP BY
          r.id_recorte,
          r.codigo,
          r.descripcion,
          r.medida;
      `);

    if (!result.recordset.length) {
      return res.status(404).json({
        error: "El recorte no existe.",
      });
    }

    const ubicacionesResult = await pool
      .request()
      .input("idRecorte", sql.Int, idRecorte)
      .query(`
        SELECT
          id_stock_recorte,
          ubicacion,
          cantidad
        FROM dbo.stock_recortes WITH (NOLOCK)
        WHERE id_recorte = @idRecorte
        ORDER BY ubicacion;
      `);

    return res.json({
      ...result.recordset[0],
      cantidad: Number(result.recordset[0].cantidad || 0),
      ubicaciones: (ubicacionesResult.recordset || []).map((item) => ({
        id_stock_recorte: Number(item.id_stock_recorte),
        ubicacion: item.ubicacion,
        cantidad: Number(item.cantidad || 0),
      })),
    });
  } catch (err) {
    console.error("Error en stockRecortes.getById:", err);

    return res.status(500).json({
      error: "Error al obtener el recorte.",
      detalle: err.message,
    });
  }
};

// =====================================================
// POST /stock-recortes
// Crea un recorte con su ubicación inicial
// =====================================================
exports.create = async (req, res) => {
  const codigoBase = normalizarCodigo(req.body.codigo);
  const medida = limpiarTexto(req.body.medida);
  const codigo = medida ? `${codigoBase}_${medida}` : codigoBase;
  const descripcion = limpiarTexto(req.body.descripcion);
  const obraVersion = limpiarTexto(req.body.obra_version);
  const ubicacion = normalizarUbicacion(req.body.ubicacion);
  const cantidad = Number(req.body.cantidad);

  if (!codigoBase) {
    return res.status(400).json({
      error: "Debe indicar el código.",
    });
  }

  if (!descripcion) {
    return res.status(400).json({
      error: "Debe indicar la descripción.",
    });
  }

  if (!medida) {
    return res.status(400).json({
      error: "Debe indicar la medida.",
    });
  }

  if (!ubicacion) {
    return res.status(400).json({
      error: "Debe indicar la ubicación.",
    });
  }

  if (!Number.isFinite(cantidad) || cantidad < 0) {
    return res.status(400).json({
      error: "La cantidad no es válida.",
    });
  }

  try {
    await poolConnect;
    const pool = await getPool();
    const transaction = new sql.Transaction(pool);

    await transaction.begin();

    try {
      const existe = await new sql.Request(transaction)
        .input("codigo", sql.VarChar(80), codigo)
        .query(`
          SELECT TOP 1 id_recorte
          FROM dbo.recortes WITH (UPDLOCK, HOLDLOCK)
          WHERE UPPER(LTRIM(RTRIM(codigo))) = @codigo;
        `);

      if (existe.recordset.length) {
        await transaction.rollback();

        return res.status(409).json({
          error: "Ya existe un recorte con ese código.",
        });
      }

      const recorteResult = await new sql.Request(transaction)
        .input("codigo", sql.VarChar(80), codigo)
        .input("descripcion", sql.VarChar(250), descripcion)
        .input("medida", sql.VarChar(100), medida)
        .input("obraVersion", sql.VarChar(150), obraVersion)
        .query(`
          INSERT INTO dbo.recortes (
            codigo,
            descripcion,
            medida,
            obra_version
          )
          OUTPUT INSERTED.id_recorte
          VALUES (
            @codigo,
            @descripcion,
            @medida,
            @obraVersion
          );
        `);

      const idRecorte =
        recorteResult.recordset[0].id_recorte;

      await new sql.Request(transaction)
        .input("idRecorte", sql.Int, idRecorte)
        .input("ubicacion", sql.VarChar(150), ubicacion)
        .input("cantidad", sql.Decimal(18, 3), cantidad)
        .query(`
          INSERT INTO dbo.stock_recortes (
            id_recorte,
            ubicacion,
            cantidad
          )
          VALUES (
            @idRecorte,
            @ubicacion,
            @cantidad
          );
        `);

      await transaction.commit();

      return res.status(201).json({
        mensaje: "Recorte creado correctamente.",
        id_recorte: idRecorte,
      });
    } catch (err) {
      if (transaction._aborted !== true) {
        await transaction.rollback();
      }

      throw err;
    }
  } catch (err) {
    console.error("Error en stockRecortes.create:", err);

    return res.status(500).json({
      error: "Error al crear el recorte.",
      detalle: err.message,
    });
  }
};

// =====================================================
// PUT /stock-recortes/:id
// Modifica los datos generales del recorte
// =====================================================
exports.update = async (req, res) => {
  const idRecorte = Number(req.params.id);
  const codigo = normalizarCodigo(req.body.codigo);
  const descripcion = limpiarTexto(req.body.descripcion);
  const medida = limpiarTexto(req.body.medida);

  if (!Number.isInteger(idRecorte) || idRecorte <= 0) {
    return res.status(400).json({
      error: "El ID del recorte no es válido.",
    });
  }

  if (!codigo || !descripcion || !medida) {
    return res.status(400).json({
      error: "Código, descripción y medida son obligatorios.",
    });
  }

  try {
    await poolConnect;
    const pool = await getPool();

    const result = await pool
      .request()
      .input("idRecorte", sql.Int, idRecorte)
      .input("codigo", sql.VarChar(80), codigo)
      .input("descripcion", sql.VarChar(250), descripcion)
      .input("medida", sql.VarChar(100), medida)
      .query(`
        UPDATE dbo.recortes
        SET
          codigo = @codigo,
          descripcion = @descripcion,
          medida = @medida
        WHERE id_recorte = @idRecorte
          AND activo = 1;

        SELECT @@ROWCOUNT AS afectados;
      `);

    if (!Number(result.recordset[0]?.afectados || 0)) {
      return res.status(404).json({
        error: "El recorte no existe.",
      });
    }

    return res.json({
      mensaje: "Recorte actualizado correctamente.",
    });
  } catch (err) {
    if (
      err.number === 2601 ||
      err.number === 2627
    ) {
      return res.status(409).json({
        error: "Ya existe otro recorte con ese código.",
      });
    }

    console.error("Error en stockRecortes.update:", err);

    return res.status(500).json({
      error: "Error al actualizar el recorte.",
      detalle: err.message,
    });
  }
};

// =====================================================
// POST /stock-recortes/:id/ubicaciones
// Agrega cantidad a una ubicación
// =====================================================
exports.agregarUbicacion = async (req, res) => {
  const idRecorte = Number(req.params.id);
  const ubicacion = normalizarUbicacion(req.body.ubicacion);
  const cantidad = Number(req.body.cantidad);

  if (!Number.isInteger(idRecorte) || idRecorte <= 0) {
    return res.status(400).json({
      error: "El ID del recorte no es válido.",
    });
  }

  if (!ubicacion) {
    return res.status(400).json({
      error: "Debe indicar la ubicación.",
    });
  }

  if (!Number.isFinite(cantidad) || cantidad <= 0) {
    return res.status(400).json({
      error: "La cantidad debe ser mayor que cero.",
    });
  }

  try {
    await poolConnect;
    const pool = await getPool();

    const result = await pool
      .request()
      .input("idRecorte", sql.Int, idRecorte)
      .input("ubicacion", sql.VarChar(150), ubicacion)
      .input("cantidad", sql.Decimal(18, 3), cantidad)
      .query(`
        SET NOCOUNT ON;
        SET XACT_ABORT ON;

        BEGIN TRANSACTION;

        IF NOT EXISTS (
          SELECT 1
          FROM dbo.recortes WITH (UPDLOCK, HOLDLOCK)
          WHERE id_recorte = @idRecorte
            AND activo = 1
        )
        BEGIN
          ROLLBACK TRANSACTION;
          THROW 50001, 'El recorte no existe.', 1;
        END;

        UPDATE dbo.stock_recortes WITH (UPDLOCK)
        SET
          cantidad = cantidad + @cantidad,
          fecha_actualizacion = SYSDATETIME()
        WHERE id_recorte = @idRecorte
          AND UPPER(LTRIM(RTRIM(ubicacion))) = @ubicacion;

        IF @@ROWCOUNT = 0
        BEGIN
          INSERT INTO dbo.stock_recortes (
            id_recorte,
            ubicacion,
            cantidad
          )
          VALUES (
            @idRecorte,
            @ubicacion,
            @cantidad
          );
        END;

        COMMIT TRANSACTION;

        SELECT
          id_stock_recorte,
          id_recorte,
          ubicacion,
          cantidad
        FROM dbo.stock_recortes
        WHERE id_recorte = @idRecorte
          AND UPPER(LTRIM(RTRIM(ubicacion))) = @ubicacion;
      `);

    return res.json({
      mensaje: "Stock agregado correctamente.",
      registro: result.recordset[0],
    });
  } catch (err) {
    console.error(
      "Error en stockRecortes.agregarUbicacion:",
      err
    );

    return res.status(
      err.number === 50001 ? 404 : 500
    ).json({
      error:
        err.number === 50001
          ? "El recorte no existe."
          : "Error al agregar stock.",
      detalle: err.message,
    });
  }
};

// =====================================================
// POST /stock-recortes/:id/consumir
// Descuenta stock de una ubicación
// =====================================================
exports.consumir = async (req, res) => {
  const idRecorte = Number(req.params.id);
  const ubicacion = normalizarUbicacion(req.body.ubicacion);
  const cantidad = Number(req.body.cantidad);

  if (!Number.isInteger(idRecorte) || idRecorte <= 0) {
    return res.status(400).json({
      error: "El ID del recorte no es válido.",
    });
  }

  if (!ubicacion) {
    return res.status(400).json({
      error: "Debe indicar la ubicación.",
    });
  }

  if (!Number.isFinite(cantidad) || cantidad <= 0) {
    return res.status(400).json({
      error: "La cantidad debe ser mayor que cero.",
    });
  }

  try {
    await poolConnect;
    const pool = await getPool();

    const result = await pool
      .request()
      .input("idRecorte", sql.Int, idRecorte)
      .input("ubicacion", sql.VarChar(150), ubicacion)
      .input("cantidad", sql.Decimal(18, 3), cantidad)
      .query(`
        SET NOCOUNT ON;
        SET XACT_ABORT ON;

        BEGIN TRANSACTION;

        UPDATE dbo.stock_recortes WITH (UPDLOCK, ROWLOCK)
        SET
          cantidad = cantidad - @cantidad,
          fecha_actualizacion = SYSDATETIME()
        WHERE id_recorte = @idRecorte
          AND UPPER(LTRIM(RTRIM(ubicacion))) = @ubicacion
          AND cantidad >= @cantidad;

        IF @@ROWCOUNT = 0
        BEGIN
          ROLLBACK TRANSACTION;
          THROW 50002, 'Stock insuficiente en la ubicación seleccionada.', 1;
        END;

        COMMIT TRANSACTION;

        SELECT
          id_stock_recorte,
          id_recorte,
          ubicacion,
          cantidad
        FROM dbo.stock_recortes
        WHERE id_recorte = @idRecorte
          AND UPPER(LTRIM(RTRIM(ubicacion))) = @ubicacion;
      `);

    return res.json({
      mensaje: "Stock consumido correctamente.",
      registro: result.recordset[0],
    });
  } catch (err) {
    console.error("Error en stockRecortes.consumir:", err);

    return res.status(
      err.number === 50002 ? 409 : 500
    ).json({
      error:
        err.number === 50002
          ? "No hay stock suficiente en esa ubicación."
          : "Error al consumir stock de recortes.",
      detalle: err.message,
    });
  }
};

// =====================================================
// DELETE /stock-recortes/:id
// Baja lógica del recorte
// =====================================================
exports.remove = async (req, res) => {
  const idRecorte = Number(req.params.id);

  if (!Number.isInteger(idRecorte) || idRecorte <= 0) {
    return res.status(400).json({
      error: "El ID del recorte no es válido.",
    });
  }

  try {
    await poolConnect;
    const pool = await getPool();

    const result = await pool
      .request()
      .input("idRecorte", sql.Int, idRecorte)
      .query(`
        UPDATE dbo.recortes
        SET activo = 0
        WHERE id_recorte = @idRecorte
          AND activo = 1;

        SELECT @@ROWCOUNT AS afectados;
      `);

    if (!Number(result.recordset[0]?.afectados || 0)) {
      return res.status(404).json({
        error: "El recorte no existe.",
      });
    }

    return res.json({
      mensaje: "Recorte eliminado correctamente.",
    });
  } catch (err) {
    console.error("Error en stockRecortes.remove:", err);

    return res.status(500).json({
      error: "Error al eliminar el recorte.",
      detalle: err.message,
    });
  }
};

exports.getArticuloByCodigo = async (req, res) => {
  const codigo = normalizarCodigo(req.params.codigo);

  if (!codigo) {
    return res.status(400).json({
      error: "Debe indicar el código.",
    });
  }

  try {
    await poolConnect;
    const pool = await getPool();

    const result = await pool
      .request()
      .input("codigo", sql.VarChar(100), codigo)
      .query(`
        SELECT TOP 1
          codigo,
          descripcion
        FROM dbo.articulos WITH (NOLOCK)
        WHERE UPPER(LTRIM(RTRIM(codigo))) = @codigo;
      `);

    if (!result.recordset.length) {
      return res.status(404).json({
        error: "Artículo no encontrado.",
      });
    }

    return res.json(result.recordset[0]);
  } catch (err) {
    console.error("Error en stockRecortes.getArticuloByCodigo:", err);

    return res.status(500).json({
      error: "Error al buscar el artículo.",
      detalle: err.message,
    });
  }
};