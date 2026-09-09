const { sql, poolConnect, getPool } = require("../db");

const CAMPOS = [
  "estado",
  "caratula",
  "version",
  "fase",
  "mrp",
  "fecha_mrp",
  "prioridad",
  "etapa",
  "cerrado_comercial",
  "fecha_aprobacion",
  "comercial",
  "referencia",
  "color",
  "fecha_entrega",
  "pedido_vidrios",
  "proveedor_vidrios",
  "cantidad_vidrios",
  "fecha_recepcion_vidrios",
  "curvos_formas",
  "premarcos",
  "mosquiteros",
  "fecha_fabricacion_mosquiteros",
  "complejidad",
  "fecha_inicio_prod_programada",
  "fecha_inicio_prod_real",
  "estado_produccion",
  "fecha_disponibilidad_programada",
  "fecha_disponibilidad_real",
  "control_fisico",
  "observaciones",
];

function texto(value) {
  if (value === undefined || value === null) {
    return null;
  }

  const limpio = String(value).trim();

  return limpio === "" ? null : limpio;
}

function fecha(value) {
  const limpio = texto(value);

  return limpio || null;
}

function decimal(value) {
  if (value === undefined || value === null || value === "") {
    return null;
  }

  const numero = Number(value);

  return Number.isFinite(numero) ? numero : null;
}

function bit(value) {
  return value === true ||
    value === 1 ||
    value === "1" ||
    String(value).toLowerCase() === "true";
}

function bodyNormalizado(body = {}) {
  return {
    estado: texto(body.estado),
    caratula: texto(body.caratula),
    version: texto(body.version),
    fase: texto(body.fase),
    mrp: texto(body.mrp),
    fecha_mrp: fecha(body.fecha_mrp),
    prioridad: texto(body.prioridad),
    etapa: texto(body.etapa),
    cerrado_comercial: bit(body.cerrado_comercial),
    fecha_aprobacion: fecha(body.fecha_aprobacion),
    comercial: texto(body.comercial),
    referencia: texto(body.referencia),
    color: texto(body.color),
    fecha_entrega: fecha(body.fecha_entrega),
    pedido_vidrios: texto(body.pedido_vidrios),
    proveedor_vidrios: texto(body.proveedor_vidrios),
    cantidad_vidrios: decimal(body.cantidad_vidrios),
    fecha_recepcion_vidrios: fecha(body.fecha_recepcion_vidrios),
    curvos_formas: texto(body.curvos_formas),
    premarcos: texto(body.premarcos),
    mosquiteros: texto(body.mosquiteros),
    fecha_fabricacion_mosquiteros: fecha(
      body.fecha_fabricacion_mosquiteros,
    ),
    complejidad: texto(body.complejidad),
    fecha_inicio_prod_programada: fecha(
      body.fecha_inicio_prod_programada,
    ),
    fecha_inicio_prod_real: fecha(body.fecha_inicio_prod_real),
    estado_produccion: texto(body.estado_produccion),
    fecha_disponibilidad_programada: fecha(
      body.fecha_disponibilidad_programada,
    ),
    fecha_disponibilidad_real: fecha(body.fecha_disponibilidad_real),
    control_fisico: texto(body.control_fisico),
    observaciones: texto(body.observaciones),
  };
}

async function validarEstado(request, nombre) {
  if (!nombre) {
    return true;
  }

  const result = await request
    .input("estadoValidar", sql.NVarChar(150), nombre)
    .query(`
      SELECT TOP 1 id_estado
      FROM dbo.estado_resumen_estados
      WHERE nombre = @estadoValidar;
    `);

  return result.recordset.length > 0;
}

