const { sql, poolConnect, getPool } = require("../db");
const { resolverOperacionUsuario } = require("../utils/operacionUsuario");
const {
  ocultarOrdenesFinalizadasCompletas: ejecutarOcultamientoFinalizadasCompletas,
} = require("../services/ordenesTrabajoLimpieza");

function texto(valor) {
  const resultado = String(valor ?? "").trim();
  return resultado || null;
}

function numero(valor) {
  const resultado = Number(valor);
  return Number.isFinite(resultado) ? resultado : null;
}

function redondear4(valor) {
  return Number((Number(valor) || 0).toFixed(4));
}

function fechaValida(valor) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(valor || ""));
}

function horaValida(valor) {
  if (valor === null || valor === undefined || String(valor).trim() === "") {
    return null;
  }

  const valorTexto = String(valor).trim();

  if (!/^\d{2}:\d{2}(:\d{2})?$/.test(valorTexto)) {
    return undefined;
  }

  return valorTexto.length === 5 ? `${valorTexto}:00` : valorTexto;
}

function obtenerUsuario(req) {
  return req.user?.username || req.user?.email || req.user?.name || null;
}

function formatFechaOT(fechaIso) {
  const [anio, mes, dia] = String(fechaIso || "").split("-");
  return `${dia}/${mes}/${anio}`;
}

function crearOtid(orden) {
  const obraVersion = String(orden.obra_version || "").trim();
  const operacion = String(orden.operacion || "")
    .trim()
    .toUpperCase();
  const fecha = formatFechaOT(orden.fecha_planificada);

  return `${obraVersion}_${fecha}_${operacion}`;
}

async function leerDetalle(executor, id) {
  const requestCabecera =
    executor instanceof sql.Transaction
      ? new sql.Request(executor)
      : executor.request();

  const cabecera = await requestCabecera.input("id", sql.Int, id).query(`
      SELECT
        ot.id_ot,
        ot.otid,
        ot.fecha_planificada,
        ot.obra_version,
        ot.fase,
        ot.id_operacion,
        ot.operacion,
        ot.tipo_ot,
        ot.id_ot_origen,
        ot.id_ot_raiz,
        origen.otid AS ot_origen_otid,
        raiz.otid AS ot_raiz_otid,
        ot.motivo_indirecto,
        ot.cantidad_pedida,
        ot.cantidad_fabricada,
        ot.operador,
        CONVERT(VARCHAR(8), ot.hora_inicio, 108) AS hora_inicio,
        CONVERT(VARCHAR(8), ot.hora_fin, 108) AS hora_fin,
        CONVERT(VARCHAR(19), ot.inicio_real, 126) AS inicio_real,
        CONVERT(VARCHAR(19), ot.fin_real, 126) AS fin_real,
        ot.tiempo_indirecto_segundos,
        (
          SELECT TOP 1
            CONVERT(VARCHAR(19), ind.inicio_real, 126)
          FROM dbo.ordenes_trabajo ind
          WHERE ind.id_ot_origen = ot.id_ot
            AND ind.tipo_ot = 'INDIRECTO'
            AND ind.estado = 'EN_PROCESO'
            AND ind.fin_real IS NULL
          ORDER BY ind.id_ot DESC
        ) AS inicio_indirecto_activo,
        ot.observacion,
        ot.estado,
        ot.usuario_creacion,
        ot.fecha_creacion,
        ot.fecha_modificacion
      FROM dbo.ordenes_trabajo ot
      LEFT JOIN dbo.ordenes_trabajo origen
        ON origen.id_ot = ot.id_ot_origen
      LEFT JOIN dbo.ordenes_trabajo raiz
        ON raiz.id_ot = COALESCE(ot.id_ot_raiz, ot.id_ot)
      WHERE ot.id_ot = @id;
    `);

  if (!cabecera.recordset.length) {
    return null;
  }

  const idOtRaiz =
    Number(cabecera.recordset[0].id_ot_raiz) ||
    Number(cabecera.recordset[0].id_ot);

  const requestMateriales =
    executor instanceof sql.Transaction
      ? new sql.Request(executor)
      : executor.request();

  const materiales = await requestMateriales.input("idRaiz", sql.Int, idOtRaiz)
    .query(`
      SELECT
        id_ot_material,
        id_ot,
        id_articulo,
        codigo,
        descripcion,
        tipo,
        cantidad,
        consumido,
        consumido_stock,
        ISNULL(consumido_recorte, 0) AS consumido_recorte,
        cantidad - consumido AS restante,
        consumido - consumido_stock - ISNULL(consumido_recorte, 0)
          AS pendiente_confirmar_stock
      FROM dbo.ordenes_trabajo_materiales
      WHERE id_ot = @idRaiz
      ORDER BY
        tipo,
        codigo,
        descripcion;
    `);

  return {
    ...cabecera.recordset[0],
    id_ot_materiales: idOtRaiz,
    materiales: materiales.recordset || [],
  };
}

exports.getAll = async (req, res) => {
  try {
    await poolConnect;
    const pool = await getPool();

    const operacionUsuario = await resolverOperacionUsuario(pool, req);
    const usuarioActual = obtenerUsuario(req);

    // Si el usuario coincide con una operación, se restringe a esa operación.
    // Si no coincide con ninguna, operacionUsuario queda en null y ve todas.

    const desde = fechaValida(req.query.desde) ? req.query.desde : null;
    const hasta = fechaValida(req.query.hasta) ? req.query.hasta : null;
    const estado = texto(req.query.estado);

    const result = await pool
      .request()
      .input("desde", sql.Date, desde)
      .input("hasta", sql.Date, hasta)
      .input("estado", sql.VarChar(20), estado)
      .input("operacionUsuario", sql.NVarChar(150), operacionUsuario)
      .input("usuarioActual", sql.NVarChar(255), usuarioActual).query(`
        SELECT
          ot.id_ot,
          ot.otid,
          ot.fecha_planificada,
          ot.obra_version,
          ot.fase,
          ot.id_operacion,
          ot.operacion,
          ot.tipo_ot,
          ot.id_ot_origen,
          ot.id_ot_raiz,
          origen.otid AS ot_origen_otid,
          raiz.otid AS ot_raiz_otid,
          ot.motivo_indirecto,
          ot.cantidad_pedida,
          ot.cantidad_fabricada,
          ot.operador,
          CONVERT(VARCHAR(8), ot.hora_inicio, 108) AS hora_inicio,
          CONVERT(VARCHAR(8), ot.hora_fin, 108) AS hora_fin,
          CONVERT(VARCHAR(19), ot.inicio_real, 126) AS inicio_real,
          CONVERT(VARCHAR(19), ot.fin_real, 126) AS fin_real,
          ot.tiempo_indirecto_segundos,
          (
            SELECT TOP 1
              CONVERT(VARCHAR(19), ind.inicio_real, 126)
            FROM dbo.ordenes_trabajo ind
            WHERE ind.id_ot_origen = ot.id_ot
              AND ind.tipo_ot = 'INDIRECTO'
              AND ind.estado = 'EN_PROCESO'
              AND ind.fin_real IS NULL
            ORDER BY ind.id_ot DESC
          ) AS inicio_indirecto_activo,
          ot.observacion,
          ot.estado,
          ot.usuario_creacion,
          (
            SELECT COUNT(*)
            FROM dbo.ordenes_trabajo_materiales mat
            WHERE mat.id_ot = COALESCE(ot.id_ot_raiz, ot.id_ot)
          ) AS cantidad_materiales
        FROM dbo.ordenes_trabajo ot
        LEFT JOIN dbo.ordenes_trabajo origen
          ON origen.id_ot = ot.id_ot_origen
        LEFT JOIN dbo.ordenes_trabajo raiz
          ON raiz.id_ot = COALESCE(ot.id_ot_raiz, ot.id_ot)
        WHERE
          ot.mostrar = 1
          AND (@desde IS NULL OR ot.fecha_planificada >= @desde)
          AND (@hasta IS NULL OR ot.fecha_planificada <= @hasta)
          AND (@estado IS NULL OR ot.estado = @estado)
          AND (
            @operacionUsuario IS NULL
            OR (
              -- Indirecto independiente: pertenece al usuario que lo creó.
              (
                UPPER(LTRIM(RTRIM(ISNULL(ot.tipo_ot, 'PRODUCTIVA')))) = 'INDIRECTO'
                AND ot.id_ot_origen IS NULL
                AND LTRIM(RTRIM(ISNULL(ot.usuario_creacion, '')))
                    COLLATE Latin1_General_100_CI_AI
                  = LTRIM(RTRIM(ISNULL(@usuarioActual, '')))
                    COLLATE Latin1_General_100_CI_AI
              )
              OR
              -- OT productiva o indirecto generado al pausar una OT:
              -- se conserva el filtro normal por operación.
              (
                CASE
                  WHEN UPPER(LTRIM(RTRIM(ISNULL(ot.tipo_ot, 'PRODUCTIVA')))) = 'INDIRECTO'
                    THEN origen.operacion
                  ELSE ot.operacion
                END
              ) COLLATE Latin1_General_100_CI_AI
                = @operacionUsuario COLLATE Latin1_General_100_CI_AI
            )
          )
        ORDER BY
          CASE WHEN ot.estado = 'EN_PROCESO' THEN 0
               WHEN ot.estado = 'PAUSADA' THEN 1
               WHEN ot.estado = 'PENDIENTE' THEN 2
               ELSE 3 END,
          ot.fecha_planificada DESC,
          ot.id_ot DESC;
      `);

    return res.json(result.recordset || []);
  } catch (error) {
    console.error("ordenesTrabajo.getAll:", error);

    return res.status(500).json({
      error: "Error al obtener las órdenes de trabajo",
      detalle: error.message,
    });
  }
};

exports.getById = async (req, res) => {
  try {
    const id = Number(req.params.id);

    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({
        error: "Orden de trabajo inválida",
      });
    }

    await poolConnect;
    const pool = await getPool();

    const orden = await leerDetalle(pool, id);

    if (!orden) {
      return res.status(404).json({
        error: "Orden de trabajo no encontrada",
      });
    }

    return res.json(orden);
  } catch (error) {
    console.error("ordenesTrabajo.getById:", error);

    return res.status(500).json({
      error: "Error al obtener la orden de trabajo",
      detalle: error.message,
    });
  }
};

exports.getOperadores = async (_req, res) => {
  try {
    await poolConnect;
    const pool = await getPool();

    /*
     * Los operadores de Órdenes de Trabajo salen del mismo maestro
     * que Referentes / Actuantes.
     *
     * Solo se ofrecen referentes activos.
     */
    const result = await pool.request().query(`
      SELECT
        id_referente,
        LTRIM(RTRIM(nombre)) AS operador
      FROM dbo.referentes
      WHERE activo = 1
        AND LTRIM(RTRIM(nombre)) <> ''
      ORDER BY LTRIM(RTRIM(nombre));
    `);

    return res.json(
      (result.recordset || [])
        .map((fila) => ({
          id_referente: Number(fila.id_referente),
          operador: String(fila.operador || "").trim(),
        }))
        .filter((fila) => fila.id_referente > 0 && fila.operador),
    );
  } catch (error) {
    console.error("ordenesTrabajo.getOperadores:", error);

    return res.status(500).json({
      error: "Error al obtener operadores",
      detalle: error.message,
    });
  }
};

