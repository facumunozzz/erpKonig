const { sql, poolConnect, getPool } = require("../db");

function fechaValida(valor) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(valor || ""));
}

function horaValida(valor) {
  return /^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/.test(String(valor || ""));
}

function lista(valor) {
  const valores = Array.isArray(valor) ? valor : valor ? [valor] : [];

  return [
    ...new Set(
      valores
        .map((item) => String(item || "").trim())
        .filter(Boolean),
    ),
  ].slice(0, 100);
}

function texto(valor, maximo = 250) {
  const resultado = String(valor ?? "").trim();
  return resultado ? resultado.slice(0, maximo) : null;
}

function numero(valor) {
  if (valor === "" || valor === null || valor === undefined) {
    return null;
  }

  const resultado = Number(valor);
  return Number.isFinite(resultado) ? resultado : null;
}

function tipoRegistro(valor) {
  const resultado = String(valor || "").trim().toUpperCase();
  return resultado === "DIRECTO" || resultado === "INDIRECTO"
    ? resultado
    : null;
}

function usuarioAuditoria(req) {
  return (
    texto(req.user?.nombre, 150) ||
    texto(req.user?.displayName, 150) ||
    texto(req.user?.usuario, 150) ||
    texto(req.user?.email, 150) ||
    "sistema"
  );
}

function agregarFiltroLista(request, columna, valores, prefijo) {
  if (!valores.length) {
    return "";
  }

  const parametros = valores.map((valor, indice) => {
    const nombre = `${prefijo}${indice}`;
    request.input(nombre, sql.NVarChar(150), valor);
    return `@${nombre}`;
  });

  return ` AND ${columna} IN (${parametros.join(", ")}) `;
}

exports.getOpciones = async (_req, res) => {
  try {
    await poolConnect;
    const pool = await getPool();

    const [operadoresResult, obrasResult, operacionesResult] =
      await Promise.all([
        pool.request().query(`
          SELECT operador
          FROM
          (
            SELECT LTRIM(RTRIM(nombre)) AS operador
            FROM dbo.referentes WITH (NOLOCK)
            WHERE activo = 1
              AND LTRIM(RTRIM(nombre)) <> ''

            UNION

            SELECT LTRIM(RTRIM(operador)) AS operador
            FROM dbo.ordenes_trabajo WITH (NOLOCK)
            WHERE operador IS NOT NULL
              AND LTRIM(RTRIM(operador)) <> ''

            UNION

            SELECT LTRIM(RTRIM(operador_ajustado)) AS operador
            FROM dbo.produccion_datos_ajustes WITH (NOLOCK)
            WHERE operador_ajustado IS NOT NULL
              AND LTRIM(RTRIM(operador_ajustado)) <> ''
          ) opciones
          ORDER BY operador;
        `),
        pool.request().query(`
          SELECT obra_version
          FROM
          (
            SELECT DISTINCT
              LTRIM(RTRIM(obra_version)) AS obra_version
            FROM dbo.ordenes_trabajo WITH (NOLOCK)
            WHERE tipo_ot <> 'INDIRECTO'
              AND obra_version IS NOT NULL
              AND LTRIM(RTRIM(obra_version)) <> ''

            UNION

            SELECT LTRIM(RTRIM(obra_version_ajustada)) AS obra_version
            FROM dbo.produccion_datos_ajustes WITH (NOLOCK)
            WHERE obra_version_ajustada IS NOT NULL
              AND LTRIM(RTRIM(obra_version_ajustada)) <> ''
          ) opciones
          ORDER BY obra_version;
        `),
        pool.request().query(`
          SELECT
            id_operacion,
            LTRIM(RTRIM(nombre)) AS nombre,
            tiempo_std
          FROM dbo.planificacion_operaciones WITH (NOLOCK)
          WHERE activa = 1
          ORDER BY nombre;
        `),
      ]);

    return res.json({
      operadores: (operadoresResult.recordset || []).map((fila) =>
        String(fila.operador || "").trim(),
      ),
      obras: (obrasResult.recordset || []).map((fila) =>
        String(fila.obra_version || "").trim(),
      ),
      operaciones: operacionesResult.recordset || [],
    });
  } catch (error) {
    console.error("indicadoresProduccion.getOpciones:", error);

    return res.status(500).json({
      error: "Error al obtener operadores, obras y operaciones",
      detalle: error.message,
    });
  }
};