function cargarInputs(request, data) {
  return request
    .input("estado", sql.NVarChar(150), data.estado)
    .input("caratula", sql.NVarChar(150), data.caratula)
    .input("version", sql.NVarChar(50), data.version)
    .input("fase", sql.NVarChar(50), data.fase)
    .input("mrp", sql.NVarChar(100), data.mrp)
    .input("fecha_mrp", sql.Date, data.fecha_mrp)
    .input("prioridad", sql.NVarChar(50), data.prioridad)
    .input("etapa", sql.NVarChar(150), data.etapa)
    .input("cerrado_comercial", sql.Bit, data.cerrado_comercial)
    .input("fecha_aprobacion", sql.Date, data.fecha_aprobacion)
    .input("comercial", sql.NVarChar(150), data.comercial)
    .input("referencia", sql.NVarChar(150), data.referencia)
    .input("color", sql.NVarChar(100), data.color)
    .input("fecha_entrega", sql.Date, data.fecha_entrega)
    .input("pedido_vidrios", sql.NVarChar(150), data.pedido_vidrios)
    .input("proveedor_vidrios", sql.NVarChar(150), data.proveedor_vidrios)
    .input("cantidad_vidrios", sql.Decimal(18, 2), data.cantidad_vidrios)
    .input(
      "fecha_recepcion_vidrios",
      sql.Date,
      data.fecha_recepcion_vidrios,
    )
    .input("curvos_formas", sql.NVarChar(150), data.curvos_formas)
    .input("premarcos", sql.NVarChar(150), data.premarcos)
    .input("mosquiteros", sql.NVarChar(150), data.mosquiteros)
    .input(
      "fecha_fabricacion_mosquiteros",
      sql.Date,
      data.fecha_fabricacion_mosquiteros,
    )
    .input("complejidad", sql.NVarChar(100), data.complejidad)
    .input(
      "fecha_inicio_prod_programada",
      sql.Date,
      data.fecha_inicio_prod_programada,
    )
    .input("fecha_inicio_prod_real", sql.Date, data.fecha_inicio_prod_real)
    .input(
      "estado_produccion",
      sql.NVarChar(150),
      data.estado_produccion,
    )
    .input(
      "fecha_disponibilidad_programada",
      sql.Date,
      data.fecha_disponibilidad_programada,
    )
    .input(
      "fecha_disponibilidad_real",
      sql.Date,
      data.fecha_disponibilidad_real,
    )
    .input("control_fisico", sql.NVarChar(150), data.control_fisico)
    .input("observaciones", sql.NVarChar(sql.MAX), data.observaciones);
}

exports.getAll = async (req, res) => {
  try {
    await poolConnect;
    const pool = await getPool();

    const result = await pool.request().query(`
      SELECT
        id,
        estado,
        caratula,
        version,
        fase,
        mrp,
        fecha_mrp,
        prioridad,
        etapa,
        cerrado_comercial,
        fecha_aprobacion,
        comercial,
        referencia,
        color,
        fecha_entrega,
        pedido_vidrios,
        proveedor_vidrios,
        cantidad_vidrios,
        fecha_recepcion_vidrios,
        curvos_formas,
        premarcos,
        mosquiteros,
        fecha_fabricacion_mosquiteros,
        complejidad,
        fecha_inicio_prod_programada,
        fecha_inicio_prod_real,
        estado_produccion,
        fecha_disponibilidad_programada,
        fecha_disponibilidad_real,
        control_fisico,
        observaciones,
        created_at,
        updated_at
      FROM dbo.estado_resumen
      ORDER BY id DESC;
    `);

    return res.json({
      ok: true,
      rows: result.recordset,
    });
  } catch (err) {
    console.error("estadoResumen.getAll:", err);

    return res.status(500).json({
      error: "Error obteniendo carátulas",
      detalle: err.message,
    });
  }
};

exports.create = async (req, res) => {
  try {
    await poolConnect;
    const pool = await getPool();
    const data = bodyNormalizado(req.body);

    if (!data.estado) {
      return res.status(400).json({
        error: "Debe seleccionar el Estado antes de guardar la fila.",
      });
    }

    const estadoValido = await validarEstado(pool.request(), data.estado);

    if (!estadoValido) {
      return res.status(400).json({
        error: "El Estado seleccionado no existe en el catálogo.",
      });
    }

    if (data.estado_produccion) {
      const estadoProduccionValido = await validarEstado(
        pool.request(),
        data.estado_produccion,
      );

      if (!estadoProduccionValido) {
        return res.status(400).json({
          error: "El segundo Estado seleccionado no existe en el catálogo.",
        });
      }
    }

    const request = cargarInputs(pool.request(), data);

    const result = await request.query(`
      INSERT INTO dbo.estado_resumen (
        estado,
        caratula,
        version,
        fase,
        mrp,
        fecha_mrp,
        prioridad,
        etapa,
        cerrado_comercial,
        fecha_aprobacion,
        comercial,
        referencia,
        color,
        fecha_entrega,
        pedido_vidrios,
        proveedor_vidrios,
        cantidad_vidrios,
        fecha_recepcion_vidrios,
        curvos_formas,
        premarcos,
        mosquiteros,
        fecha_fabricacion_mosquiteros,
        complejidad,
        fecha_inicio_prod_programada,
        fecha_inicio_prod_real,
        estado_produccion,
        fecha_disponibilidad_programada,
        fecha_disponibilidad_real,
        control_fisico,
        observaciones,
        created_at,
        updated_at
      )
      OUTPUT INSERTED.*
      VALUES (
        @estado,
        @caratula,
        @version,
        @fase,
        @mrp,
        @fecha_mrp,
        @prioridad,
        @etapa,
        @cerrado_comercial,
        @fecha_aprobacion,
        @comercial,
        @referencia,
        @color,
        @fecha_entrega,
        @pedido_vidrios,
        @proveedor_vidrios,
        @cantidad_vidrios,
        @fecha_recepcion_vidrios,
        @curvos_formas,
        @premarcos,
        @mosquiteros,
        @fecha_fabricacion_mosquiteros,
        @complejidad,
        @fecha_inicio_prod_programada,
        @fecha_inicio_prod_real,
        @estado_produccion,
        @fecha_disponibilidad_programada,
        @fecha_disponibilidad_real,
        @control_fisico,
        @observaciones,
        SYSDATETIME(),
        SYSDATETIME()
      );
    `);

    return res.status(201).json({
      ok: true,
      row: result.recordset[0],
    });
  } catch (err) {
    console.error("estadoResumen.create:", err);

    return res.status(500).json({
      error: "Error creando la carátula",
      detalle: err.message,
    });
  }
};