// ============================================================
// BUSCAR ARTICULO PARA AGREGARLO COMO MATERIAL DE UNA OT
// ============================================================
exports.buscarArticuloMaterial = async (req, res) => {
  try {
    const codigo = String(req.params.codigo || "")
      .trim()
      .toUpperCase();

    if (!codigo) {
      return res.status(400).json({
        error: "Debe indicar el codigo del articulo",
      });
    }

    await poolConnect;
    const pool = await getPool();

    const result = await pool
      .request()
      .input("codigo", sql.NVarChar(100), codigo).query(`
        SELECT TOP 1
          id_articulo,
          codigo,
          descripcion
        FROM dbo.articulos WITH (NOLOCK)
        WHERE UPPER(LTRIM(RTRIM(codigo))) = @codigo
        ORDER BY id_articulo;
      `);

    if (!result.recordset.length) {
      return res.status(404).json({
        error: "No existe un articulo con ese codigo",
      });
    }

    return res.json(result.recordset[0]);
  } catch (error) {
    console.error("ordenesTrabajo.buscarArticuloMaterial:", error);

    return res.status(500).json({
      error: "Error al buscar el articulo",
      detalle: error.message,
    });
  }
};

// ============================================================
// AGREGAR UN MATERIAL A LA OT RAIZ
// Agregarlo no modifica stock ni registra consumo.
// ============================================================
exports.agregarMaterial = async (req, res) => {
  let transaction;

  try {
    const idOt = Number(req.params.id);
    const codigo = String(req.body?.codigo || "")
      .trim()
      .toUpperCase();
    const tipo = texto(req.body?.tipo) || "MATERIAL";
    const cantidadRaw = Number(req.body?.cantidad);
    const cantidad = redondear4(cantidadRaw);

    if (!Number.isInteger(idOt) || idOt <= 0) {
      return res.status(400).json({
        error: "Orden de trabajo invalida",
      });
    }

    if (!codigo) {
      return res.status(400).json({
        error: "Debe indicar el codigo del articulo",
      });
    }

    if (!Number.isFinite(cantidadRaw) || cantidadRaw <= 0) {
      return res.status(400).json({
        error: "La cantidad planificada debe ser mayor que cero",
      });
    }

    if (Math.abs(cantidadRaw - cantidad) > 0.000001) {
      return res.status(400).json({
        error: "La cantidad admite como maximo 4 decimales",
      });
    }

    await poolConnect;
    const pool = await getPool();

    transaction = new sql.Transaction(pool);
    await transaction.begin();

    const ordenResult = await new sql.Request(transaction).input(
      "idOt",
      sql.Int,
      idOt,
    ).query(`
        SELECT
          id_ot,
          COALESCE(id_ot_raiz, id_ot) AS id_ot_raiz,
          tipo_ot
        FROM dbo.ordenes_trabajo WITH (UPDLOCK, HOLDLOCK)
        WHERE id_ot = @idOt;
      `);

    if (!ordenResult.recordset.length) {
      await transaction.rollback();
      transaction = null;

      return res.status(404).json({
        error: "Orden de trabajo no encontrada",
      });
    }

    const orden = ordenResult.recordset[0];

    if (String(orden.tipo_ot || "PRODUCTIVA").toUpperCase() === "INDIRECTO") {
      await transaction.rollback();
      transaction = null;

      return res.status(400).json({
        error: "No se pueden agregar materiales a una OT indirecta",
      });
    }

    const idOtRaiz = Number(orden.id_ot_raiz);

    const articuloResult = await new sql.Request(transaction).input(
      "codigo",
      sql.NVarChar(100),
      codigo,
    ).query(`
        SELECT TOP 1
          id_articulo,
          codigo,
          descripcion
        FROM dbo.articulos WITH (UPDLOCK, HOLDLOCK)
        WHERE UPPER(LTRIM(RTRIM(codigo))) = @codigo
        ORDER BY id_articulo;
      `);

    if (!articuloResult.recordset.length) {
      await transaction.rollback();
      transaction = null;

      return res.status(404).json({
        error: "No existe un articulo con ese codigo",
      });
    }

    const articulo = articuloResult.recordset[0];

    const repetidoResult = await new sql.Request(transaction)
      .input("idOtRaiz", sql.Int, idOtRaiz)
      .input("codigo", sql.NVarChar(100), codigo).query(`
        SELECT TOP 1
          id_ot_material
        FROM dbo.ordenes_trabajo_materiales WITH (UPDLOCK, HOLDLOCK)
        WHERE id_ot = @idOtRaiz
          AND UPPER(LTRIM(RTRIM(codigo))) = @codigo;
      `);

    if (repetidoResult.recordset.length) {
      await transaction.rollback();
      transaction = null;

      return res.status(409).json({
        error: "Ese articulo ya esta incluido en los materiales de la OT",
      });
    }

    const creadoResult = await new sql.Request(transaction)
      .input("idOtRaiz", sql.Int, idOtRaiz)
      .input("idArticulo", sql.Int, Number(articulo.id_articulo))
      .input("codigo", sql.NVarChar(100), articulo.codigo)
      .input("descripcion", sql.NVarChar(500), articulo.descripcion)
      .input("tipo", sql.NVarChar(150), tipo)
      .input("cantidad", sql.Decimal(18, 4), cantidad).query(`
        INSERT INTO dbo.ordenes_trabajo_materiales
        (
          id_ot,
          id_articulo,
          codigo,
          descripcion,
          tipo,
          cantidad,
          consumido,
          consumido_stock,
          consumido_recorte
        )
        OUTPUT INSERTED.id_ot_material
        VALUES
        (
          @idOtRaiz,
          @idArticulo,
          @codigo,
          @descripcion,
          @tipo,
          @cantidad,
          0,
          0,
          0
        );
      `);

    await transaction.commit();
    transaction = null;

    return res.status(201).json({
      ok: true,
      id_ot_material: Number(creadoResult.recordset[0].id_ot_material),
      mensaje: "Material agregado correctamente",
      orden: await leerDetalle(pool, idOt),
    });
  } catch (error) {
    if (transaction) {
      try {
        await transaction.rollback();
      } catch {}
    }

    console.error("ordenesTrabajo.agregarMaterial:", error);

    return res.status(500).json({
      error: "Error al agregar el material a la orden de trabajo",
      detalle: error.message,
    });
  }
};


// ============================================================
// CREAR INDIRECTO INDEPENDIENTE
// No necesita una OT productiva de origen.
// Queda ligado al usuario autenticado mediante usuario_creacion.
// ============================================================
exports.crearIndirectoIndependiente = async (req, res) => {
  let transaction;

  try {
    const motivo =
      texto(req.body?.motivo) ||
      texto(req.body?.motivo_indirecto) ||
      texto(req.body?.actividad);

    const operador = texto(req.body?.operador);
    const usuario = texto(obtenerUsuario(req));

    if (!usuario) {
      return res.status(401).json({
        error: "No se pudo identificar al usuario autenticado",
      });
    }

    if (!operador) {
      return res.status(400).json({
        error: "Debe seleccionar un operador / actuante",
      });
    }

    if (!motivo) {
      return res.status(400).json({
        error: "Debe indicar la actividad indirecta",
      });
    }

    await poolConnect;
    const pool = await getPool();

    transaction = new sql.Transaction(pool);
    await transaction.begin();

    const creado = await new sql.Request(transaction)
      .input("motivo", sql.NVarChar(300), motivo)
      .input("operador", sql.NVarChar(150), operador)
      .input("usuario", sql.NVarChar(255), usuario)
      .query(`
        INSERT INTO dbo.ordenes_trabajo
        (
          otid,
          fecha_planificada,
          obra_version,
          fase,
          id_operacion,
          operacion,
          tipo_ot,
          id_ot_origen,
          id_ot_raiz,
          motivo_indirecto,
          cantidad_pedida,
          cantidad_fabricada,
          operador,
          hora_inicio,
          hora_fin,
          inicio_real,
          fin_real,
          tiempo_indirecto_segundos,
          estado,
          usuario_creacion,
          fecha_creacion,
          fecha_modificacion
        )
        OUTPUT INSERTED.id_ot
        VALUES
        (
          'IND_LIBRE_TEMP',
          CONVERT(DATE, SYSDATETIME()),
          'SIN OBRA',
          NULL,
          NULL,
          @motivo,
          'INDIRECTO',
          NULL,
          NULL,
          @motivo,
          0,
          0,
          @operador,
          CONVERT(TIME(0), GETDATE()),
          NULL,
          SYSDATETIME(),
          NULL,
          0,
          'EN_PROCESO',
          @usuario,
          SYSDATETIME(),
          SYSDATETIME()
        );
      `);

    const idIndirecto = Number(creado.recordset?.[0]?.id_ot);

    if (!Number.isInteger(idIndirecto) || idIndirecto <= 0) {
      throw new Error("No se pudo obtener el ID del indirecto creado");
    }

    await new sql.Request(transaction)
      .input("id", sql.Int, idIndirecto)
      .input("usuario", sql.NVarChar(255), usuario)
      .query(`
        UPDATE dbo.ordenes_trabajo
        SET otid = CONCAT(
          'IND_LIBRE_',
          @id,
          '_',
          UPPER(REPLACE(REPLACE(LTRIM(RTRIM(@usuario)), ' ', '_'), '/', '_'))
        )
        WHERE id_ot = @id;
      `);

    await transaction.commit();
    transaction = null;

    return res.status(201).json({
      ok: true,
      mensaje: "Indirecto creado e iniciado correctamente",
      id_ot: idIndirecto,
      orden: await leerDetalle(pool, idIndirecto),
    });
  } catch (error) {
    if (transaction) {
      try {
        await transaction.rollback();
      } catch {}
    }

    console.error("ordenesTrabajo.crearIndirectoIndependiente:", error);

    return res.status(500).json({
      error: "Error al crear el indirecto",
      detalle: error.message,
    });
  }
};

