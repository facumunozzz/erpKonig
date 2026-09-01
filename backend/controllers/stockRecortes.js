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
        sr.id_ubicacion_recorte,

        COALESCE(
          ru.nombre,
          sr.ubicacion,
          'SIN UBICACION'
        ) AS ubicacion,

        sr.cantidad

      FROM dbo.stock_recortes sr WITH (NOLOCK)

      INNER JOIN dbo.recortes r WITH (NOLOCK)
        ON r.id_recorte = sr.id_recorte

      LEFT JOIN dbo.recortes_ubicaciones ru WITH (NOLOCK)
        ON ru.id_ubicacion_recorte =
          sr.id_ubicacion_recorte

      WHERE r.activo = 1
        AND sr.cantidad <> 0

      ORDER BY
        sr.id_recorte,

        CASE
          WHEN UPPER(
            LTRIM(
              RTRIM(
                COALESCE(
                  ru.nombre,
                  sr.ubicacion,
                  ''
                )
              )
            )
          ) = 'GENERAL'
          THEN 0
          ELSE 1
        END,

        ubicacion;
    `);

    const ubicacionesPorRecorte = new Map();

    for (const fila of ubicacionesResult.recordset || []) {
      const idRecorte = Number(fila.id_recorte);

      if (!ubicacionesPorRecorte.has(idRecorte)) {
        ubicacionesPorRecorte.set(idRecorte, []);
      }

      ubicacionesPorRecorte.get(idRecorte).push({
        id_stock_recorte: Number(
          fila.id_stock_recorte
        ),

        id_ubicacion_recorte: fila.id_ubicacion_recorte
          ? Number(fila.id_ubicacion_recorte)
          : null,

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
      sr.id_stock_recorte,
      sr.id_ubicacion_recorte,

      COALESCE(
        ru.nombre,
        sr.ubicacion,
        'SIN UBICACION'
      ) AS ubicacion,

      sr.cantidad

    FROM dbo.stock_recortes sr WITH (NOLOCK)

    LEFT JOIN dbo.recortes_ubicaciones ru WITH (NOLOCK)
      ON ru.id_ubicacion_recorte =
         sr.id_ubicacion_recorte

    WHERE sr.id_recorte = @idRecorte

    ORDER BY
      CASE
        WHEN UPPER(
          LTRIM(
            RTRIM(
              COALESCE(
                ru.nombre,
                sr.ubicacion,
                ''
              )
            )
          )
        ) = 'GENERAL'
        THEN 0
        ELSE 1
      END,

      ubicacion;
  `);

    return res.json({
      ...result.recordset[0],
      cantidad: Number(result.recordset[0].cantidad || 0),
      ubicaciones: (
        ubicacionesResult.recordset || []
      ).map((item) => ({
        id_stock_recorte: Number(
          item.id_stock_recorte
        ),

        id_ubicacion_recorte:
          item.id_ubicacion_recorte
            ? Number(item.id_ubicacion_recorte)
            : null,

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
  const codigo = medida
    ? `${codigoBase}_${medida}`
    : codigoBase;

  const descripcion = limpiarTexto(
    req.body.descripcion
  );

  const obraVersion = limpiarTexto(
    req.body.obra_version
  );

  const idUbicacionRecorte = Number(
    req.body.id_ubicacion_recorte
  );

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

  if (
    !Number.isInteger(idUbicacionRecorte) ||
    idUbicacionRecorte <= 0
  ) {
    return res.status(400).json({
      error: "Debe seleccionar una ubicación válida.",
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

      const ubicacionResult = await new sql.Request(transaction)
        .input(
          "idUbicacionRecorte",
          sql.Int,
          idUbicacionRecorte
        )
        .query(`
          SELECT TOP 1
            nombre
          FROM dbo.recortes_ubicaciones WITH (UPDLOCK, HOLDLOCK)
          WHERE id_ubicacion_recorte = @idUbicacionRecorte
            AND activo = 1;
        `);

      if (!ubicacionResult.recordset.length) {
        await transaction.rollback();

        return res.status(400).json({
          error: "La ubicación seleccionada no existe.",
        });
      }

      const nombreUbicacion = normalizarUbicacion(
        ubicacionResult.recordset[0].nombre
      );

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
        .input(
          "idUbicacionRecorte",
          sql.Int,
          idUbicacionRecorte
        )
        .input(
          "ubicacion",
          sql.VarChar(150),
          nombreUbicacion
        )
        .input(
          "cantidad",
          sql.Decimal(18, 3),
          cantidad
        )
        .query(`
          INSERT INTO dbo.stock_recortes (
            id_recorte,
            id_ubicacion_recorte,
            ubicacion,
            cantidad
          )
          VALUES (
            @idRecorte,
            @idUbicacionRecorte,
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
  const idUbicacionRecorte = Number(
    req.body.id_ubicacion_recorte
  );
  const cantidad = Number(req.body.cantidad);

  if (!Number.isInteger(idRecorte) || idRecorte <= 0) {
    return res.status(400).json({
      error: "El ID del recorte no es válido.",
    });
  }

  if (
    !Number.isInteger(idUbicacionRecorte) ||
    idUbicacionRecorte <= 0
  ) {
    return res.status(400).json({
      error: "Debe seleccionar una ubicación válida.",
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
          AND id_ubicacion_recorte = @idUbicacionRecorte;

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
  const idUbicacionRecorte = Number(
    req.body.id_ubicacion_recorte
  );
  const cantidad = Number(req.body.cantidad);

  if (!Number.isInteger(idRecorte) || idRecorte <= 0) {
    return res.status(400).json({
      error: "El ID del recorte no es válido.",
    });
  }

  if (
    !Number.isInteger(idUbicacionRecorte) ||
    idUbicacionRecorte <= 0
  ) {
    return res.status(400).json({
      error: "Debe indicar una ubicación válida.",
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
      .input(
        "idUbicacionRecorte",
        sql.Int,
        idUbicacionRecorte
      )
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
          AND id_ubicacion_recorte =
              @idUbicacionRecorte
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
          AND id_ubicacion_recorte = @idUbicacionRecorte;
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

exports.getUbicaciones = async (_req, res) => {
  try {
    await poolConnect;
    const pool = await getPool();

    const result = await pool.request().query(`
      SELECT
        id_ubicacion_recorte,
        nombre,
        activo
      FROM dbo.recortes_ubicaciones WITH (NOLOCK)
      WHERE activo = 1
      ORDER BY
        CASE
          WHEN UPPER(LTRIM(RTRIM(nombre))) = 'GENERAL'
          THEN 0
          ELSE 1
        END,
        nombre;
    `);

    return res.json(result.recordset || []);
  } catch (err) {
    console.error(
      "Error en stockRecortes.getUbicaciones:",
      err
    );

    return res.status(500).json({
      error: "Error al obtener las ubicaciones.",
      detalle: err.message,
    });
  }
};

exports.crearUbicacion = async (req, res) => {
  const nombre = normalizarUbicacion(req.body.nombre);

  if (!nombre) {
    return res.status(400).json({
      error: "Debe indicar el nombre de la ubicación.",
    });
  }

  try {
    await poolConnect;
    const pool = await getPool();

    const existente = await pool
      .request()
      .input("nombre", sql.VarChar(150), nombre)
      .query(`
        SELECT TOP 1
          id_ubicacion_recorte,
          activo
        FROM dbo.recortes_ubicaciones
        WHERE UPPER(LTRIM(RTRIM(nombre))) = @nombre;
      `);

    if (existente.recordset.length) {
      const ubicacion = existente.recordset[0];

      if (ubicacion.activo) {
        return res.status(409).json({
          error: "Ya existe una ubicación con ese nombre.",
        });
      }

      await pool
        .request()
        .input(
          "id",
          sql.Int,
          Number(ubicacion.id_ubicacion_recorte)
        )
        .query(`
          UPDATE dbo.recortes_ubicaciones
          SET activo = 1
          WHERE id_ubicacion_recorte = @id;
        `);

      return res.status(201).json({
        mensaje: "Ubicación reactivada correctamente.",
      });
    }

    const result = await pool
      .request()
      .input("nombre", sql.VarChar(150), nombre)
      .query(`
        INSERT INTO dbo.recortes_ubicaciones (
          nombre
        )
        OUTPUT
          INSERTED.id_ubicacion_recorte,
          INSERTED.nombre
        VALUES (
          @nombre
        );
      `);

    return res.status(201).json({
      mensaje: "Ubicación creada correctamente.",
      ubicacion: result.recordset[0],
    });
  } catch (err) {
    console.error(
      "Error en stockRecortes.crearUbicacion:",
      err
    );

    return res.status(500).json({
      error: "Error al crear la ubicación.",
      detalle: err.message,
    });
  }
};

exports.actualizarUbicacion = async (req, res) => {
  const id = Number(req.params.id);
  const nombre = normalizarUbicacion(req.body.nombre);

  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({
      error: "El ID de ubicación no es válido.",
    });
  }

  if (!nombre) {
    return res.status(400).json({
      error: "Debe indicar el nombre.",
    });
  }

  try {
    await poolConnect;
    const pool = await getPool();

    const result = await pool
      .request()
      .input("id", sql.Int, id)
      .input("nombre", sql.VarChar(150), nombre)
      .query(`
        IF EXISTS (
          SELECT 1
          FROM dbo.recortes_ubicaciones
          WHERE UPPER(LTRIM(RTRIM(nombre))) = @nombre
            AND id_ubicacion_recorte <> @id
        )
        BEGIN
          THROW 50003, 'Ya existe una ubicación con ese nombre.', 1;
        END;

        UPDATE dbo.recortes_ubicaciones
        SET nombre = @nombre
        WHERE id_ubicacion_recorte = @id
          AND activo = 1;

        SELECT @@ROWCOUNT AS afectados;
      `);

    if (!Number(result.recordset[0]?.afectados || 0)) {
      return res.status(404).json({
        error: "La ubicación no existe.",
      });
    }

    // Mantener sincronizada la columna vieja.
    await pool
      .request()
      .input("id", sql.Int, id)
      .input("nombre", sql.VarChar(150), nombre)
      .query(`
        UPDATE dbo.stock_recortes
        SET ubicacion = @nombre
        WHERE id_ubicacion_recorte = @id;
      `);

    return res.json({
      mensaje: "Ubicación actualizada correctamente.",
    });
  } catch (err) {
    console.error(
      "Error en stockRecortes.actualizarUbicacion:",
      err
    );

    return res.status(
      err.number === 50003 ? 409 : 500
    ).json({
      error:
        err.number === 50003
          ? "Ya existe una ubicación con ese nombre."
          : "Error al modificar la ubicación.",
      detalle: err.message,
    });
  }
};

exports.eliminarUbicacion = async (req, res) => {
  const id = Number(req.params.id);

  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({
      error: "El ID de ubicación no es válido.",
    });
  }

  try {
    await poolConnect;
    const pool = await getPool();

    const ubicacionResult = await pool
      .request()
      .input("id", sql.Int, id)
      .query(`
        SELECT TOP 1
          nombre
        FROM dbo.recortes_ubicaciones
        WHERE id_ubicacion_recorte = @id
          AND activo = 1;
      `);

    if (!ubicacionResult.recordset.length) {
      return res.status(404).json({
        error: "La ubicación no existe.",
      });
    }

    const nombre = normalizarUbicacion(
      ubicacionResult.recordset[0].nombre
    );

    if (nombre === "GENERAL") {
      return res.status(409).json({
        error: "La ubicación GENERAL no puede eliminarse.",
      });
    }

    const stockResult = await pool
      .request()
      .input("id", sql.Int, id)
      .query(`
        SELECT
          COUNT(*) AS registros,
          ISNULL(SUM(ABS(cantidad)), 0) AS cantidad
        FROM dbo.stock_recortes
        WHERE id_ubicacion_recorte = @id;
      `);

    const registros = Number(
      stockResult.recordset[0]?.registros || 0
    );

    const cantidad = Number(
      stockResult.recordset[0]?.cantidad || 0
    );

    if (registros > 0 && cantidad !== 0) {
      return res.status(409).json({
        error:
          "No puede eliminarse porque tiene stock asociado.",
      });
    }

    await pool
      .request()
      .input("id", sql.Int, id)
      .query(`
        UPDATE dbo.recortes_ubicaciones
        SET activo = 0
        WHERE id_ubicacion_recorte = @id;
      `);

    return res.json({
      mensaje: "Ubicación eliminada correctamente.",
    });
  } catch (err) {
    console.error(
      "Error en stockRecortes.eliminarUbicacion:",
      err
    );

    return res.status(500).json({
      error: "Error al eliminar la ubicación.",
      detalle: err.message,
    });
  }
};

exports.getRecorteByCodigo = async (req, res) => {
  const codigo = normalizarCodigo(
    req.params.codigo
  );

  if (!codigo) {
    return res.status(400).json({
      error:
        "Debe ingresar el código completo del recorte.",
    });
  }

  try {
    await poolConnect;
    const pool = await getPool();

    const result = await pool
      .request()
      .input(
        "codigo",
        sql.VarChar(150),
        codigo
      )
      .query(`
        SELECT TOP 1
          id_recorte,
          codigo,
          descripcion,
          medida,
          obra_version
        FROM dbo.recortes WITH (NOLOCK)
        WHERE
          UPPER(LTRIM(RTRIM(codigo))) = @codigo
          AND activo = 1;
      `);

    if (!result.recordset.length) {
      return res.status(404).json({
        error:
          "El recorte no existe. Debe crearlo previamente desde Stock Recortes.",
      });
    }

    return res.json(result.recordset[0]);
  } catch (error) {
    console.error(
      "stockRecortes.getRecorteByCodigo:",
      error
    );

    return res.status(500).json({
      error: "Error al buscar el recorte.",
      detalle: error.message,
    });
  }
};

exports.getStockByCodigoUbicacion = async (
  req,
  res
) => {
  const codigo = normalizarCodigo(
    req.query.codigo
  );

  const idUbicacionRecorte = Number(
    req.query.id_ubicacion_recorte
  );

  if (!codigo) {
    return res.status(400).json({
      error:
        "Debe ingresar el código completo del recorte.",
    });
  }

  if (
    !Number.isInteger(idUbicacionRecorte) ||
    idUbicacionRecorte <= 0
  ) {
    return res.status(400).json({
      error:
        "Debe seleccionar una ubicación válida.",
    });
  }

  try {
    await poolConnect;
    const pool = await getPool();

    const result = await pool
      .request()
      .input(
        "codigo",
        sql.VarChar(150),
        codigo
      )
      .input(
        "idUbicacionRecorte",
        sql.Int,
        idUbicacionRecorte
      )
      .query(`
        SELECT
          r.id_recorte,
          r.codigo,
          r.descripcion,
          r.medida,

          ISNULL(
            SUM(
              CASE
                WHEN sr.id_ubicacion_recorte =
                     @idUbicacionRecorte
                THEN sr.cantidad
                ELSE 0
              END
            ),
            0
          ) AS stock_ubicacion,

          ISNULL(
            SUM(sr.cantidad),
            0
          ) AS stock_total

        FROM dbo.recortes r

        LEFT JOIN dbo.stock_recortes sr
          ON sr.id_recorte = r.id_recorte

        WHERE
          UPPER(LTRIM(RTRIM(r.codigo))) =
          @codigo
          AND r.activo = 1

        GROUP BY
          r.id_recorte,
          r.codigo,
          r.descripcion,
          r.medida;
      `);

    if (!result.recordset.length) {
      return res.status(404).json({
        error:
          "El recorte no existe.",
      });
    }

    return res.json({
      ...result.recordset[0],
      stock_ubicacion: Number(
        result.recordset[0].stock_ubicacion || 0
      ),
      stock_total: Number(
        result.recordset[0].stock_total || 0
      ),
    });
  } catch (error) {
    console.error(
      "stockRecortes.getStockByCodigoUbicacion:",
      error
    );

    return res.status(500).json({
      error:
        "Error al consultar el stock del recorte.",
      detalle: error.message,
    });
  }
};