exports.update = async (req, res) => {
  try {
    const id = Number(req.params.id);

    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({
        error: "Registro inválido.",
      });
    }

    await poolConnect;
    const pool = await getPool();
    const data = bodyNormalizado(req.body);

    if (!data.estado) {
      return res.status(400).json({
        error: "Debe seleccionar el Estado.",
      });
    }

    const estadoValido = await validarEstado(pool.request(), data.estado);

    if (!estadoValido) {
      return res.status(400).json({
        error: "El Estado seleccionado no existe en el catálogo.",
      });
    }

    if (data.estado_produccion) {
      const estadoProduccionValido = await validarEstado(
        pool.request(),
        data.estado_produccion,
      );

      if (!estadoProduccionValido) {
        return res.status(400).json({
          error: "El segundo Estado seleccionado no existe en el catálogo.",
        });
      }
    }

    const request = cargarInputs(
      pool.request().input("id", sql.Int, id),
      data,
    );

    const result = await request.query(`
      UPDATE dbo.estado_resumen
      SET
        estado = @estado,
        caratula = @caratula,
        version = @version,
        fase = @fase,
        mrp = @mrp,
        fecha_mrp = @fecha_mrp,
        prioridad = @prioridad,
        etapa = @etapa,
        cerrado_comercial = @cerrado_comercial,
        fecha_aprobacion = @fecha_aprobacion,
        comercial = @comercial,
        referencia = @referencia,
        color = @color,
        fecha_entrega = @fecha_entrega,
        pedido_vidrios = @pedido_vidrios,
        proveedor_vidrios = @proveedor_vidrios,
        cantidad_vidrios = @cantidad_vidrios,
        fecha_recepcion_vidrios = @fecha_recepcion_vidrios,
        curvos_formas = @curvos_formas,
        premarcos = @premarcos,
        mosquiteros = @mosquiteros,
        fecha_fabricacion_mosquiteros = @fecha_fabricacion_mosquiteros,
        complejidad = @complejidad,
        fecha_inicio_prod_programada = @fecha_inicio_prod_programada,
        fecha_inicio_prod_real = @fecha_inicio_prod_real,
        estado_produccion = @estado_produccion,
        fecha_disponibilidad_programada = @fecha_disponibilidad_programada,
        fecha_disponibilidad_real = @fecha_disponibilidad_real,
        control_fisico = @control_fisico,
        observaciones = @observaciones,
        updated_at = SYSDATETIME()
      OUTPUT INSERTED.*
      WHERE id = @id;
    `);

    if (!result.recordset.length) {
      return res.status(404).json({
        error: "Registro no encontrado.",
      });
    }

    return res.json({
      ok: true,
      row: result.recordset[0],
    });
  } catch (err) {
    console.error("estadoResumen.update:", err);

    return res.status(500).json({
      error: "Error actualizando la carátula",
      detalle: err.message,
    });
  }
};

// =====================================================
// CATÁLOGO DE ESTADOS
// =====================================================

exports.getEstados = async (req, res) => {
  try {
    await poolConnect;
    const pool = await getPool();

    const result = await pool.request().query(`
      SELECT
        id_estado,
        nombre,
        created_at,
        updated_at
      FROM dbo.estado_resumen_estados
      ORDER BY nombre;
    `);

    return res.json({
      ok: true,
      rows: result.recordset,
    });
  } catch (err) {
    console.error("estadoResumen.getEstados:", err);

    return res.status(500).json({
      error: "Error obteniendo estados",
      detalle: err.message,
    });
  }
};