exports.exportarPlanificacion = async (req, res) => {
  let transaction;

  try {
    const ordenes = Array.isArray(req.body?.ordenes) ? req.body.ordenes : [];

    if (!ordenes.length) {
      return res.status(400).json({
        error: "No hay órdenes planificadas para exportar",
      });
    }

    await poolConnect;
    const pool = await getPool();

    transaction = new sql.Transaction(pool);
    await transaction.begin();

    let creadas = 0;
    let actualizadas = 0;
    let omitidas = 0;

    const resultados = [];

    for (const ordenRaw of ordenes) {
      const fechaPlanificada = texto(ordenRaw.fecha_planificada);
      const obraVersion = texto(ordenRaw.obra_version);
      const fase = numero(ordenRaw.fase);
      const idOperacion = numero(ordenRaw.id_operacion);
      const operacion = texto(ordenRaw.operacion);
      const cantidadPedida = numero(ordenRaw.cantidad_pedida);

      if (
        !fechaValida(fechaPlanificada) ||
        !obraVersion ||
        !operacion ||
        !Number.isInteger(idOperacion) ||
        idOperacion <= 0 ||
        cantidadPedida === null ||
        cantidadPedida <= 0
      ) {
        continue;
      }

      const otid = crearOtid({
        fecha_planificada: fechaPlanificada,
        obra_version: obraVersion,
        operacion,
      });

      const existente = await new sql.Request(transaction)
        .input("fecha", sql.Date, fechaPlanificada)
        .input("obraVersion", sql.NVarChar(100), obraVersion)
        .input("fase", sql.Int, Number.isInteger(fase) ? fase : null)
        .input("idOperacion", sql.Int, idOperacion).query(`
          SELECT TOP 1
            ot.id_ot,
            ot.estado,
            CAST(
              CASE
                WHEN EXISTS
                (
                  SELECT 1
                  FROM dbo.ordenes_trabajo_materiales mat
                  WHERE mat.id_ot = ot.id_ot
                    AND (
                      ISNULL(mat.consumido, 0) > 0
                      OR ISNULL(mat.consumido_stock, 0) > 0
                    )
                ) THEN 1
                ELSE 0
              END
              AS BIT
            ) AS tiene_consumos
          FROM dbo.ordenes_trabajo ot WITH (UPDLOCK, HOLDLOCK)
          WHERE fecha_planificada = @fecha
            AND obra_version = @obraVersion
            AND (
              fase = @fase
              OR (fase IS NULL AND @fase IS NULL)
            )
            AND id_operacion = @idOperacion
            AND tipo_ot = 'PRODUCTIVA'
            AND id_ot_origen IS NULL;
        `);

      let idOt;
      let accion;

      if (existente.recordset.length) {
        const actual = existente.recordset[0];

        if (
          String(actual.estado || "").toUpperCase() !== "PENDIENTE" ||
          Boolean(actual.tiene_consumos)
        ) {
          omitidas += 1;

          resultados.push({
            id_ot: Number(actual.id_ot),
            otid,
            accion: "omitida",
            motivo: Boolean(actual.tiene_consumos)
              ? "La orden ya tiene consumos de materiales y no puede reexportarse"
              : "La orden ya fue iniciada, pausada o finalizada",
          });

          continue;
        }

        idOt = Number(actual.id_ot);

        await new sql.Request(transaction)
          .input("id", sql.Int, idOt)
          .input("otid", sql.NVarChar(300), otid)
          .input("operacion", sql.NVarChar(150), operacion)
          .input("cantidad", sql.Decimal(18, 4), cantidadPedida).query(`
            UPDATE dbo.ordenes_trabajo
            SET
              otid = @otid,
              operacion = @operacion,
              cantidad_pedida = @cantidad,
              id_ot_raiz = ISNULL(id_ot_raiz, id_ot),
              fecha_modificacion = SYSDATETIME()
            WHERE id_ot = @id;
          `);

        await new sql.Request(transaction).input("id", sql.Int, idOt).query(`
            DELETE
            FROM dbo.ordenes_trabajo_materiales
            WHERE id_ot = @id;
          `);

        actualizadas += 1;
        accion = "actualizada";
      } else {
        const creado = await new sql.Request(transaction)
          .input("otid", sql.NVarChar(300), otid)
          .input("fecha", sql.Date, fechaPlanificada)
          .input("obraVersion", sql.NVarChar(100), obraVersion)
          .input("fase", sql.Int, Number.isInteger(fase) ? fase : null)
          .input("idOperacion", sql.Int, idOperacion)
          .input("operacion", sql.NVarChar(150), operacion)
          .input("cantidad", sql.Decimal(18, 4), cantidadPedida)
          .input("usuario", sql.NVarChar(255), obtenerUsuario(req)).query(`
            INSERT INTO dbo.ordenes_trabajo
            (
              otid,
              fecha_planificada,
              obra_version,
              fase,
              id_operacion,
              operacion,
              tipo_ot,
              id_ot_origen,
              cantidad_pedida,
              cantidad_fabricada,
              tiempo_indirecto_segundos,
              estado,
              usuario_creacion,
              fecha_creacion,
              fecha_modificacion
            )
            OUTPUT INSERTED.id_ot
            VALUES
            (
              @otid,
              @fecha,
              @obraVersion,
              @fase,
              @idOperacion,
              @operacion,
              'PRODUCTIVA',
              NULL,
              @cantidad,
              0,
              0,
              'PENDIENTE',
              @usuario,
              SYSDATETIME(),
              SYSDATETIME()
            );
          `);

        idOt = Number(creado.recordset[0].id_ot);

        await new sql.Request(transaction).input("id", sql.Int, idOt).query(`
            UPDATE dbo.ordenes_trabajo
            SET id_ot_raiz = @id
            WHERE id_ot = @id;
          `);

        creadas += 1;
        accion = "creada";
      }

      const materiales = Array.isArray(ordenRaw.materiales)
        ? ordenRaw.materiales
        : [];

      const agrupados = new Map();

      for (const materialRaw of materiales) {
        const codigo = texto(materialRaw.codigo);
        const descripcion = texto(materialRaw.descripcion);
        const tipo = texto(materialRaw.tipo);
        const idArticulo = numero(materialRaw.id_articulo);
        const cantidad = numero(materialRaw.cantidad);

        if ((!codigo && !descripcion) || cantidad === null || cantidad <= 0) {
          continue;
        }

        const clave = `${codigo || ""}|${descripcion || ""}|${tipo || ""}`;
        const actual = agrupados.get(clave) || {
          id_articulo: Number.isInteger(idArticulo) ? idArticulo : null,
          codigo,
          descripcion,
          tipo,
          cantidad: 0,
        };

        actual.cantidad += cantidad;
        agrupados.set(clave, actual);
      }

      for (const material of agrupados.values()) {
        await new sql.Request(transaction)
          .input("idOt", sql.Int, idOt)
          .input("idArticulo", sql.Int, material.id_articulo)
          .input("codigo", sql.NVarChar(100), material.codigo)
          .input("descripcion", sql.NVarChar(500), material.descripcion)
          .input("tipo", sql.NVarChar(150), material.tipo)
          .input("cantidad", sql.Decimal(18, 4), redondear4(material.cantidad))
          .query(`
            INSERT INTO dbo.ordenes_trabajo_materiales
            (
              id_ot,
              id_articulo,
              codigo,
              descripcion,
              tipo,
              cantidad,
              consumido,
              consumido_stock
            )
            VALUES
            (
              @idOt,
              @idArticulo,
              @codigo,
              @descripcion,
              @tipo,
              @cantidad,
              0,
              0
            );
          `);
      }

      resultados.push({
        id_ot: idOt,
        otid,
        accion,
      });
    }

    await transaction.commit();

    return res.status(201).json({
      ok: true,
      creadas,
      actualizadas,
      omitidas,
      procesadas: creadas + actualizadas + omitidas,
      resultados,
    });
  } catch (error) {
    if (transaction) {
      try {
        await transaction.rollback();
      } catch {}
    }

    console.error("ordenesTrabajo.exportarPlanificacion:", error);

    return res.status(500).json({
      error: "Error al exportar la planificación",
      detalle: error.message,
    });
  }
};

exports.update = async (req, res) => {
  let transaction;

  try {
    const id = Number(req.params.id);

    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({
        error: "Orden de trabajo inválida",
      });
    }

    const operador = texto(req.body?.operador);
    const observacion = texto(req.body?.observacion);

    const horaInicio = horaValida(req.body?.hora_inicio);
    const horaFin = horaValida(req.body?.hora_fin);

    if (horaInicio === undefined || horaFin === undefined) {
      return res.status(400).json({
        error: "La hora debe tener formato HH:MM o HH:MM:SS",
      });
    }

    await poolConnect;
    const pool = await getPool();

    transaction = new sql.Transaction(pool);
    await transaction.begin();

    const existe = await new sql.Request(transaction).input("id", sql.Int, id)
      .query(`
        SELECT id_ot
        FROM dbo.ordenes_trabajo WITH (UPDLOCK, HOLDLOCK)
        WHERE id_ot = @id;
      `);

    if (!existe.recordset.length) {
      await transaction.rollback();

      return res.status(404).json({
        error: "Orden de trabajo no encontrada",
      });
    }

    await new sql.Request(transaction)
      .input("id", sql.Int, id)
      .input("operador", sql.NVarChar(150), operador)
      .input("horaInicio", sql.VarChar(8), horaInicio)
      .input("horaFin", sql.VarChar(8), horaFin)
      .input("observacion", sql.NVarChar(sql.MAX), observacion).query(`
        UPDATE dbo.ordenes_trabajo
        SET
          operador = @operador,
          hora_inicio = TRY_CONVERT(TIME(0), @horaInicio),
          hora_fin = TRY_CONVERT(TIME(0), @horaFin),
          observacion = @observacion,
          fecha_modificacion = SYSDATETIME()
        WHERE id_ot = @id;
      `);

    // Los materiales no se modifican desde el guardado general.
    // Se confirman desde el botón Confirmar de cada material para que
    // Consumido y el egreso de stock queden en una sola transacción.

    await transaction.commit();

    return res.json(await leerDetalle(pool, id));
  } catch (error) {
    if (transaction) {
      try {
        await transaction.rollback();
      } catch {}
    }

    console.error("ordenesTrabajo.update:", error);

    return res.status(500).json({
      error: "Error al actualizar la orden de trabajo",
      detalle: error.message,
    });
  }
};

exports.iniciar = async (req, res) => {
  try {
    const id = Number(req.params.id);

    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({
        error: "Orden de trabajo inválida",
      });
    }

    const operador = texto(req.body?.operador);

    if (!operador) {
      return res.status(400).json({
        error: "Debe seleccionar un operador antes de iniciar la tarea",
      });
    }

    await poolConnect;
    const pool = await getPool();

    /*
     * El operador debe existir como Referente / Actuante activo.
     * Guardamos el nombre en ordenes_trabajo.operador para mantener
     * compatibilidad con la estructura actual.
     */
    const referente = await pool
      .request()
      .input("operador", sql.NVarChar(150), operador).query(`
        SELECT TOP 1
          id_referente,
          LTRIM(RTRIM(nombre)) AS nombre
        FROM dbo.referentes
        WHERE activo = 1
          AND UPPER(LTRIM(RTRIM(nombre))) =
              UPPER(LTRIM(RTRIM(@operador)))
        ORDER BY id_referente;
      `);

    if (!referente.recordset.length) {
      return res.status(400).json({
        error: "El operador seleccionado no existe o está inactivo",
      });
    }

    const operadorValidado = String(
      referente.recordset[0].nombre || operador,
    ).trim();

    const actual = await pool.request().input("id", sql.Int, id).query(`
        SELECT id_ot, tipo_ot, estado, hora_fin
        FROM dbo.ordenes_trabajo
        WHERE id_ot = @id;
      `);

    if (!actual.recordset.length) {
      return res.status(404).json({
        error: "Orden de trabajo no encontrada",
      });
    }

    const orden = actual.recordset[0];

    if (String(orden.tipo_ot).toUpperCase() === "INDIRECTO") {
      return res.status(400).json({
        error: "Los indirectos se inician automáticamente al pausar una OT",
      });
    }

    if (String(orden.estado).toUpperCase() === "PAUSADA") {
      return res.status(400).json({
        error: "La orden está pausada. Utilice Reanudar",
      });
    }

    if (String(orden.estado).toUpperCase() === "FINALIZADA") {
      return res.status(400).json({
        error: "La orden ya está finalizada",
      });
    }

    await pool
      .request()
      .input("id", sql.Int, id)
      .input("operador", sql.NVarChar(150), operadorValidado).query(`
        UPDATE dbo.ordenes_trabajo
        SET
          hora_inicio = ISNULL(hora_inicio, CONVERT(TIME(0), GETDATE())),
          inicio_real = ISNULL(inicio_real, SYSDATETIME()),
          operador = @operador,
          estado = 'EN_PROCESO',
          fecha_modificacion = SYSDATETIME()
        WHERE id_ot = @id;
      `);

    return res.json(await leerDetalle(pool, id));
  } catch (error) {
    console.error("ordenesTrabajo.iniciar:", error);

    return res.status(500).json({
      error: "Error al iniciar la tarea",
      detalle: error.message,
    });
  }
};