exports.getDatos = async (req, res) => {
  try {
    const desde = fechaValida(req.query.desde) ? req.query.desde : null;
    const hasta = fechaValida(req.query.hasta) ? req.query.hasta : null;
    const operadores = lista(req.query.operador);
    const obras = lista(req.query.obra);

    await poolConnect;
    const pool = await getPool();
    const request = pool
      .request()
      .input("desde", sql.Date, desde)
      .input("hasta", sql.Date, hasta);

    const filtroOperadores = agregarFiltroLista(
      request,
      "datos.operador",
      operadores,
      "operador",
    );
    const filtroObras = agregarFiltroLista(
      request,
      "datos.obra_version",
      obras,
      "obra",
    );

    const result = await request.query(`
      SET NOCOUNT ON;

      ;WITH ordenes_base AS
      (
        SELECT
          ot.id_ot,
          ot.id_ot_origen,
          ot.otid,
          ot.tipo_ot,
          ot.fecha_planificada,
          ot.obra_version,
          ot.fase,
          ot.operacion,
          ot.motivo_indirecto,
          ot.cantidad_pedida,
          ot.cantidad_fabricada,
          LTRIM(RTRIM(ot.operador)) AS operador,
          ot.inicio_real,
          ot.fin_real,
          ISNULL(ot.tiempo_indirecto_segundos, 0)
            AS tiempo_indirecto_segundos,
          ot.observacion,
          CASE
            WHEN ot.inicio_real IS NULL OR ot.fin_real IS NULL THEN 0
            WHEN DATEDIFF_BIG(SECOND, ot.inicio_real, ot.fin_real) < 0 THEN 0
            ELSE DATEDIFF_BIG(SECOND, ot.inicio_real, ot.fin_real)
          END AS segundos_transcurridos
        FROM dbo.ordenes_trabajo ot WITH (NOLOCK)
        WHERE ot.inicio_real IS NOT NULL
          AND ot.fin_real IS NOT NULL
      ),
      base AS
      (
        SELECT
          ob.id_ot,
          ob.id_ot_origen,
          ob.otid,
          ob.tipo_ot,
          CAST(ob.inicio_real AS DATE) AS fecha,
          ob.fecha_planificada,
          ob.obra_version,
          ob.fase,
          ob.operacion,
          ob.motivo_indirecto,
          ob.cantidad_pedida,
          ob.cantidad_fabricada,
          ob.operador,
          ob.inicio_real,
          ob.fin_real,
          ob.observacion,
          ob.segundos_transcurridos,
          CASE
            WHEN ob.tiempo_indirecto_segundos < 0 THEN 0
            WHEN ob.tiempo_indirecto_segundos > ob.segundos_transcurridos
              THEN ob.segundos_transcurridos
            ELSE ob.tiempo_indirecto_segundos
          END AS segundos_indirectos_acumulados
        FROM ordenes_base ob
      ),
      registros AS
      (
        SELECT
          base.id_ot,
          base.id_ot_origen,
          base.otid AS orden_trabajo,
          CAST('DIRECTO' AS VARCHAR(20)) AS tipo_registro,
          base.fecha,
          base.fecha_planificada,
          base.operador,
          CAST(base.inicio_real AS TIME(0)) AS hora_inicio,
          CAST(base.fin_real AS TIME(0)) AS hora_fin,
          base.inicio_real,
          base.obra_version AS codigo,
          base.obra_version,
          CONVERT(NVARCHAR(50), base.fase) AS fase,
          base.operacion,
          CAST(NULL AS NVARCHAR(250)) AS descripcion,
          ISNULL(base.cantidad_fabricada, 0) AS cantidad,
          ISNULL(base.cantidad_pedida, 0) AS pedido,
          base.observacion,
          CAST(NULL AS NVARCHAR(150)) AS maquina,
          CAST(0 AS DECIMAL(18,4)) AS parada_maquina_minutos,
          CAST(0 AS DECIMAL(18,4)) AS descanso_minutos,
          CAST(1 AS INT) AS cantidad_personas,
          CAST(
            CASE
              WHEN base.segundos_transcurridos
                   - base.segundos_indirectos_acumulados < 0 THEN 0
              ELSE base.segundos_transcurridos
                   - base.segundos_indirectos_acumulados
            END AS BIGINT
          ) AS segundos_presencia,
          CAST(
            CASE
              WHEN base.segundos_transcurridos
                   - base.segundos_indirectos_acumulados < 0 THEN 0
              ELSE base.segundos_transcurridos
                   - base.segundos_indirectos_acumulados
            END AS BIGINT
          ) AS segundos_directos,
          CAST(0 AS BIGINT) AS segundos_indirectos
        FROM base
        WHERE base.tipo_ot <> 'INDIRECTO'

        UNION ALL

        SELECT
          base.id_ot,
          base.id_ot_origen,
          base.otid AS orden_trabajo,
          CAST('INDIRECTO' AS VARCHAR(20)) AS tipo_registro,
          base.fecha,
          base.fecha_planificada,
          base.operador,
          CAST(base.inicio_real AS TIME(0)) AS hora_inicio,
          CAST(base.fin_real AS TIME(0)) AS hora_fin,
          base.inicio_real,
          COALESCE(NULLIF(base.obra_version, ''), 'INDIRECTO') AS codigo,
          base.obra_version,
          CONVERT(NVARCHAR(50), base.fase) AS fase,
          CAST('INDIRECTO' AS NVARCHAR(150)) AS operacion,
          COALESCE(NULLIF(base.motivo_indirecto, ''), base.observacion)
            AS descripcion,
          CAST(0 AS DECIMAL(18,4)) AS cantidad,
          CAST(0 AS DECIMAL(18,4)) AS pedido,
          base.observacion,
          CAST(NULL AS NVARCHAR(150)) AS maquina,
          CAST(0 AS DECIMAL(18,4)) AS parada_maquina_minutos,
          CAST(0 AS DECIMAL(18,4)) AS descanso_minutos,
          CAST(1 AS INT) AS cantidad_personas,
          CAST(base.segundos_transcurridos AS BIGINT) AS segundos_presencia,
          CAST(0 AS BIGINT) AS segundos_directos,
          CAST(base.segundos_transcurridos AS BIGINT) AS segundos_indirectos
        FROM base
        WHERE base.tipo_ot = 'INDIRECTO'
      ),
      datos AS
      (
        SELECT
          registros.id_ot,
          registros.id_ot_origen,
          registros.orden_trabajo,
          registros.tipo_registro,
          CAST(COALESCE(aj.fecha_ajustada, registros.fecha) AS DATE) AS fecha,
          registros.fecha_planificada,
          ISNULL(
            NULLIF(
              LTRIM(RTRIM(COALESCE(aj.operador_ajustado, registros.operador))),
              ''
            ),
            'SIN OPERADOR'
          ) AS operador,
          CONVERT(
            VARCHAR(8),
            COALESCE(aj.hora_inicio_ajustada, registros.hora_inicio),
            108
          ) AS hora_inicio,
          CONVERT(
            VARCHAR(8),
            COALESCE(aj.hora_fin_ajustada, registros.hora_fin),
            108
          ) AS hora_fin,
          COALESCE(NULLIF(aj.codigo_ajustado, ''), registros.codigo) AS codigo,
          COALESCE(
            NULLIF(aj.obra_version_ajustada, ''),
            registros.obra_version
          ) AS obra_version,
          COALESCE(NULLIF(aj.fase_ajustada, ''), registros.fase) AS fase,
          COALESCE(
            NULLIF(aj.operacion_ajustada, ''),
            registros.operacion
          ) AS operacion,
          COALESCE(aj.descripcion_ajustada, registros.descripcion)
            AS descripcion,
          COALESCE(aj.cantidad_ajustada, registros.cantidad) AS cantidad,
          COALESCE(aj.pedido_ajustado, registros.pedido) AS pedido,
          COALESCE(aj.observacion_ajustada, registros.observacion)
            AS observacion,
          registros.maquina,
          registros.parada_maquina_minutos,
          registros.descanso_minutos,
          registros.cantidad_personas,
          COALESCE(
            aj.estandar_minutos_ajustado,
            estandarObra.tiempo_std,
            estandar.tiempo_std,
            0
          )
            AS estandar_minutos,
          CAST('unidad' AS VARCHAR(30)) AS unidad_estandar,
          COALESCE(
            aj.horas_presencia_ajustada,
            CAST(registros.segundos_presencia / 3600.0 AS DECIMAL(18,4))
          ) AS horas_presencia,
          COALESCE(
            aj.horas_directas_ajustada,
            CAST(registros.segundos_directos / 3600.0 AS DECIMAL(18,4))
          ) AS horas_directas,
          COALESCE(
            aj.horas_indirectas_ajustada,
            CAST(registros.segundos_indirectos / 3600.0 AS DECIMAL(18,4))
          ) AS horas_indirectas,
          COALESCE(
            aj.horas_estandar_ajustada,
            CAST(
              CASE
                WHEN registros.tipo_registro = 'INDIRECTO' THEN 0
                ELSE
                  COALESCE(aj.cantidad_ajustada, registros.cantidad)
                  * COALESCE(
                      aj.estandar_minutos_ajustado,
                      estandarObra.tiempo_std,
                      estandar.tiempo_std,
                      0
                    )
                  / 60.0
              END AS DECIMAL(18,4)
            )
          ) AS horas_estandar,
          YEAR(COALESCE(aj.fecha_ajustada, registros.fecha)) AS anio,
          CASE WHEN aj.id_ajuste IS NULL THEN 0 ELSE 1 END AS ajustado,
          CONVERT(VARCHAR(19), aj.fecha_modificacion, 120)
            AS fecha_ajuste,
          aj.usuario_modificacion AS usuario_ajuste
        FROM registros
        LEFT JOIN dbo.planificacion_operaciones estandar WITH (NOLOCK)
          ON estandar.activa = 1
         AND UPPER(LTRIM(RTRIM(estandar.nombre))) =
             UPPER(LTRIM(RTRIM(registros.operacion)))
        LEFT JOIN dbo.planificacion_tiempos_std_obra estandarObra WITH (NOLOCK)
          ON estandarObra.id_operacion = estandar.id_operacion
         AND estandarObra.obra_version =
             UPPER(LTRIM(RTRIM(registros.obra_version)))
         AND estandarObra.fase = TRY_CONVERT(INT, registros.fase)
        LEFT JOIN dbo.produccion_datos_ajustes aj WITH (NOLOCK)
          ON aj.id_ot = registros.id_ot
         AND aj.tipo_registro = registros.tipo_registro
      )
      SELECT
        datos.id_ot,
        datos.id_ot_origen,
        datos.orden_trabajo,
        datos.tipo_registro,
        CONVERT(VARCHAR(10), datos.fecha, 23) AS fecha,
        CONVERT(VARCHAR(10), datos.fecha_planificada, 23)
          AS fecha_planificada,
        datos.operador,
        datos.hora_inicio,
        datos.hora_fin,
        datos.codigo,
        datos.obra_version,
        datos.fase,
        datos.operacion,
        datos.descripcion,
        datos.cantidad,
        datos.pedido,
        datos.observacion,
        datos.maquina,
        datos.parada_maquina_minutos,
        datos.descanso_minutos,
        datos.cantidad_personas,
        datos.estandar_minutos,
        datos.unidad_estandar,
        datos.horas_presencia,
        datos.horas_directas,
        datos.horas_indirectas,
        datos.horas_estandar,
        datos.anio,
        datos.ajustado,
        datos.fecha_ajuste,
        datos.usuario_ajuste
      FROM datos
      WHERE (@desde IS NULL OR datos.fecha >= @desde)
        AND (@hasta IS NULL OR datos.fecha <= @hasta)
        ${filtroOperadores}
        ${filtroObras}
      ORDER BY
        datos.fecha DESC,
        datos.hora_inicio DESC,
        datos.id_ot DESC;
    `);

    return res.json(result.recordset || []);
  } catch (error) {
    console.error("indicadoresProduccion.getDatos:", error);

    return res.status(500).json({
      error: "Error al obtener los datos de producción",
      detalle: error.message,
    });
  }
};