exports.createEstado = async (req, res) => {
  try {
    const nombre = texto(req.body?.nombre);

    if (!nombre) {
      return res.status(400).json({
        error: "El nombre del estado es obligatorio.",
      });
    }

    await poolConnect;
    const pool = await getPool();

    const result = await pool
      .request()
      .input("nombre", sql.NVarChar(150), nombre)
      .query(`
        INSERT INTO dbo.estado_resumen_estados (
          nombre,
          created_at,
          updated_at
        )
        OUTPUT INSERTED.*
        VALUES (
          @nombre,
          SYSDATETIME(),
          SYSDATETIME()
        );
      `);

    return res.status(201).json({
      ok: true,
      row: result.recordset[0],
    });
  } catch (err) {
    if (err?.number === 2601 || err?.number === 2627) {
      return res.status(409).json({
        error: "Ya existe un estado con ese nombre.",
      });
    }

    console.error("estadoResumen.createEstado:", err);

    return res.status(500).json({
      error: "Error creando estado",
      detalle: err.message,
    });
  }
};

exports.updateEstado = async (req, res) => {
  let transaction;

  try {
    const id = Number(req.params.id);
    const nombre = texto(req.body?.nombre);

    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({
        error: "Estado inválido.",
      });
    }

    if (!nombre) {
      return res.status(400).json({
        error: "El nombre del estado es obligatorio.",
      });
    }

    await poolConnect;
    const pool = await getPool();

    transaction = new sql.Transaction(pool);
    await transaction.begin();

    const actualResult = await new sql.Request(transaction)
      .input("id", sql.Int, id)
      .query(`
        SELECT nombre
        FROM dbo.estado_resumen_estados WITH (UPDLOCK, HOLDLOCK)
        WHERE id_estado = @id;
      `);

    if (!actualResult.recordset.length) {
      await transaction.rollback();

      return res.status(404).json({
        error: "Estado no encontrado.",
      });
    }

    const nombreAnterior = actualResult.recordset[0].nombre;

    const actualizado = await new sql.Request(transaction)
      .input("id", sql.Int, id)
      .input("nombre", sql.NVarChar(150), nombre)
      .query(`
        UPDATE dbo.estado_resumen_estados
        SET
          nombre = @nombre,
          updated_at = SYSDATETIME()
        OUTPUT INSERTED.*
        WHERE id_estado = @id;
      `);

    await new sql.Request(transaction)
      .input("anterior", sql.NVarChar(150), nombreAnterior)
      .input("nuevo", sql.NVarChar(150), nombre)
      .query(`
        UPDATE dbo.estado_resumen
        SET
          estado = CASE
            WHEN estado = @anterior THEN @nuevo
            ELSE estado
          END,
          estado_produccion = CASE
            WHEN estado_produccion = @anterior THEN @nuevo
            ELSE estado_produccion
          END,
          updated_at = SYSDATETIME()
        WHERE estado = @anterior
           OR estado_produccion = @anterior;
      `);

    await transaction.commit();

    return res.json({
      ok: true,
      row: actualizado.recordset[0],
    });
  } catch (err) {
    if (transaction) {
      try {
        await transaction.rollback();
      } catch {}
    }

    if (err?.number === 2601 || err?.number === 2627) {
      return res.status(409).json({
        error: "Ya existe un estado con ese nombre.",
      });
    }

    console.error("estadoResumen.updateEstado:", err);

    return res.status(500).json({
      error: "Error editando estado",
      detalle: err.message,
    });
  }
};

exports.deleteEstado = async (req, res) => {
  try {
    const id = Number(req.params.id);

    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({
        error: "Estado inválido.",
      });
    }

    await poolConnect;
    const pool = await getPool();

    const estadoResult = await pool
      .request()
      .input("id", sql.Int, id)
      .query(`
        SELECT nombre
        FROM dbo.estado_resumen_estados
        WHERE id_estado = @id;
      `);

    if (!estadoResult.recordset.length) {
      return res.status(404).json({
        error: "Estado no encontrado.",
      });
    }

    const nombre = estadoResult.recordset[0].nombre;

    const usoResult = await pool
      .request()
      .input("nombre", sql.NVarChar(150), nombre)
      .query(`
        SELECT COUNT(*) AS cantidad
        FROM dbo.estado_resumen
        WHERE estado = @nombre
           OR estado_produccion = @nombre;
      `);

    const cantidadUso = Number(usoResult.recordset?.[0]?.cantidad || 0);

    if (cantidadUso > 0) {
      return res.status(409).json({
        error:
          `No se puede eliminar "${nombre}" porque está utilizado en ` +
          `${cantidadUso} registro(s). Primero cambie esos registros a otro estado.`,
      });
    }

    await pool
      .request()
      .input("id", sql.Int, id)
      .query(`
        DELETE FROM dbo.estado_resumen_estados
        WHERE id_estado = @id;
      `);

    return res.json({
      ok: true,
    });
  } catch (err) {
    console.error("estadoResumen.deleteEstado:", err);

    return res.status(500).json({
      error: "Error eliminando estado",
      detalle: err.message,
    });
  }
};