exports.pausar = async (req, res) => {
  let transaction;

  try {
    const id = Number(req.params.id);

    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({
        error: "Orden de trabajo inválida",
      });
    }

    const motivo = texto(req.body?.motivo) || "INDIRECTO";

    await poolConnect;
    const pool = await getPool();

    transaction = new sql.Transaction(pool);
    await transaction.begin();

    const actual = await new sql.Request(transaction).input("id", sql.Int, id)
      .query(`
        SELECT
          id_ot,
          otid,
          fecha_planificada,
          obra_version,
          fase,
          operador,
          estado,
          tipo_ot,
          id_ot_raiz,
          inicio_real
        FROM dbo.ordenes_trabajo WITH (UPDLOCK, HOLDLOCK)
        WHERE id_ot = @id;
      `);

    if (!actual.recordset.length) {
      await transaction.rollback();

      return res.status(404).json({
        error: "Orden de trabajo no encontrada",
      });
    }

    const orden = actual.recordset[0];

    if (String(orden.tipo_ot).toUpperCase() !== "PRODUCTIVA") {
      await transaction.rollback();

      return res.status(400).json({
        error: "Solo se pueden pausar órdenes productivas",
      });
    }

    if (String(orden.estado).toUpperCase() !== "EN_PROCESO") {
      await transaction.rollback();

      return res.status(400).json({
        error: "La orden debe estar en proceso para poder pausarla",
      });
    }

    const indirectoExistente = await new sql.Request(transaction).input(
      "id",
      sql.Int,
      id,
    ).query(`
        SELECT TOP 1 id_ot
        FROM dbo.ordenes_trabajo
        WHERE id_ot_origen = @id
          AND tipo_ot = 'INDIRECTO'
          AND estado = 'EN_PROCESO'
          AND fin_real IS NULL;
      `);

    if (indirectoExistente.recordset.length) {
      await transaction.rollback();

      return res.status(409).json({
        error: "Ya existe un indirecto activo para esta orden",
      });
    }

    await new sql.Request(transaction).input("id", sql.Int, id).query(`
        UPDATE dbo.ordenes_trabajo
        SET
          estado = 'PAUSADA',
          fecha_modificacion = SYSDATETIME()
        WHERE id_ot = @id;
      `);

    const creado = await new sql.Request(transaction)
      .input("otidBase", sql.NVarChar(300), orden.otid)
      .input("obraVersion", sql.NVarChar(100), orden.obra_version)
      .input("fase", sql.Int, orden.fase)
      .input("motivo", sql.NVarChar(300), motivo)
      .input("operador", sql.NVarChar(150), orden.operador)
      .input("idOrigen", sql.Int, id)
      .input("idRaiz", sql.Int, Number(orden.id_ot_raiz) || id)
      .input("usuario", sql.NVarChar(255), obtenerUsuario(req)).query(`
        INSERT INTO dbo.ordenes_trabajo
        (
          otid,
          fecha_planificada,
          obra_version,
          fase,
          id_operacion,
          operacion,
          tipo_ot,
          id_ot_origen,
          id_ot_raiz,
          motivo_indirecto,
          cantidad_pedida,
          cantidad_fabricada,
          operador,
          hora_inicio,
          inicio_real,
          tiempo_indirecto_segundos,
          estado,
          usuario_creacion,
          fecha_creacion,
          fecha_modificacion
        )
        OUTPUT INSERTED.id_ot
        VALUES
        (
          CONCAT(@otidBase, '_IND'),
          CONVERT(DATE, SYSDATETIME()),
          @obraVersion,
          @fase,
          NULL,
          @motivo,
          'INDIRECTO',
          @idOrigen,
          @idRaiz,
          @motivo,
          0,
          0,
          @operador,
          CONVERT(TIME(0), GETDATE()),
          SYSDATETIME(),
          0,
          'EN_PROCESO',
          @usuario,
          SYSDATETIME(),
          SYSDATETIME()
        );
      `);

    const idIndirecto = Number(creado.recordset[0].id_ot);

    await new sql.Request(transaction)
      .input("id", sql.Int, idIndirecto)
      .input("otidBase", sql.NVarChar(300), orden.otid).query(`
        UPDATE dbo.ordenes_trabajo
        SET otid = CONCAT(@otidBase, '_IND_', @id)
        WHERE id_ot = @id;
      `);

    await transaction.commit();

    return res.json({
      ok: true,
      orden: await leerDetalle(pool, id),
      indirecto: await leerDetalle(pool, idIndirecto),
    });
  } catch (error) {
    if (transaction) {
      try {
        await transaction.rollback();
      } catch {}
    }

    console.error("ordenesTrabajo.pausar:", error);

    return res.status(500).json({
      error: "Error al pausar la orden",
      detalle: error.message,
    });
  }
};

exports.reanudar = async (req, res) => {
  let transaction;

  try {
    const id = Number(req.params.id);

    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({
        error: "Orden de trabajo inválida",
      });
    }

    await poolConnect;
    const pool = await getPool();

    transaction = new sql.Transaction(pool);
    await transaction.begin();

    const actual = await new sql.Request(transaction).input("id", sql.Int, id)
      .query(`
        SELECT id_ot, tipo_ot, estado
        FROM dbo.ordenes_trabajo WITH (UPDLOCK, HOLDLOCK)
        WHERE id_ot = @id;
      `);

    if (!actual.recordset.length) {
      await transaction.rollback();

      return res.status(404).json({
        error: "Orden de trabajo no encontrada",
      });
    }

    const orden = actual.recordset[0];

    if (String(orden.tipo_ot).toUpperCase() !== "PRODUCTIVA") {
      await transaction.rollback();

      return res.status(400).json({
        error: "Solo se reanudan órdenes productivas",
      });
    }

    if (String(orden.estado).toUpperCase() !== "PAUSADA") {
      await transaction.rollback();

      return res.status(400).json({
        error: "La orden no está pausada",
      });
    }

    const indirecto = await new sql.Request(transaction).input(
      "id",
      sql.Int,
      id,
    ).query(`
        SELECT TOP 1
          id_ot,
          inicio_real
        FROM dbo.ordenes_trabajo WITH (UPDLOCK, HOLDLOCK)
        WHERE id_ot_origen = @id
          AND tipo_ot = 'INDIRECTO'
          AND estado = 'EN_PROCESO'
          AND fin_real IS NULL
        ORDER BY id_ot DESC;
      `);

    let segundosIndirecto = 0;
    let idIndirecto = null;

    if (indirecto.recordset.length) {
      idIndirecto = Number(indirecto.recordset[0].id_ot);

      const duracion = await new sql.Request(transaction).input(
        "idIndirecto",
        sql.Int,
        idIndirecto,
      ).query(`
          SELECT
            CASE
              WHEN inicio_real IS NULL THEN 0
              ELSE DATEDIFF(SECOND, inicio_real, SYSDATETIME())
            END AS segundos
          FROM dbo.ordenes_trabajo
          WHERE id_ot = @idIndirecto;
        `);

      segundosIndirecto = Math.max(
        0,
        Number(duracion.recordset?.[0]?.segundos || 0),
      );

      await new sql.Request(transaction).input(
        "idIndirecto",
        sql.Int,
        idIndirecto,
      ).query(`
          UPDATE dbo.ordenes_trabajo
          SET
            hora_fin = CONVERT(TIME(0), GETDATE()),
            fin_real = SYSDATETIME(),
            estado = 'FINALIZADA',
            fecha_modificacion = SYSDATETIME()
          WHERE id_ot = @idIndirecto;
        `);
    }

    await new sql.Request(transaction)
      .input("id", sql.Int, id)
      .input("segundos", sql.Int, segundosIndirecto).query(`
        UPDATE dbo.ordenes_trabajo
        SET
          tiempo_indirecto_segundos =
            ISNULL(tiempo_indirecto_segundos, 0) + @segundos,
          estado = 'EN_PROCESO',
          fecha_modificacion = SYSDATETIME()
        WHERE id_ot = @id;
      `);

    await transaction.commit();

    return res.json({
      ok: true,
      segundos_indirecto: segundosIndirecto,
      orden: await leerDetalle(pool, id),
      indirecto: idIndirecto ? await leerDetalle(pool, idIndirecto) : null,
    });
  } catch (error) {
    if (transaction) {
      try {
        await transaction.rollback();
      } catch {}
    }

    console.error("ordenesTrabajo.reanudar:", error);

    return res.status(500).json({
      error: "Error al reanudar la orden",
      detalle: error.message,
    });
  }
};

async function finalizarIndirecto(transaction, id, motivo) {
  const actual = await new sql.Request(transaction).input("id", sql.Int, id)
    .query(`
      SELECT
        id_ot,
        id_ot_origen,
        estado,
        inicio_real,
        fin_real
      FROM dbo.ordenes_trabajo WITH (UPDLOCK, HOLDLOCK)
      WHERE id_ot = @id
        AND tipo_ot = 'INDIRECTO';
    `);

  if (!actual.recordset.length) {
    const error = new Error("Indirecto no encontrado");
    error.statusCode = 404;
    throw error;
  }

  const indirecto = actual.recordset[0];

  if (String(indirecto.estado).toUpperCase() === "FINALIZADA") {
    return {
      idOrigen: Number(indirecto.id_ot_origen) || null,
      segundos: 0,
      yaFinalizado: true,
    };
  }

  if (!indirecto.inicio_real) {
    const error = new Error("El indirecto no tiene hora de inicio");
    error.statusCode = 400;
    throw error;
  }

  const duracion = await new sql.Request(transaction).input("id", sql.Int, id)
    .query(`
      SELECT DATEDIFF(SECOND, inicio_real, SYSDATETIME()) AS segundos
      FROM dbo.ordenes_trabajo
      WHERE id_ot = @id;
    `);

  const segundos = Math.max(0, Number(duracion.recordset?.[0]?.segundos || 0));

  await new sql.Request(transaction)
    .input("id", sql.Int, id)
    .input("motivo", sql.NVarChar(300), motivo).query(`
      UPDATE dbo.ordenes_trabajo
      SET
        operacion = @motivo,
        motivo_indirecto = @motivo,
        hora_fin = CONVERT(TIME(0), GETDATE()),
        fin_real = SYSDATETIME(),
        estado = 'FINALIZADA',
        fecha_modificacion = SYSDATETIME()
      WHERE id_ot = @id;
    `);

  const idOrigen = Number(indirecto.id_ot_origen) || null;

  if (idOrigen) {
    await new sql.Request(transaction)
      .input("idOrigen", sql.Int, idOrigen)
      .input("segundos", sql.Int, segundos).query(`
        UPDATE dbo.ordenes_trabajo
        SET
          tiempo_indirecto_segundos =
            ISNULL(tiempo_indirecto_segundos, 0) + @segundos,
          fecha_modificacion = SYSDATETIME()
        WHERE id_ot = @idOrigen;
      `);
  }

  return {
    idOrigen,
    segundos,
    yaFinalizado: false,
  };
}