exports.guardarAjusteDato = async (req, res) => {
  try {
    const idOt = Number(req.params.id);
    const tipo = tipoRegistro(req.params.tipoRegistro);

    if (!Number.isInteger(idOt) || idOt <= 0 || !tipo) {
      return res.status(400).json({
        error: "Fila de datos inválida",
      });
    }

    const body = req.body || {};
    const fecha = fechaValida(body.fecha) ? body.fecha : null;
    const horaInicio = horaValida(body.hora_inicio) ? body.hora_inicio : null;
    const horaFin = horaValida(body.hora_fin) ? body.hora_fin : null;

    await poolConnect;
    const pool = await getPool();

    const existe = await pool
      .request()
      .input("id_ot", sql.Int, idOt)
      .query(`
        SELECT TOP 1 id_ot
        FROM dbo.ordenes_trabajo WITH (NOLOCK)
        WHERE id_ot = @id_ot;
      `);

    if (!existe.recordset.length) {
      return res.status(404).json({
        error: "Orden de trabajo no encontrada",
      });
    }

    await pool
      .request()
      .input("id_ot", sql.Int, idOt)
      .input("tipo_registro", sql.VarChar(20), tipo)
      .input("fecha_ajustada", sql.Date, fecha)
      .input("hora_inicio", sql.NVarChar(8), horaInicio)
      .input("hora_fin", sql.NVarChar(8), horaFin)
      .input("operador_ajustado", sql.NVarChar(150), texto(body.operador, 150))
      .input("codigo_ajustado", sql.NVarChar(150), texto(body.codigo, 150))
      .input(
        "obra_version_ajustada",
        sql.NVarChar(150),
        texto(body.obra_version || body.codigo, 150),
      )
      .input("fase_ajustada", sql.NVarChar(50), texto(body.fase, 50))
      .input("operacion_ajustada", sql.NVarChar(150), texto(body.operacion, 150))
      .input(
        "descripcion_ajustada",
        sql.NVarChar(250),
        texto(body.descripcion, 250),
      )
      .input("cantidad_ajustada", sql.Decimal(18, 4), numero(body.cantidad))
      .input("pedido_ajustado", sql.Decimal(18, 4), numero(body.pedido))
      .input(
        "observacion_ajustada",
        sql.NVarChar(sql.MAX),
        texto(body.observacion, 4000),
      )
      .input(
        "estandar_minutos_ajustado",
        sql.Decimal(18, 4),
        numero(body.estandar_minutos),
      )
      .input(
        "horas_presencia_ajustada",
        sql.Decimal(18, 4),
        numero(body.horas_presencia),
      )
      .input(
        "horas_directas_ajustada",
        sql.Decimal(18, 4),
        numero(body.horas_directas),
      )
      .input(
        "horas_indirectas_ajustada",
        sql.Decimal(18, 4),
        numero(body.horas_indirectas),
      )
      .input(
        "horas_estandar_ajustada",
        sql.Decimal(18, 4),
        numero(body.horas_estandar),
      )
      .input("usuario_modificacion", sql.NVarChar(150), usuarioAuditoria(req))
      .query(`
        MERGE dbo.produccion_datos_ajustes AS destino
        USING (
          SELECT
            @id_ot AS id_ot,
            @tipo_registro AS tipo_registro
        ) AS origen
        ON destino.id_ot = origen.id_ot
       AND destino.tipo_registro = origen.tipo_registro
        WHEN MATCHED THEN
          UPDATE SET
            fecha_ajustada = @fecha_ajustada,
            hora_inicio_ajustada = TRY_CONVERT(TIME(0), @hora_inicio),
            hora_fin_ajustada = TRY_CONVERT(TIME(0), @hora_fin),
            operador_ajustado = @operador_ajustado,
            codigo_ajustado = @codigo_ajustado,
            obra_version_ajustada = @obra_version_ajustada,
            fase_ajustada = @fase_ajustada,
            operacion_ajustada = @operacion_ajustada,
            descripcion_ajustada = @descripcion_ajustada,
            cantidad_ajustada = @cantidad_ajustada,
            pedido_ajustado = @pedido_ajustado,
            observacion_ajustada = @observacion_ajustada,
            estandar_minutos_ajustado = @estandar_minutos_ajustado,
            horas_presencia_ajustada = @horas_presencia_ajustada,
            horas_directas_ajustada = @horas_directas_ajustada,
            horas_indirectas_ajustada = @horas_indirectas_ajustada,
            horas_estandar_ajustada = @horas_estandar_ajustada,
            usuario_modificacion = @usuario_modificacion,
            fecha_modificacion = SYSDATETIME()
        WHEN NOT MATCHED THEN
          INSERT (
            id_ot,
            tipo_registro,
            fecha_ajustada,
            hora_inicio_ajustada,
            hora_fin_ajustada,
            operador_ajustado,
            codigo_ajustado,
            obra_version_ajustada,
            fase_ajustada,
            operacion_ajustada,
            descripcion_ajustada,
            cantidad_ajustada,
            pedido_ajustado,
            observacion_ajustada,
            estandar_minutos_ajustado,
            horas_presencia_ajustada,
            horas_directas_ajustada,
            horas_indirectas_ajustada,
            horas_estandar_ajustada,
            usuario_creacion,
            usuario_modificacion
          )
          VALUES (
            @id_ot,
            @tipo_registro,
            @fecha_ajustada,
            TRY_CONVERT(TIME(0), @hora_inicio),
            TRY_CONVERT(TIME(0), @hora_fin),
            @operador_ajustado,
            @codigo_ajustado,
            @obra_version_ajustada,
            @fase_ajustada,
            @operacion_ajustada,
            @descripcion_ajustada,
            @cantidad_ajustada,
            @pedido_ajustado,
            @observacion_ajustada,
            @estandar_minutos_ajustado,
            @horas_presencia_ajustada,
            @horas_directas_ajustada,
            @horas_indirectas_ajustada,
            @horas_estandar_ajustada,
            @usuario_modificacion,
            @usuario_modificacion
          );
      `);

    return res.json({
      message: "Dato ajustado correctamente",
    });
  } catch (error) {
    console.error("indicadoresProduccion.guardarAjusteDato:", error);

    return res.status(500).json({
      error: "Error al guardar el ajuste del dato",
      detalle: error.message,
    });
  }
};

exports.restaurarDatoOriginal = async (req, res) => {
  try {
    const idOt = Number(req.params.id);
    const tipo = tipoRegistro(req.params.tipoRegistro);

    if (!Number.isInteger(idOt) || idOt <= 0 || !tipo) {
      return res.status(400).json({
        error: "Fila de datos inválida",
      });
    }

    await poolConnect;
    const pool = await getPool();

    await pool
      .request()
      .input("id_ot", sql.Int, idOt)
      .input("tipo_registro", sql.VarChar(20), tipo)
      .query(`
        DELETE FROM dbo.produccion_datos_ajustes
        WHERE id_ot = @id_ot
          AND tipo_registro = @tipo_registro;
      `);

    return res.json({
      message: "Dato restaurado al valor original",
    });
  } catch (error) {
    console.error("indicadoresProduccion.restaurarDatoOriginal:", error);

    return res.status(500).json({
      error: "Error al restaurar el dato original",
      detalle: error.message,
    });
  }
};