exports.finalizar = async (req, res) => {
  let transaction;

  try {
    const id = Number(req.params.id);

    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({
        error: "Orden de trabajo inválida",
      });
    }

    await poolConnect;
    const pool = await getPool();

    transaction = new sql.Transaction(pool);
    await transaction.begin();

    const actual = await new sql.Request(transaction).input("id", sql.Int, id)
      .query(`
        SELECT
          id_ot,
          otid,
          fecha_planificada,
          obra_version,
          fase,
          id_operacion,
          operacion,
          tipo_ot,
          id_ot_origen,
          id_ot_raiz,
          cantidad_pedida,
          cantidad_fabricada,
          operador,
          hora_inicio,
          inicio_real,
          estado,
          observacion,
          usuario_creacion
        FROM dbo.ordenes_trabajo WITH (UPDLOCK, HOLDLOCK)
        WHERE id_ot = @id;
      `);

    if (!actual.recordset.length) {
      await transaction.rollback();

      return res.status(404).json({
        error: "Orden de trabajo no encontrada",
      });
    }

    const orden = actual.recordset[0];
    const tipoOt = String(orden.tipo_ot || "PRODUCTIVA").toUpperCase();

    if (tipoOt === "INDIRECTO") {
      const motivoIndirecto = texto(req.body?.motivo);

      if (!motivoIndirecto) {
        await transaction.rollback();

        return res.status(400).json({
          error: "Debe indicar la actividad indirecta realizada",
        });
      }

      const resultadoIndirecto = await finalizarIndirecto(
        transaction,
        id,
        motivoIndirecto,
      );

      await transaction.commit();

      return res.json({
        ok: true,
        tipo_ot: "INDIRECTO",
        segundos_indirecto: resultadoIndirecto.segundos,
        orden: await leerDetalle(pool, id),
        orden_origen: resultadoIndirecto.idOrigen
          ? await leerDetalle(pool, resultadoIndirecto.idOrigen)
          : null,
      });
    }

    if (String(orden.estado).toUpperCase() === "FINALIZADA") {
      await transaction.rollback();

      return res.status(400).json({
        error: "La orden ya está finalizada",
      });
    }

    if (String(orden.estado).toUpperCase() === "PAUSADA") {
      await transaction.rollback();

      return res.status(400).json({
        error: "La orden está pausada. Reanúdela antes de finalizar",
      });
    }

    if (!orden.inicio_real) {
      await transaction.rollback();

      return res.status(400).json({
        error: "Primero debe iniciar la tarea",
      });
    }

    const cantidadPedida = Number(orden.cantidad_pedida) || 0;
    const cantidadFabricada = numero(req.body?.cantidad_fabricada);

    if (cantidadFabricada === null) {
      await transaction.rollback();

      return res.status(400).json({
        error: "Debe indicar la cantidad fabricada",
      });
    }

    if (cantidadFabricada < 0) {
      await transaction.rollback();

      return res.status(400).json({
        error: "La cantidad fabricada no puede ser negativa",
      });
    }

    if (cantidadFabricada > cantidadPedida) {
      await transaction.rollback();

      return res.status(400).json({
        error: `La cantidad fabricada no puede superar la pedida (${cantidadPedida})`,
      });
    }

    await new sql.Request(transaction)
      .input("id", sql.Int, id)
      .input(
        "cantidadFabricada",
        sql.Decimal(18, 4),
        redondear4(cantidadFabricada),
      ).query(`
        UPDATE dbo.ordenes_trabajo
        SET
          cantidad_fabricada = @cantidadFabricada,
          hora_fin = CONVERT(TIME(0), GETDATE()),
          fin_real = SYSDATETIME(),
          estado = 'FINALIZADA',
          fecha_modificacion = SYSDATETIME()
        WHERE id_ot = @id;
      `);

    const faltante = redondear4(cantidadPedida - cantidadFabricada);
    let nuevaOtId = null;

    if (faltante > 0) {
      const nueva = await new sql.Request(transaction)
        .input("otidBase", sql.NVarChar(300), orden.otid)
        .input("fecha", sql.Date, orden.fecha_planificada)
        .input("obraVersion", sql.NVarChar(100), orden.obra_version)
        .input("fase", sql.Int, orden.fase)
        .input("idOperacion", sql.Int, orden.id_operacion)
        .input("operacion", sql.NVarChar(150), orden.operacion)
        .input("faltante", sql.Decimal(18, 4), faltante)
        .input("idOrigen", sql.Int, id)
        .input("idRaiz", sql.Int, Number(orden.id_ot_raiz) || id)
        .input(
          "usuario",
          sql.NVarChar(255),
          obtenerUsuario(req) || orden.usuario_creacion,
        ).query(`
          INSERT INTO dbo.ordenes_trabajo
          (
            otid,
            fecha_planificada,
            obra_version,
            fase,
            id_operacion,
            operacion,
            tipo_ot,
            id_ot_origen,
            id_ot_raiz,
            cantidad_pedida,
            cantidad_fabricada,
            tiempo_indirecto_segundos,
            estado,
            usuario_creacion,
            fecha_creacion,
            fecha_modificacion
          )
          OUTPUT INSERTED.id_ot
          VALUES
          (
            CONCAT(@otidBase, '_R'),
            @fecha,
            @obraVersion,
            @fase,
            @idOperacion,
            @operacion,
            'PRODUCTIVA',
            @idOrigen,
            @idRaiz,
            @faltante,
            0,
            0,
            'PENDIENTE',
            @usuario,
            SYSDATETIME(),
            SYSDATETIME()
          );
        `);

      nuevaOtId = Number(nueva.recordset[0].id_ot);

      await new sql.Request(transaction)
        .input("id", sql.Int, nuevaOtId)
        .input("otidBase", sql.NVarChar(300), orden.otid).query(`
          UPDATE dbo.ordenes_trabajo
          SET otid = CONCAT(@otidBase, '_R', @id)
          WHERE id_ot = @id;
        `);

      // V3: la OT por faltante NO duplica materiales.
      // Conserva id_ot_raiz y por eso muestra exactamente los mismos
      // materiales y consumos acumulados de la OT original.
    }

    await transaction.commit();

    return res.json({
      ok: true,
      tipo_ot: "PRODUCTIVA",
      cantidad_fabricada: redondear4(cantidadFabricada),
      cantidad_faltante: faltante,
      orden: await leerDetalle(pool, id),
      nueva_ot: nuevaOtId ? await leerDetalle(pool, nuevaOtId) : null,
    });
  } catch (error) {
    if (transaction) {
      try {
        await transaction.rollback();
      } catch {}
    }

    console.error("ordenesTrabajo.finalizar:", error);

    return res.status(error.statusCode || 500).json({
      error: error.message || "Error al finalizar la tarea",
      detalle: error.message,
    });
  }
};

// ============================================================
// RECORTES DISPONIBLES PARA UN MATERIAL DE CORTE PERFIL
// ============================================================
exports.getRecortesMaterial = async (req, res) => {
  try {
    const idOt = Number(req.params.id);
    const idMaterial = Number(req.params.idMaterial);

    if (!Number.isInteger(idOt) || idOt <= 0) {
      return res.status(400).json({ error: "Orden de trabajo invalida" });
    }

    if (!Number.isInteger(idMaterial) || idMaterial <= 0) {
      return res.status(400).json({ error: "Material invalido" });
    }

    await poolConnect;
    const pool = await getPool();

    const materialResult = await pool
      .request()
      .input("idOt", sql.Int, idOt)
      .input("idMaterial", sql.Int, idMaterial).query(`
        SELECT
          ot.id_ot,
          COALESCE(ot.id_ot_raiz, ot.id_ot) AS id_ot_raiz,
          ot.operacion,
          ot.obra_version,
          mat.id_ot_material,
          mat.codigo,
          mat.descripcion,
          mat.cantidad,
          mat.consumido,
          mat.consumido_stock,
          ISNULL(mat.consumido_recorte, 0) AS consumido_recorte
        FROM dbo.ordenes_trabajo ot WITH (NOLOCK)
        INNER JOIN dbo.ordenes_trabajo_materiales mat WITH (NOLOCK)
          ON mat.id_ot = COALESCE(ot.id_ot_raiz, ot.id_ot)
         AND mat.id_ot_material = @idMaterial
        WHERE ot.id_ot = @idOt;
      `);

    if (!materialResult.recordset.length) {
      return res.status(404).json({
        error: "El material no pertenece a esta orden de trabajo",
      });
    }

    const material = materialResult.recordset[0];

    if (
      String(material.operacion || "")
        .trim()
        .toUpperCase() !== "CORTE PERFIL"
    ) {
      return res.status(400).json({
        error:
          "Los recortes solo pueden utilizarse en la operacion CORTE PERFIL",
      });
    }

    const codigoBase = String(material.codigo || "")
      .trim()
      .toUpperCase();

    if (!codigoBase) {
      return res.status(400).json({
        error: "El material no tiene un codigo valido",
      });
    }

    const recortesResult = await pool
      .request()
      .input("codigoBase", sql.VarChar(100), codigoBase).query(`
        SELECT
          r.id_recorte,
          r.codigo,
          r.descripcion,
          r.medida,
          r.obra_version,
          sr.id_stock_recorte,
          sr.id_ubicacion_recorte,
          COALESCE(ru.nombre, sr.ubicacion, 'SIN UBICACION') AS ubicacion,
          CAST(ISNULL(sr.cantidad, 0) AS DECIMAL(18,3)) AS cantidad
        FROM dbo.recortes r WITH (NOLOCK)
        LEFT JOIN dbo.stock_recortes sr WITH (NOLOCK)
          ON sr.id_recorte = r.id_recorte
        LEFT JOIN dbo.recortes_ubicaciones ru WITH (NOLOCK)
          ON ru.id_ubicacion_recorte = sr.id_ubicacion_recorte
        WHERE r.activo = 1
          AND (
            UPPER(LTRIM(RTRIM(r.codigo))) = @codigoBase
            OR UPPER(LTRIM(RTRIM(r.codigo))) LIKE @codigoBase + '[_]%'
          )
        ORDER BY r.codigo, cantidad DESC, ubicacion;
      `);

    const mapa = new Map();

    for (const fila of recortesResult.recordset || []) {
      const idRecorte = Number(fila.id_recorte);

      if (!mapa.has(idRecorte)) {
        mapa.set(idRecorte, {
          id_recorte: idRecorte,
          codigo: fila.codigo,
          descripcion: fila.descripcion,
          medida: fila.medida,
          obra_version: fila.obra_version,
          cantidad_total: 0,
          ubicaciones: [],
        });
      }

      if (fila.id_stock_recorte) {
        const cantidad = Number(fila.cantidad) || 0;
        const recorte = mapa.get(idRecorte);

        recorte.cantidad_total = Number(
          (recorte.cantidad_total + cantidad).toFixed(3),
        );

        recorte.ubicaciones.push({
          id_stock_recorte: Number(fila.id_stock_recorte),
          id_ubicacion_recorte: Number(fila.id_ubicacion_recorte),
          ubicacion: fila.ubicacion,
          cantidad,
        });
      }
    }

    const ubicacionesResult = await pool.request().query(`
      SELECT id_ubicacion_recorte, nombre
      FROM dbo.recortes_ubicaciones WITH (NOLOCK)
      WHERE activo = 1
      ORDER BY
        CASE WHEN UPPER(LTRIM(RTRIM(nombre))) = 'GENERAL' THEN 0 ELSE 1 END,
        nombre;
    `);

    return res.json({
      material,
      recortes: Array.from(mapa.values()),
      ubicaciones: ubicacionesResult.recordset || [],
    });
  } catch (error) {
    console.error("ordenesTrabajo.getRecortesMaterial:", error);

    return res.status(500).json({
      error: error.message || "Error al buscar recortes del material",
      detalle: error.message,
    });
  }
};

// ============================================================
// CONSUMIR UN RECORTE Y SUMARLO AL CONSUMO DEL MATERIAL
// No modifica dbo.stock: solo dbo.stock_recortes.
// ============================================================
exports.consumirRecorteMaterial = async (req, res) => {
  let transaction;

  try {
    const idOt = Number(req.params.id);
    const idMaterial = Number(req.params.idMaterial);
    const cantidadRaw = Number(req.body?.cantidad);
    const cantidad = Number(cantidadRaw.toFixed(3));
    const nuevoRecorte = req.body?.nuevo_recorte || null;
    let idRecorte = Number(req.body?.id_recorte);
    const idUbicacionRecorte = Number(
      nuevoRecorte?.id_ubicacion_recorte ?? req.body?.id_ubicacion_recorte,
    );

    if (!Number.isInteger(idOt) || idOt <= 0) {
      return res.status(400).json({ error: "Orden de trabajo invalida" });
    }

    if (!Number.isInteger(idMaterial) || idMaterial <= 0) {
      return res.status(400).json({ error: "Material invalido" });
    }

    if (!Number.isFinite(cantidadRaw) || cantidadRaw <= 0) {
      return res
        .status(400)
        .json({ error: "La cantidad debe ser mayor que cero" });
    }

    if (Math.abs(cantidadRaw - cantidad) > 0.000001) {
      return res.status(400).json({
        error: "El consumo de recortes admite como maximo 3 decimales",
      });
    }

    if (!Number.isInteger(idUbicacionRecorte) || idUbicacionRecorte <= 0) {
      return res.status(400).json({ error: "Debe seleccionar una ubicacion" });
    }

    if (!nuevoRecorte && (!Number.isInteger(idRecorte) || idRecorte <= 0)) {
      return res.status(400).json({ error: "Debe seleccionar un recorte" });
    }

    await poolConnect;
    const pool = await getPool();

    transaction = new sql.Transaction(pool);
    await transaction.begin();

    const materialResult = await new sql.Request(transaction)
      .input("idOt", sql.Int, idOt)
      .input("idMaterial", sql.Int, idMaterial).query(`
        SELECT
          ot.id_ot,
          COALESCE(ot.id_ot_raiz, ot.id_ot) AS id_ot_raiz,
          ot.otid,
          ot.operacion,
          ot.obra_version,
          ot.tipo_ot,
          mat.id_ot_material,
          mat.codigo,
          mat.descripcion,
          mat.consumido,
          mat.consumido_stock,
          ISNULL(mat.consumido_recorte, 0) AS consumido_recorte
        FROM dbo.ordenes_trabajo ot WITH (UPDLOCK, HOLDLOCK)
        INNER JOIN dbo.ordenes_trabajo_materiales mat WITH (UPDLOCK, HOLDLOCK)
          ON mat.id_ot = COALESCE(ot.id_ot_raiz, ot.id_ot)
         AND mat.id_ot_material = @idMaterial
        WHERE ot.id_ot = @idOt;
      `);

    if (!materialResult.recordset.length) {
      await transaction.rollback();
      transaction = null;
      return res.status(404).json({
        error: "El material no pertenece a esta orden de trabajo",
      });
    }

    const material = materialResult.recordset[0];

    if (
      String(material.tipo_ot || "PRODUCTIVA").toUpperCase() === "INDIRECTO"
    ) {
      await transaction.rollback();
      transaction = null;
      return res
        .status(400)
        .json({ error: "Un indirecto no consume materiales" });
    }

    if (
      String(material.operacion || "")
        .trim()
        .toUpperCase() !== "CORTE PERFIL"
    ) {
      await transaction.rollback();
      transaction = null;
      return res.status(400).json({
        error:
          "Los recortes solo pueden utilizarse en la operacion CORTE PERFIL",
      });
    }

    const codigoBase = String(material.codigo || "")
      .trim()
      .toUpperCase();

    const ubicacionResult = await new sql.Request(transaction).input(
      "idUbicacion",
      sql.Int,
      idUbicacionRecorte,
    ).query(`
        SELECT TOP 1 nombre
        FROM dbo.recortes_ubicaciones WITH (UPDLOCK, HOLDLOCK)
        WHERE id_ubicacion_recorte = @idUbicacion
          AND activo = 1;
      `);

    if (!ubicacionResult.recordset.length) {
      await transaction.rollback();
      transaction = null;
      return res
        .status(400)
        .json({ error: "La ubicacion no existe o esta inactiva" });
    }

    let recorteCreado = false;

    if (nuevoRecorte) {
      const medida = String(nuevoRecorte.medida || "").trim();
      const descripcion =
        String(nuevoRecorte.descripcion || "").trim() ||
        `${String(material.descripcion || codigoBase).trim()} - RECORTE`;
      const obraVersion =
        String(nuevoRecorte.obra_version || "").trim() ||
        String(material.obra_version || "").trim() ||
        null;
      const cantidadDisponibleRaw = Number(nuevoRecorte.cantidad_disponible);
      const cantidadDisponible = Number(cantidadDisponibleRaw.toFixed(3));

      if (!medida) {
        await transaction.rollback();
        transaction = null;
        return res
          .status(400)
          .json({ error: "Debe indicar la medida del nuevo recorte" });
      }

      if (
        !Number.isFinite(cantidadDisponibleRaw) ||
        cantidadDisponibleRaw <= 0 ||
        Math.abs(cantidadDisponibleRaw - cantidadDisponible) > 0.000001
      ) {
        await transaction.rollback();
        transaction = null;
        return res.status(400).json({
          error: "La cantidad disponible del nuevo recorte no es valida",
        });
      }

      if (cantidadDisponible + 0.000001 < cantidad) {
        await transaction.rollback();
        transaction = null;
        return res.status(400).json({
          error: "La cantidad disponible no alcanza para el consumo indicado",
        });
      }

      const codigoRecorte = `${codigoBase}_${medida}`.toUpperCase();

      const existeResult = await new sql.Request(transaction).input(
        "codigo",
        sql.VarChar(80),
        codigoRecorte,
      ).query(`
          SELECT TOP 1 id_recorte
          FROM dbo.recortes WITH (UPDLOCK, HOLDLOCK)
          WHERE UPPER(LTRIM(RTRIM(codigo))) = @codigo;
        `);

      if (existeResult.recordset.length) {
        await transaction.rollback();
        transaction = null;
        return res.status(409).json({
          error:
            "Ese recorte ya existe. Seleccionalo de la lista para consumirlo",
        });
      }

      const nuevoResult = await new sql.Request(transaction)
        .input("codigo", sql.VarChar(80), codigoRecorte)
        .input("descripcion", sql.VarChar(250), descripcion)
        .input("medida", sql.VarChar(100), medida)
        .input("obraVersion", sql.VarChar(150), obraVersion).query(`
          INSERT INTO dbo.recortes (codigo, descripcion, medida, obra_version)
          OUTPUT INSERTED.id_recorte
          VALUES (@codigo, @descripcion, @medida, @obraVersion);
        `);

      idRecorte = Number(nuevoResult.recordset[0].id_recorte);

      await new sql.Request(transaction)
        .input("idRecorte", sql.Int, idRecorte)
        .input("idUbicacion", sql.Int, idUbicacionRecorte)
        .input(
          "ubicacion",
          sql.VarChar(150),
          ubicacionResult.recordset[0].nombre,
        )
        .input("cantidad", sql.Decimal(18, 3), cantidadDisponible).query(`
          INSERT INTO dbo.stock_recortes
            (id_recorte, id_ubicacion_recorte, ubicacion, cantidad)
          VALUES
            (@idRecorte, @idUbicacion, @ubicacion, @cantidad);
        `);

      recorteCreado = true;
    } else {
      const recorteResult = await new sql.Request(transaction)
        .input("idRecorte", sql.Int, idRecorte)
        .input("codigoBase", sql.VarChar(100), codigoBase).query(`
          SELECT TOP 1 id_recorte
          FROM dbo.recortes WITH (UPDLOCK, HOLDLOCK)
          WHERE id_recorte = @idRecorte
            AND activo = 1
            AND (
              UPPER(LTRIM(RTRIM(codigo))) = @codigoBase
              OR UPPER(LTRIM(RTRIM(codigo))) LIKE @codigoBase + '[_]%'
            );
        `);

      if (!recorteResult.recordset.length) {
        await transaction.rollback();
        transaction = null;
        return res.status(404).json({
          error:
            "El recorte seleccionado no corresponde al codigo del material",
        });
      }
    }

    const descuentoResult = await new sql.Request(transaction)
      .input("idRecorte", sql.Int, idRecorte)
      .input("idUbicacion", sql.Int, idUbicacionRecorte)
      .input("cantidad", sql.Decimal(18, 3), cantidad).query(`
        UPDATE dbo.stock_recortes WITH (UPDLOCK, ROWLOCK)
        SET
          cantidad = cantidad - @cantidad,
          fecha_actualizacion = SYSDATETIME()
        WHERE id_recorte = @idRecorte
          AND id_ubicacion_recorte = @idUbicacion
          AND cantidad >= @cantidad;

        SELECT @@ROWCOUNT AS afectados;
      `);

    if (Number(descuentoResult.recordset?.[0]?.afectados || 0) !== 1) {
      await transaction.rollback();
      transaction = null;
      return res.status(409).json({
        error:
          "No hay stock suficiente del recorte en la ubicacion seleccionada",
      });
    }

    await new sql.Request(transaction)
      .input("idMaterial", sql.Int, idMaterial)
      .input("cantidad", sql.Decimal(18, 4), cantidad).query(`
        UPDATE dbo.ordenes_trabajo_materiales
        SET
          consumido = ISNULL(consumido, 0) + @cantidad,
          consumido_recorte = ISNULL(consumido_recorte, 0) + @cantidad
        WHERE id_ot_material = @idMaterial;
      `);

    const usuario = obtenerUsuario(req) || "sistema OT";

    await new sql.Request(transaction)
      .input("idOt", sql.Int, idOt)
      .input("idRaiz", sql.Int, Number(material.id_ot_raiz))
      .input("idMaterial", sql.Int, idMaterial)
      .input("idRecorte", sql.Int, idRecorte)
      .input("idUbicacion", sql.Int, idUbicacionRecorte)
      .input("cantidad", sql.Decimal(18, 3), cantidad)
      .input("usuario", sql.NVarChar(255), usuario).query(`
        INSERT INTO dbo.ordenes_trabajo_consumos_recortes
        (
          id_ot,
          id_ot_raiz,
          id_ot_material,
          id_recorte,
          id_ubicacion_recorte,
          cantidad,
          usuario,
          fecha
        )
        VALUES
        (
          @idOt,
          @idRaiz,
          @idMaterial,
          @idRecorte,
          @idUbicacion,
          @cantidad,
          @usuario,
          SYSDATETIME()
        );
      `);

    await transaction.commit();
    transaction = null;

    return res.json({
      ok: true,
      id_recorte: idRecorte,
      recorte_creado: recorteCreado,
      consumido_recorte: cantidad,
      orden: await leerDetalle(pool, idOt),
    });
  } catch (error) {
    if (transaction) {
      try {
        await transaction.rollback();
      } catch {}
    }

    console.error("ordenesTrabajo.consumirRecorteMaterial:", error);

    return res.status(500).json({
      error: error.message || "Error al consumir el recorte",
      detalle: error.message,
    });
  }
};

// ============================================================
// CONFIRMAR CONSUMO DE MATERIAL Y EGRESAR STOCK NORMAL
// ============================================================
exports.confirmarConsumoMaterial = async (req, res) => {
  let transaction;

  try {
    const idOt = Number(req.params.id);
    const idMaterial = Number(req.params.idMaterial);
    const consumidoObjetivo = Number(req.body?.consumido);

    if (!Number.isInteger(idOt) || idOt <= 0) {
      return res.status(400).json({
        error: "Orden de trabajo inválida",
      });
    }

    if (!Number.isInteger(idMaterial) || idMaterial <= 0) {
      return res.status(400).json({
        error: "Material inválido",
      });
    }

    if (!Number.isFinite(consumidoObjetivo) || consumidoObjetivo < 0) {
      return res.status(400).json({
        error: "El consumido debe ser un número mayor o igual a cero",
      });
    }

    /*
     * El consumo total admite 4 decimales porque puede incluir recortes.
     * Solamente la diferencia que saldrá de dbo.stock debe quedar en 2.
     */
    const objetivoRedondeado = Number(consumidoObjetivo.toFixed(4));

    if (Math.abs(consumidoObjetivo - objetivoRedondeado) > 0.000001) {
      return res.status(400).json({
        error: "El consumo total admite como máximo 4 decimales",
      });
    }

    await poolConnect;
    const pool = await getPool();

    transaction = new sql.Transaction(pool);
    await transaction.begin();

    const ordenResult = await new sql.Request(transaction).input(
      "id",
      sql.Int,
      idOt,
    ).query(`
        SELECT
          id_ot,
          id_ot_raiz,
          otid,
          obra_version,
          fecha_planificada,
          tipo_ot
        FROM dbo.ordenes_trabajo WITH (UPDLOCK, HOLDLOCK)
        WHERE id_ot = @id;
      `);

    if (!ordenResult.recordset.length) {
      await transaction.rollback();
      transaction = null;

      return res.status(404).json({
        error: "Orden de trabajo no encontrada",
      });
    }

    const orden = ordenResult.recordset[0];

    if (String(orden.tipo_ot || "PRODUCTIVA").toUpperCase() === "INDIRECTO") {
      await transaction.rollback();
      transaction = null;

      return res.status(400).json({
        error: "Los indirectos no consumen materiales de la OT",
      });
    }

    const idRaiz = Number(orden.id_ot_raiz) || idOt;

    const materialResult = await new sql.Request(transaction)
      .input("idMaterial", sql.Int, idMaterial)
      .input("idRaiz", sql.Int, idRaiz).query(`
        SELECT
          id_ot_material,
          id_ot,
          id_articulo,
          codigo,
          descripcion,
          cantidad,
          consumido,
          consumido_stock,
          ISNULL(consumido_recorte, 0) AS consumido_recorte
        FROM dbo.ordenes_trabajo_materiales WITH (UPDLOCK, HOLDLOCK)
        WHERE id_ot_material = @idMaterial
          AND id_ot = @idRaiz;
      `);

    if (!materialResult.recordset.length) {
      await transaction.rollback();
      transaction = null;

      return res.status(404).json({
        error: "El material no pertenece a la OT raíz de esta orden",
      });
    }

    const material = materialResult.recordset[0];
    const consumidoStockActual = Number(material.consumido_stock) || 0;
    const consumidoRecorteActual = Number(material.consumido_recorte) || 0;
    const confirmadoActual = Number(
      (consumidoStockActual + consumidoRecorteActual).toFixed(4),
    );

    if (objetivoRedondeado + 0.000001 < confirmadoActual) {
      await transaction.rollback();
      transaction = null;

      return res.status(400).json({
        error:
          `Ya se confirmaron ${confirmadoActual} unidades: ` +
          `${consumidoStockActual} de stock normal y ${consumidoRecorteActual} de recortes. ` +
          "No se puede bajar ese valor desde la OT. Si hubo un error, debe revertirse el movimiento correspondiente.",
      });
    }

    const diferenciaSinRedondear = Math.max(
      0,
      objetivoRedondeado - confirmadoActual,
    );
    const diferencia = Number(diferenciaSinRedondear.toFixed(2));

    if (Math.abs(diferenciaSinRedondear - diferencia) > 0.000001) {
      await transaction.rollback();
      transaction = null;

      return res.status(400).json({
        error:
          "La parte a egresar del stock normal admite como máximo 2 decimales",
      });
    }

    /*
     * Si no hay diferencia de stock, simplemente sincroniza Consumido.
     */
    if (diferencia <= 0) {
      await new sql.Request(transaction)
        .input("idMaterial", sql.Int, idMaterial)
        .input("consumido", sql.Decimal(18, 4), objetivoRedondeado).query(`
          UPDATE dbo.ordenes_trabajo_materiales
          SET consumido = @consumido
          WHERE id_ot_material = @idMaterial;
        `);

      await transaction.commit();
      transaction = null;

      return res.json({
        ok: true,
        ajuste_numero: null,
        egresado: 0,
        orden: await leerDetalle(pool, idOt),
      });
    }

    /* ========================================================
       MOTIVO INTERNO: CONSUMO PRODUCCIÓN
       ======================================================== */
    const motivoResult = await new sql.Request(transaction).query(`
      SELECT TOP 1
        id_motivo,
        nombre,
        tipo_movimiento
      FROM dbo.ajustes_motivos WITH (UPDLOCK, HOLDLOCK)
      WHERE activo = 1
        AND UPPER(
          REPLACE(
            LTRIM(RTRIM(nombre)),
            N'Ó',
            N'O'
          )
        ) = N'CONSUMO PRODUCCION'
      ORDER BY id_motivo;
    `);

    if (!motivoResult.recordset.length) {
      throw new Error(
        'Falta el motivo interno "CONSUMO PRODUCCIÓN" o está inactivo',
      );
    }

    const motivo = motivoResult.recordset[0];

    /* ========================================================
       DEPÓSITO PRODUCCIÓN
       ======================================================== */
    const depositoResult = await new sql.Request(transaction).query(`
      SELECT TOP 1
        id_deposito,
        nombre
      FROM dbo.depositos WITH (UPDLOCK, HOLDLOCK)
      WHERE UPPER(
        REPLACE(
          LTRIM(RTRIM(nombre)),
          N'Ó',
          N'O'
        )
      ) = N'PRODUCCION'
      ORDER BY id_deposito;
    `);

    if (!depositoResult.recordset.length) {
      throw new Error('No existe el depósito "Producción"');
    }

    const depositoId = Number(depositoResult.recordset[0].id_deposito);
    const depositoNombre = String(
      depositoResult.recordset[0].nombre || "Producción",
    );

    /* ========================================================
       ARTÍCULO
       ======================================================== */
    const articuloRequest = new sql.Request(transaction)
      .input("idArticulo", sql.Int, Number(material.id_articulo) || null)
      .input(
        "codigo",
        sql.NVarChar(100),
        String(material.codigo || "")
          .trim()
          .toUpperCase(),
      );

    const articuloResult = await articuloRequest.query(`
      SELECT TOP 1
        id_articulo,
        codigo,
        descripcion
      FROM dbo.articulos WITH (UPDLOCK, HOLDLOCK)
      WHERE
        (
          @idArticulo IS NOT NULL
          AND id_articulo = @idArticulo
        )
        OR UPPER(LTRIM(RTRIM(codigo))) = @codigo
      ORDER BY
        CASE WHEN id_articulo = @idArticulo THEN 0 ELSE 1 END,
        id_articulo;
    `);

    if (!articuloResult.recordset.length) {
      throw new Error(
        `El artículo ${material.codigo || "sin código"} no existe en dbo.articulos`,
      );
    }

    const articulo = articuloResult.recordset[0];
    const articuloId = Number(articulo.id_articulo);

    /* ========================================================
       STOCK DEL ARTÍCULO EN PRODUCCIÓN

       No obliga al usuario de la OT a elegir ubicación.
       Se descuenta de las ubicaciones activas con stock, empezando
       por la de mayor cantidad. En empate se prioriza GENERAL.
       Si una ubicación no alcanza, continúa con la siguiente.
       ======================================================== */
    const stockResult = await new sql.Request(transaction)
      .input("depositoId", sql.Int, depositoId)
      .input("articuloId", sql.Int, articuloId).query(`
        SELECT
          u.id_ubicacion,
          u.nombre,
          CAST(ISNULL(s.cantidad, 0) AS DECIMAL(18,2)) AS cantidad
        FROM dbo.ubicaciones u WITH (UPDLOCK, HOLDLOCK)
        LEFT JOIN dbo.stock s WITH (UPDLOCK, HOLDLOCK)
          ON s.id_deposito = u.id_deposito
          AND s.id_ubicacion = u.id_ubicacion
          AND s.id_articulo = @articuloId
        WHERE u.id_deposito = @depositoId
          AND u.activa = 1
          AND ISNULL(s.cantidad, 0) > 0
        ORDER BY
          ISNULL(s.cantidad, 0) DESC,
          CASE
            WHEN UPPER(LTRIM(RTRIM(u.nombre))) = 'GENERAL' THEN 0
            ELSE 1
          END,
          u.id_ubicacion;
      `);

    const ubicacionesStock = stockResult.recordset || [];
    const disponibleTotal = ubicacionesStock.reduce(
      (total, fila) => total + (Number(fila.cantidad) || 0),
      0,
    );

    if (disponibleTotal + 0.000001 < diferencia) {
      await transaction.rollback();
      transaction = null;

      return res.status(400).json({
        error: "Stock insuficiente en Producción",
        detalle: {
          codigo: articulo.codigo,
          requerido: diferencia,
          disponible: Number(disponibleTotal.toFixed(2)),
        },
      });
    }

    let pendiente = diferencia;
    const ubicacionesUtilizadas = [];

    for (const ubicacion of ubicacionesStock) {
      if (pendiente <= 0.000001) {
        break;
      }

      const disponibleUbicacion = Number(ubicacion.cantidad) || 0;
      const descontar = Number(
        Math.min(disponibleUbicacion, pendiente).toFixed(2),
      );

      if (descontar <= 0) {
        continue;
      }

      const descuento = await new sql.Request(transaction)
        .input("depositoId", sql.Int, depositoId)
        .input("articuloId", sql.Int, articuloId)
        .input("ubicacionId", sql.Int, Number(ubicacion.id_ubicacion))
        .input("cantidad", sql.Decimal(18, 2), descontar).query(`
          UPDATE dbo.stock
          SET cantidad = cantidad - @cantidad
          WHERE id_deposito = @depositoId
            AND id_articulo = @articuloId
            AND id_ubicacion = @ubicacionId
            AND cantidad >= @cantidad;

          SELECT @@ROWCOUNT AS afectados;
        `);

      if (Number(descuento.recordset?.[0]?.afectados || 0) !== 1) {
        throw new Error(
          `No se pudo descontar stock de ${articulo.codigo} en la ubicación ${ubicacion.nombre}`,
        );
      }

      ubicacionesUtilizadas.push({
        id_ubicacion: Number(ubicacion.id_ubicacion),
        nombre: String(ubicacion.nombre || ""),
        cantidad: descontar,
      });

      pendiente = Number((pendiente - descontar).toFixed(2));
    }

    if (pendiente > 0.000001) {
      throw new Error(
        `No se pudo completar el egreso de stock. Quedó pendiente ${pendiente}`,
      );
    }

    /* ========================================================
       CREAR AJUSTE
       ======================================================== */
    const numeroResult = await new sql.Request(transaction).query(`
      SELECT
        ISNULL(MAX(numero_ajuste), 0) + 1 AS numero
      FROM dbo.ajustes WITH (UPDLOCK, HOLDLOCK);
    `);

    const numeroAjuste = Number(numeroResult.recordset[0].numero);
    const usuario = obtenerUsuario(req) || "sistema OT";

    const obraVersion = String(orden.obra_version || "").trim();
    const punto = obraVersion.indexOf(".");
    const obra = punto > 0 ? obraVersion.slice(0, punto) : obraVersion || null;
    const version = punto > 0 ? obraVersion.slice(punto + 1) : null;

    await new sql.Request(transaction)
      .input("numeroAjuste", sql.Int, numeroAjuste)
      .input("deposito", sql.NVarChar(255), depositoNombre)
      .input("motivoId", sql.Int, Number(motivo.id_motivo))
      .input("motivo", sql.NVarChar(255), String(motivo.nombre))
      .input("obra", sql.NVarChar(200), obra)
      .input("version", sql.NVarChar(100), version)
      .input("remito", sql.NVarChar(255), String(orden.otid || ""))
      .input("usuario", sql.NVarChar(255), usuario).query(`
        INSERT INTO dbo.ajustes
        (
          numero_ajuste,
          deposito,
          motivo_id,
          motivo,
          obra,
          version,
          fecha,
          fecha_real,
          remito_referencia,
          usuario
        )
        VALUES
        (
          @numeroAjuste,
          @deposito,
          @motivoId,
          @motivo,
          @obra,
          @version,
          GETDATE(),
          CONVERT(date, GETDATE()),
          @remito,
          @usuario
        );
      `);

    /*
     * El controller de Ajustes actual contempla instalaciones donde
     * ajustes_detalles.usuario puede existir o no. Se conserva esa compatibilidad.
     */
    const detalleUsuarioResult = await new sql.Request(transaction).query(`
      SELECT TOP 1 1 AS existe
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = 'dbo'
        AND TABLE_NAME = 'ajustes_detalles'
        AND COLUMN_NAME = 'usuario';
    `);

    const detalleTipoResult = await new sql.Request(transaction).query(`
      SELECT TOP 1
        DATA_TYPE AS data_type,
        NUMERIC_SCALE AS numeric_scale
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = 'dbo'
        AND TABLE_NAME = 'ajustes_detalles'
        AND COLUMN_NAME = 'cantidad';
    `);

    const tipoCantidad = String(
      detalleTipoResult.recordset?.[0]?.data_type || "",
    ).toLowerCase();

    if (
      ["int", "bigint", "smallint", "tinyint"].includes(tipoCantidad) &&
      !Number.isInteger(diferencia)
    ) {
      throw new Error(
        "La columna ajustes_detalles.cantidad es entera y este consumo tiene decimales. Ajuste la estructura antes de confirmar este material.",
      );
    }

    const detalleRequest = new sql.Request(transaction)
      .input("ajusteId", sql.Int, numeroAjuste)
      .input(
        "codigo",
        sql.NVarChar(100),
        String(articulo.codigo || material.codigo || ""),
      )
      .input(
        "descripcion",
        sql.NVarChar(500),
        String(articulo.descripcion || material.descripcion || ""),
      )
      .input("cantidad", sql.Decimal(18, 4), -diferencia)
      .input(
        "observacion",
        sql.NVarChar(sql.MAX),
        `Consumo confirmado desde OT ${orden.otid}`,
      );

    if (detalleUsuarioResult.recordset.length) {
      detalleRequest.input("usuario", sql.NVarChar(255), usuario);

      await detalleRequest.query(`
        INSERT INTO dbo.ajustes_detalles
        (
          ajuste_id,
          cod_articulo,
          descripcion,
          cantidad,
          usuario,
          observacion
        )
        VALUES
        (
          @ajusteId,
          @codigo,
          @descripcion,
          @cantidad,
          @usuario,
          @observacion
        );
      `);
    } else {
      await detalleRequest.query(`
        INSERT INTO dbo.ajustes_detalles
        (
          ajuste_id,
          cod_articulo,
          descripcion,
          cantidad,
          observacion
        )
        VALUES
        (
          @ajusteId,
          @codigo,
          @descripcion,
          @cantidad,
          @observacion
        );
      `);
    }

    /* ========================================================
       SINCRONIZAR MATERIAL DE LA OT RAÍZ
       ======================================================== */
    await new sql.Request(transaction)
      .input("idMaterial", sql.Int, idMaterial)
      .input("consumido", sql.Decimal(18, 4), objetivoRedondeado)
      .input("diferencia", sql.Decimal(18, 4), diferencia).query(`
        UPDATE dbo.ordenes_trabajo_materiales
        SET
          consumido = @consumido,
          consumido_stock = ISNULL(consumido_stock, 0) + @diferencia
        WHERE id_ot_material = @idMaterial;
      `);

    /* ========================================================
       TRAZABILIDAD OT -> AJUSTE
       ======================================================== */
    await new sql.Request(transaction)
      .input("idOt", sql.Int, idOt)
      .input("idRaiz", sql.Int, idRaiz)
      .input("idMaterial", sql.Int, idMaterial)
      .input("cantidad", sql.Decimal(18, 4), diferencia)
      .input("numeroAjuste", sql.Int, numeroAjuste)
      .input("depositoId", sql.Int, depositoId)
      .input(
        "ubicacionId",
        sql.Int,
        ubicacionesUtilizadas.length === 1
          ? ubicacionesUtilizadas[0].id_ubicacion
          : null,
      )
      .input("usuario", sql.NVarChar(255), usuario).query(`
        INSERT INTO dbo.ordenes_trabajo_consumos_stock
        (
          id_ot,
          id_ot_raiz,
          id_ot_material,
          cantidad,
          numero_ajuste,
          id_deposito,
          id_ubicacion,
          usuario,
          fecha
        )
        VALUES
        (
          @idOt,
          @idRaiz,
          @idMaterial,
          @cantidad,
          @numeroAjuste,
          @depositoId,
          @ubicacionId,
          @usuario,
          SYSDATETIME()
        );
      `);

    await transaction.commit();
    transaction = null;

    return res.json({
      ok: true,
      ajuste_numero: numeroAjuste,
      egresado: diferencia,
      deposito: depositoNombre,
      ubicaciones: ubicacionesUtilizadas,
      orden: await leerDetalle(pool, idOt),
    });
  } catch (error) {
    if (transaction) {
      try {
        await transaction.rollback();
      } catch {}
    }

    console.error("ordenesTrabajo.confirmarConsumoMaterial:", error);

    return res.status(500).json({
      error: error.message || "Error al confirmar consumo de material",
      detalle: error.message,
    });
  }
};

// ============================================================
// OCULTAR EN LOTE CADENAS DE OT COMPLETAMENTE FINALIZADAS
// La misma función será reutilizada luego por el job de los viernes.
// ============================================================
exports.ocultarFinalizadasCompletas = async (req, res) => {
  try {
    if (!req.user?.is_admin) {
      return res.status(403).json({
        error: "Sólo un administrador puede ejecutar la limpieza masiva de OTs",
      });
    }

    await poolConnect;
    const pool = await getPool();

    const resultado = await ejecutarOcultamientoFinalizadasCompletas(pool);

    return res.json({
      ok: true,
      ...resultado,
      mensaje:
        resultado.total_cards_ocultadas > 0
          ? `Se ocultaron ${resultado.total_cards_ocultadas} cards correspondientes a ${resultado.cadenas_ocultadas} cadenas completamente finalizadas.`
          : "No se encontraron OTs completamente finalizadas para ocultar.",
    });
  } catch (error) {
    console.error("ordenesTrabajo.ocultarFinalizadasCompletas:", error);

    return res.status(500).json({
      error: "Error al ocultar las OTs completamente finalizadas",
      detalle: error.message,
    });
  }
};

exports.remove = async (req, res) => {
  try {
    const id = Number(req.params.id);

    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({
        error: "Orden de trabajo inválida",
      });
    }

    await poolConnect;
    const pool = await getPool();

    const result = await pool.request().input("id", sql.Int, id).query(`
        UPDATE dbo.ordenes_trabajo
        SET
          mostrar = 0,
          fecha_modificacion = SYSDATETIME()
        WHERE id_ot = @id
          AND mostrar = 1;

        SELECT @@ROWCOUNT AS affected;
      `);

    if (Number(result.recordset?.[0]?.affected || 0) === 0) {
      return res.status(404).json({
        error: "Orden de trabajo no encontrada o ya estaba oculta",
      });
    }

    return res.json({
      ok: true,
      ocultada: true,
      mensaje:
        "La card fue ocultada. La información permanece en la base de datos.",
    });
  } catch (error) {
    console.error("ordenesTrabajo.remove:", error);

    return res.status(500).json({
      error: "Error al ocultar la orden de trabajo",
      detalle: error.message,
    });
  }
};
