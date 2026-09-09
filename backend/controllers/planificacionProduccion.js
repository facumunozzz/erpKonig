const { sql, poolConnect, getPool } = require("../db");

function texto(valor) {
  const resultado = String(valor ?? "").trim();
  return resultado || null;
}

function numero(valor) {
  const resultado = Number(valor);
  return Number.isFinite(resultado) ? resultado : null;
}

function normalizarObraVersion(valor) {
  return String(valor ?? "").trim().replace(",", ".").toUpperCase();
}

function usuarioAuditoria(req) {
  return (
    texto(req.user?.nombre) ||
    texto(req.user?.displayName) ||
    texto(req.user?.usuario) ||
    texto(req.user?.email) ||
    "sistema"
  );
}

const OPERACIONES_CARGA_AUTOMATICA = new Set([
  "PREPARACION PERFIL",
  "CORTE REFUERZO",
  "CORTE PERFIL",
  "MECANIZADO",
  "SOLDADURA AUTO",
  "ARMADO",
  "ACRISTALADO",
  "MOSQUITERO",
]);

exports.getOperaciones = async (req, res) => {
  try {
    await poolConnect;
    const pool = await getPool();

    const result = await pool.request().query(`
      SELECT
        id_operacion,
        nombre,
        tiempo_std,
        activa
      FROM dbo.planificacion_operaciones
      WHERE activa = 1
      ORDER BY nombre;
    `);

    return res.json(result.recordset || []);
  } catch (error) {
    console.error("getOperaciones:", error);

    return res.status(500).json({
      error: "Error al obtener operaciones",
      detalle: error.message,
    });
  }
};

exports.createOperacion = async (req, res) => {
  try {
    const nombre = texto(req.body?.nombre);
    const tiempoStd = numero(req.body?.tiempo_std) ?? 0;

    if (!nombre) {
      return res.status(400).json({
        error: "Debe indicar el nombre de la operación",
      });
    }

    await poolConnect;
    const pool = await getPool();

    const result = await pool
      .request()
      .input("nombre", sql.NVarChar(150), nombre)
      .input("tiempo_std", sql.Decimal(18, 4), tiempoStd)
      .query(`
        INSERT INTO dbo.planificacion_operaciones (
          nombre,
          tiempo_std
        )
        OUTPUT
          INSERTED.id_operacion,
          INSERTED.nombre,
          INSERTED.tiempo_std,
          INSERTED.activa
        VALUES (
          @nombre,
          @tiempo_std
        );
      `);

    return res.status(201).json(result.recordset[0]);
  } catch (error) {
    console.error("createOperacion:", error);

    if (error.number === 2601 || error.number === 2627) {
      return res.status(409).json({
        error: "La operación ya existe",
      });
    }

    return res.status(500).json({
      error: "Error al crear la operación",
      detalle: error.message,
    });
  }
};

exports.updateOperacion = async (req, res) => {
  try {
    const id = Number(req.params.id);
    const nombre = texto(req.body?.nombre);
    const tiempoStd = numero(req.body?.tiempo_std);

    if (!Number.isInteger(id)) {
      return res.status(400).json({
        error: "ID de operación inválido",
      });
    }

    if (!nombre || tiempoStd === null) {
      return res.status(400).json({
        error: "Debe indicar nombre y tiempo estándar",
      });
    }

    await poolConnect;
    const pool = await getPool();

    const result = await pool
      .request()
      .input("id", sql.Int, id)
      .input("nombre", sql.NVarChar(150), nombre)
      .input("tiempo_std", sql.Decimal(18, 4), tiempoStd)
      .query(`
        UPDATE dbo.planificacion_operaciones
        SET
          nombre = @nombre,
          tiempo_std = @tiempo_std,
          fecha_modificacion = SYSDATETIME()
        WHERE id_operacion = @id;

        SELECT
          id_operacion,
          nombre,
          tiempo_std,
          activa
        FROM dbo.planificacion_operaciones
        WHERE id_operacion = @id;
      `);

    if (!result.recordset.length) {
      return res.status(404).json({
        error: "Operación no encontrada",
      });
    }

    return res.json(result.recordset[0]);
  } catch (error) {
    console.error("updateOperacion:", error);

    return res.status(500).json({
      error: "Error al actualizar la operación",
      detalle: error.message,
    });
  }
};

exports.deleteOperacion = async (req, res) => {
  try {
    const id = Number(req.params.id);

    if (!Number.isInteger(id)) {
      return res.status(400).json({
        error: "ID de operación inválido",
      });
    }

    await poolConnect;
    const pool = await getPool();

    const result = await pool
      .request()
      .input("id", sql.Int, id)
      .query(`
        UPDATE dbo.planificacion_operaciones
        SET
          activa = 0,
          fecha_modificacion = SYSDATETIME()
        WHERE id_operacion = @id;

        SELECT @@ROWCOUNT AS affected;
      `);

    const affected = Number(
      result.recordset?.[0]?.affected || 0
    );

    if (!affected) {
      return res.status(404).json({
        error: "Operación no encontrada",
      });
    }

    return res.json({
      message: "Operación eliminada",
    });
  } catch (error) {
    console.error("deleteOperacion:", error);

    return res.status(500).json({
      error: "Error al eliminar la operación",
      detalle: error.message,
    });
  }
};

exports.getTiemposStdObra = async (req, res) => {
  try {
    const obraVersion = normalizarObraVersion(req.query?.obraVersion);
    const fase = Number(req.query?.fase);

    if (!obraVersion) {
      return res.status(400).json({
        error: "Debe indicar Obra/Versión",
      });
    }

    if (!Number.isInteger(fase)) {
      return res.status(400).json({
        error: "La fase debe ser un número entero",
      });
    }

    await poolConnect;
    const pool = await getPool();

    const result = await pool
      .request()
      .input("obra_version", sql.NVarChar(150), obraVersion)
      .input("fase", sql.Int, fase)
      .query(`
        SELECT
          teo.id_tiempo_std_obra,
          teo.obra_version,
          teo.fase,
          teo.id_operacion,
          op.nombre AS operacion,
          op.tiempo_std AS tiempo_std_base,
          teo.tiempo_std,
          teo.usuario_modificacion,
          teo.fecha_modificacion
        FROM dbo.planificacion_tiempos_std_obra teo
        INNER JOIN dbo.planificacion_operaciones op
          ON op.id_operacion = teo.id_operacion
        WHERE teo.obra_version = @obra_version
          AND teo.fase = @fase
        ORDER BY op.nombre;
      `);

    return res.json(result.recordset || []);
  } catch (error) {
    console.error("getTiemposStdObra:", error);

    return res.status(500).json({
      error: "Error al obtener tiempos STD específicos por obra",
      detalle: error.message,
    });
  }
};

exports.saveTiempoStdObra = async (req, res) => {
  try {
    const obraVersion = normalizarObraVersion(req.body?.obraVersion);
    const fase = Number(req.body?.fase);
    const idOperacion = Number(req.body?.id_operacion);
    const tiempoStd = numero(req.body?.tiempo_std);

    if (!obraVersion) {
      return res.status(400).json({
        error: "Debe indicar Obra/Versión",
      });
    }

    if (!Number.isInteger(fase)) {
      return res.status(400).json({
        error: "La fase debe ser un número entero",
      });
    }

    if (!Number.isInteger(idOperacion)) {
      return res.status(400).json({
        error: "Debe indicar una operación válida",
      });
    }

    if (tiempoStd === null || tiempoStd < 0) {
      return res.status(400).json({
        error: "Debe indicar un tiempo STD válido",
      });
    }

    await poolConnect;
    const pool = await getPool();

    const result = await pool
      .request()
      .input("obra_version", sql.NVarChar(150), obraVersion)
      .input("fase", sql.Int, fase)
      .input("id_operacion", sql.Int, idOperacion)
      .input("tiempo_std", sql.Decimal(18, 4), tiempoStd)
      .input("usuario", sql.NVarChar(150), usuarioAuditoria(req))
      .query(`
        DECLARE @tiempo_base DECIMAL(18,4);
        DECLARE @operacion NVARCHAR(150);

        SELECT
          @tiempo_base = tiempo_std,
          @operacion = nombre
        FROM dbo.planificacion_operaciones
        WHERE id_operacion = @id_operacion
          AND activa = 1;

        IF @operacion IS NULL
        BEGIN
          THROW 51000, 'La operación no existe o está inactiva', 1;
        END;

        IF ABS(@tiempo_std - ISNULL(@tiempo_base, 0)) < 0.0001
        BEGIN
          DELETE FROM dbo.planificacion_tiempos_std_obra
          WHERE obra_version = @obra_version
            AND fase = @fase
            AND id_operacion = @id_operacion;

          SELECT
            CAST(NULL AS INT) AS id_tiempo_std_obra,
            @obra_version AS obra_version,
            @fase AS fase,
            @id_operacion AS id_operacion,
            @operacion AS operacion,
            @tiempo_base AS tiempo_std_base,
            @tiempo_base AS tiempo_std,
            CAST(0 AS BIT) AS tiempo_std_especifico,
            @usuario AS usuario_modificacion,
            SYSDATETIME() AS fecha_modificacion;
        END
        ELSE
        BEGIN
          MERGE dbo.planificacion_tiempos_std_obra AS destino
          USING (
            SELECT
              @obra_version AS obra_version,
              @fase AS fase,
              @id_operacion AS id_operacion
          ) AS origen
          ON destino.obra_version = origen.obra_version
         AND destino.fase = origen.fase
         AND destino.id_operacion = origen.id_operacion
          WHEN MATCHED THEN
            UPDATE SET
              tiempo_std = @tiempo_std,
              usuario_modificacion = @usuario,
              fecha_modificacion = SYSDATETIME()
          WHEN NOT MATCHED THEN
            INSERT (
              obra_version,
              fase,
              id_operacion,
              tiempo_std,
              usuario_creacion,
              usuario_modificacion
            )
            VALUES (
              @obra_version,
              @fase,
              @id_operacion,
              @tiempo_std,
              @usuario,
              @usuario
            );

          SELECT
            teo.id_tiempo_std_obra,
            teo.obra_version,
            teo.fase,
            teo.id_operacion,
            op.nombre AS operacion,
            op.tiempo_std AS tiempo_std_base,
            teo.tiempo_std,
            CAST(1 AS BIT) AS tiempo_std_especifico,
            teo.usuario_modificacion,
            teo.fecha_modificacion
          FROM dbo.planificacion_tiempos_std_obra teo
          INNER JOIN dbo.planificacion_operaciones op
            ON op.id_operacion = teo.id_operacion
          WHERE teo.obra_version = @obra_version
            AND teo.fase = @fase
            AND teo.id_operacion = @id_operacion;
        END;
      `);

    return res.json(result.recordset[0]);
  } catch (error) {
    console.error("saveTiempoStdObra:", error);

    return res.status(500).json({
      error: "Error al guardar el tiempo STD específico por obra",
      detalle: error.message,
    });
  }
};

exports.getTiposArticulos = async (req, res) => {
  try {
    await poolConnect;
    const pool = await getPool();

    const result = await pool.request().query(`
      SELECT DISTINCT
        LTRIM(RTRIM(tipo)) AS tipo
      FROM dbo.articulos
      WHERE tipo IS NOT NULL
        AND LTRIM(RTRIM(tipo)) <> ''
      ORDER BY LTRIM(RTRIM(tipo));
    `);

    return res.json(
      (result.recordset || [])
        .map((fila) => fila.tipo)
        .filter(Boolean)
    );
  } catch (error) {
    console.error("getTiposArticulos:", error);

    return res.status(500).json({
      error: "Error al obtener tipos de artículos",
      detalle: error.message,
    });
  }
};

exports.getTiposMaterial = async (req, res) => {
  try {
    await poolConnect;
    const pool = await getPool();

    const result = await pool.request().query(`
      SELECT
        tm.id_tipo_material,
        tm.id_operacion,
        op.nombre AS operacion,
        tm.tipo
      FROM dbo.planificacion_tipos_material tm
      INNER JOIN dbo.planificacion_operaciones op
        ON op.id_operacion = tm.id_operacion
      WHERE op.activa = 1
      ORDER BY op.nombre, tm.tipo;
    `);

    return res.json(result.recordset || []);
  } catch (error) {
    console.error("getTiposMaterial:", error);

    return res.status(500).json({
      error: "Error al obtener tipos de material",
      detalle: error.message,
    });
  }
};

exports.saveTiposMaterial = async (req, res) => {
  let transaction;

  try {
    const filas = Array.isArray(req.body?.filas)
      ? req.body.filas
      : [];

    await poolConnect;
    const pool = await getPool();

    transaction = new sql.Transaction(pool);
    await transaction.begin();

    await new sql.Request(transaction).query(`
      DELETE FROM dbo.planificacion_tipos_material;
    `);

    for (const fila of filas) {
      const idOperacion = Number(fila.id_operacion);
      const tipo = texto(fila.tipo);

      if (!Number.isInteger(idOperacion) || !tipo) {
        throw new Error(
          "Todas las filas deben tener operación y tipo"
        );
      }

      await new sql.Request(transaction)
        .input("id_operacion", sql.Int, idOperacion)
        .input("tipo", sql.NVarChar(150), tipo)
        .query(`
          INSERT INTO dbo.planificacion_tipos_material (
            id_operacion,
            tipo
          )
          VALUES (
            @id_operacion,
            @tipo
          );
        `);
    }

    await transaction.commit();

    return res.json({
      message: "Tipos de material guardados",
    });
  } catch (error) {
    if (transaction) {
      try {
        await transaction.rollback();
      } catch {}
    }

    console.error("saveTiposMaterial:", error);

    return res.status(500).json({
      error: "Error al guardar tipos de material",
      detalle: error.message,
    });
  }
};

exports.getArticuloPorCodigo = async (req, res) => {
  try {
    const codigo = texto(req.params.codigo)?.toUpperCase();

    if (!codigo) {
      return res.status(400).json({
        error: "Debe indicar un código",
      });
    }

    await poolConnect;
    const pool = await getPool();

    const result = await pool
      .request()
      .input("codigo", sql.NVarChar(150), codigo)
      .query(`
        SELECT TOP 1
          id_articulo,
          codigo,
          descripcion,
          tipo
        FROM dbo.articulos
        WHERE UPPER(LTRIM(RTRIM(codigo))) = @codigo;
      `);

    if (!result.recordset.length) {
      return res.status(404).json({
        error: "Artículo no encontrado",
      });
    }

    return res.json(result.recordset[0]);
  } catch (error) {
    console.error("getArticuloPorCodigo:", error);

    return res.status(500).json({
      error: "Error al buscar el artículo",
      detalle: error.message,
    });
  }
};

exports.getMaterialesExcluir = async (req, res) => {
  try {
    await poolConnect;
    const pool = await getPool();

    const result = await pool.request().query(`
      SELECT
        me.id_material_excluir,
        me.id_operacion,
        op.nombre AS operacion,
        me.id_articulo,
        ar.codigo,
        ar.descripcion
      FROM dbo.planificacion_materiales_excluir me
      INNER JOIN dbo.planificacion_operaciones op
        ON op.id_operacion = me.id_operacion
      INNER JOIN dbo.articulos ar
        ON ar.id_articulo = me.id_articulo
      WHERE op.activa = 1
      ORDER BY op.nombre, ar.codigo;
    `);

    return res.json(result.recordset || []);
  } catch (error) {
    console.error("getMaterialesExcluir:", error);

    return res.status(500).json({
      error: "Error al obtener materiales excluidos",
      detalle: error.message,
    });
  }
};

exports.saveMaterialesExcluir = async (req, res) => {
  let transaction;

  try {
    const filas = Array.isArray(req.body?.filas)
      ? req.body.filas
      : [];

    await poolConnect;
    const pool = await getPool();

    transaction = new sql.Transaction(pool);
    await transaction.begin();

    await new sql.Request(transaction).query(`
      DELETE FROM dbo.planificacion_materiales_excluir;
    `);

    for (const fila of filas) {
      const idOperacion = Number(fila.id_operacion);
      const idArticulo = Number(fila.id_articulo);

      if (
        !Number.isInteger(idOperacion) ||
        !Number.isInteger(idArticulo)
      ) {
        throw new Error(
          "Todas las filas deben tener operación y artículo"
        );
      }

      await new sql.Request(transaction)
        .input("id_operacion", sql.Int, idOperacion)
        .input("id_articulo", sql.Int, idArticulo)
        .query(`
          INSERT INTO dbo.planificacion_materiales_excluir (
            id_operacion,
            id_articulo
          )
          VALUES (
            @id_operacion,
            @id_articulo
          );
        `);
    }

    await transaction.commit();

    return res.json({
      message: "Materiales excluidos guardados",
    });
  } catch (error) {
    if (transaction) {
      try {
        await transaction.rollback();
      } catch {}
    }

    console.error("saveMaterialesExcluir:", error);

    return res.status(500).json({
      error: "Error al guardar materiales excluidos",
      detalle: error.message,
    });
  }
};

const {
  sql: sqlHetmo,
  getHetmoPool,
} = require("../dbHetmo");

function normalizar(valor) {
  return String(valor ?? "")
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .toUpperCase();
}

function separarObraVersion(valor) {
  const entrada = String(valor ?? "").trim().replace(",", ".");
  const posicion = entrada.indexOf(".");

  if (posicion <= 0 || posicion === entrada.length - 1) {
    const error = new Error(
      "Obra/versión debe tener el formato OBRA.VERSION, por ejemplo 12345.2"
    );
    error.statusCode = 400;
    throw error;
  }

  const obraTexto = entrada.slice(0, posicion).trim();
  const versionTexto = entrada.slice(posicion + 1).trim();

  if (!obraTexto || !versionTexto) {
    const error = new Error(
      "Debe indicar obra y versión separadas por un punto"
    );
    error.statusCode = 400;
    throw error;
  }

  return {
    obraVersion: `${obraTexto}.${versionTexto}`,
    obraTexto,
    versionTexto,
  };
}

async function consultarMaterialesHetmo(obraTexto, versionTexto, fase) {
  const pool = await getHetmoPool();

  const resultado = await pool
    .request()
    .input("obra", sqlHetmo.VarChar(50), obraTexto)
    .input("version", sqlHetmo.VarChar(50), versionTexto)
    .input("fase", sqlHetmo.Int, fase)
    .query(`
      SET NOCOUNT ON;

      SELECT
        DOCUMENTOS_VENTA.NUMERO,
        DOCUMENTOS_VENTA.VERSION,
        DOCUMENTOS_VENTA.FASE,
        LTRIM(RTRIM(ALMACEN_TARIFA.REFERENCIA)) AS REFERENCIA,
        LTRIM(RTRIM(ALMACEN.DESCRIPCION)) AS DESCRIPCION,
        CONVERT(DECIMAL(18, 4), DOCUMENTOS_VENTA_RESUMEN_MATERIALES.UDS) AS UDS,
        DOCUMENTOS_VENTA_RESUMEN_MATERIALES.UDS_PEDIDO_MINIMO,
        C_ACABADOS.DESCRIPCION AS ACABADO,
        DOCUMENTOS_VENTA.CL_R_SOCIAL,
        DOCUMENTOS_VENTA.CL_DIRECCION,
        VTAS_PROVEEDORES.R_SOCIAL AS PROVEEDOR,
        DOCUMENTOS_VENTA.HETMO,
        DOCUMENTOS_VENTA_RESUMEN_MATERIALES.CODIGO_INTERNO,
        DOCUMENTOS_VENTA_RESUMEN_MATERIALES.UDS_EN_ALMACEN,
        DOCUMENTOS_VENTA_RESUMEN_MATERIALES.UDS_FALTAN
      FROM DOCUMENTOS_VENTA
      INNER JOIN DOCUMENTOS_VENTA_RESUMEN_MATERIALES
        ON DOCUMENTOS_VENTA.HETMO =
           DOCUMENTOS_VENTA_RESUMEN_MATERIALES.CODIGO_INTERNO
      INNER JOIN HT_TEXTOS_ESTADO_DOCUMENTOS
        ON DOCUMENTOS_VENTA.COD_PLANTILLA =
           HT_TEXTOS_ESTADO_DOCUMENTOS.COD_PLANTILLA
       AND DOCUMENTOS_VENTA.ESTADO_DOCUMENTO =
           HT_TEXTOS_ESTADO_DOCUMENTOS.ESTADO
      INNER JOIN ALMACEN
        ON DOCUMENTOS_VENTA_RESUMEN_MATERIALES.COD_ART =
           ALMACEN.CODIGO
      INNER JOIN C_ACABADOS
        ON DOCUMENTOS_VENTA_RESUMEN_MATERIALES.COD_COLOR =
           C_ACABADOS.CODIGO
      INNER JOIN ALMACEN_TARIFA
        ON DOCUMENTOS_VENTA_RESUMEN_MATERIALES.COD_ART =
           ALMACEN_TARIFA.CODIGO
       AND DOCUMENTOS_VENTA_RESUMEN_MATERIALES.COD_COLOR =
           ALMACEN_TARIFA.COD_COLOR
      INNER JOIN VTAS_PROVEEDORES
        ON ALMACEN.COD_PROVEE = VTAS_PROVEEDORES.CODIGO
      INNER JOIN HT_T_ARTICULO
        ON ALMACEN.COD_TIPO_INTERNO = HT_T_ARTICULO.CODIGO
      WHERE HT_T_ARTICULO.FILTRO_IDIOMA = 34
        AND CONVERT(VARCHAR(50), DOCUMENTOS_VENTA.NUMERO) = @obra
        AND CONVERT(VARCHAR(50), DOCUMENTOS_VENTA.VERSION) = @version
        AND DOCUMENTOS_VENTA.FASE = @fase
        AND VTAS_PROVEEDORES.R_SOCIAL = 'TECNOCOM PERFILES'
      ORDER BY ALMACEN_TARIFA.REFERENCIA;
    `);

  return resultado.recordset || [];
}

async function consultarMecanizadoHetmo(obraTexto, versionTexto, fase) {
  const pool = await getHetmoPool();

  const resultado = await pool
    .request()
    .input("obra", sqlHetmo.VarChar(50), obraTexto)
    .input("version", sqlHetmo.VarChar(50), versionTexto)
    .input("fase", sqlHetmo.Int, fase)
    .query(`
      SET NOCOUNT ON;

      SELECT
        CONVERT(
          DECIMAL(18, 4),
          DOCUMENTOS_FABRICACION_OPT_DEF_BARRA.RES_NUMERO_CORTES
        ) AS RES_NUMERO_CORTES,
        MAX(
          DOCUMENTOS_FABRICACION_OPT_BARRAS.NUMERO_BARRA_PARCIAL
        ) AS CANT_BARRAS,
        LTRIM(RTRIM(
          DOCUMENTOS_FABRICACION_OPT_CORTES.COD_ART
        )) AS COD_ART,
        LTRIM(RTRIM(ALMACEN.DESCRIPCION)) AS DESCRIPCION,
        LTRIM(RTRIM(C_ACABADOS.DESCRIPCION)) AS ACABADO
      FROM DOCUMENTOS_FABRICACION
      INNER JOIN DOCUMENTOS_FABRICACION_OPT_DEF_BARRA
        ON DOCUMENTOS_FABRICACION.HETMO =
           DOCUMENTOS_FABRICACION_OPT_DEF_BARRA.CODIGO_INTERNO
      INNER JOIN DOCUMENTOS_FABRICACION_OPT_BARRAS
        ON DOCUMENTOS_FABRICACION_OPT_DEF_BARRA.COD_ART =
           DOCUMENTOS_FABRICACION_OPT_BARRAS.COD_ART
       AND DOCUMENTOS_FABRICACION_OPT_DEF_BARRA.CODIGO_INTERNO =
           DOCUMENTOS_FABRICACION_OPT_BARRAS.CODIGO_INTERNO
       AND DOCUMENTOS_FABRICACION_OPT_DEF_BARRA.COD_COLOR =
           DOCUMENTOS_FABRICACION_OPT_BARRAS.COD_COLOR
      INNER JOIN C_ACABADOS
        ON DOCUMENTOS_FABRICACION_OPT_DEF_BARRA.COD_COLOR =
           C_ACABADOS.CODIGO
      INNER JOIN ALMACEN
        ON DOCUMENTOS_FABRICACION_OPT_DEF_BARRA.COD_ART =
           ALMACEN.CODIGO
      INNER JOIN DOCUMENTOS_FABRICACION_OPT_CORTES
        ON DOCUMENTOS_FABRICACION_OPT_BARRAS.COD_ART =
           DOCUMENTOS_FABRICACION_OPT_CORTES.COD_ART
       AND DOCUMENTOS_FABRICACION_OPT_BARRAS.COD_COLOR =
           DOCUMENTOS_FABRICACION_OPT_CORTES.COD_COLOR
       AND DOCUMENTOS_FABRICACION_OPT_BARRAS.NUMERO_BARRA_PARCIAL =
           DOCUMENTOS_FABRICACION_OPT_CORTES.CODIGO_BARRA
       AND DOCUMENTOS_FABRICACION_OPT_BARRAS.CODIGO_INTERNO =
           DOCUMENTOS_FABRICACION_OPT_CORTES.CODIGO_INTERNO
      WHERE CONVERT(
              VARCHAR(50),
              DOCUMENTOS_FABRICACION.FABRICACION_NUM_PRES
            ) = @obra
        AND CONVERT(
              VARCHAR(50),
              DOCUMENTOS_FABRICACION.FABRICACION_VS_PRES
            ) = @version
        AND DOCUMENTOS_FABRICACION.FABRICACION_FASE_PRES = @fase
        AND ALMACEN.COD_TIPO_INTERNO = 1
      GROUP BY
        DOCUMENTOS_FABRICACION_OPT_DEF_BARRA.RES_NUMERO_CORTES,
        DOCUMENTOS_FABRICACION_OPT_CORTES.COD_ART,
        ALMACEN.DESCRIPCION,
        C_ACABADOS.DESCRIPCION;
    `);

  return resultado.recordset || [];
}

async function obtenerConfiguracionCalculo(pool) {
  const [operacionesResult, tiposResult, articulosResult, exclusionesResult] =
    await Promise.all([
      pool.request().query(`
        SET NOCOUNT ON;

        SELECT
          id_operacion,
          nombre,
          tiempo_std
        FROM dbo.planificacion_operaciones
        WHERE activa = 1
        ORDER BY id_operacion;
      `),
      pool.request().query(`
        SET NOCOUNT ON;

        SELECT
          id_operacion,
          UPPER(LTRIM(RTRIM(tipo))) AS tipo
        FROM dbo.planificacion_tipos_material;
      `),
      pool.request().query(`
        SET NOCOUNT ON;

        SELECT
          id_articulo,
          UPPER(LTRIM(RTRIM(codigo))) AS codigo,
          LTRIM(RTRIM(descripcion)) AS descripcion,
          UPPER(LTRIM(RTRIM(tipo))) AS tipo
        FROM dbo.articulos
        WHERE
          (codigo IS NOT NULL AND LTRIM(RTRIM(codigo)) <> '')
          OR
          (descripcion IS NOT NULL AND LTRIM(RTRIM(descripcion)) <> '');
      `),
      pool.request().query(`
        SET NOCOUNT ON;

        SELECT
          me.id_operacion,
          me.id_articulo,
          UPPER(LTRIM(RTRIM(a.codigo))) AS codigo
        FROM dbo.planificacion_materiales_excluir me
        INNER JOIN dbo.articulos a
          ON a.id_articulo = me.id_articulo;
      `),
    ]);

  return {
    operaciones: operacionesResult.recordset || [],
    tiposMaterial: tiposResult.recordset || [],
    articulos: articulosResult.recordset || [],
    exclusiones: exclusionesResult.recordset || [],
  };
}

async function obtenerTiemposStdObra(pool, obraVersion, fase) {
  const result = await pool
    .request()
    .input("obra_version", sql.NVarChar(150), normalizarObraVersion(obraVersion))
    .input("fase", sql.Int, fase)
    .query(`
      SET NOCOUNT ON;

      SELECT
        id_operacion,
        tiempo_std
      FROM dbo.planificacion_tiempos_std_obra WITH (NOLOCK)
      WHERE obra_version = @obra_version
        AND fase = @fase;
    `);

  return new Map(
    (result.recordset || []).map((fila) => [
      Number(fila.id_operacion),
      Number(fila.tiempo_std) || 0,
    ])
  );
}

function calcularOperacionesDesdeMateriales(
  materialesHetmo,
  configuracion
) {
  const articuloPorCodigo = new Map();
  const articuloPorDescripcion = new Map();
  const operacionesPorTipo = new Map();
  const exclusiones = new Set();
  const cantidadesPorOperacion = new Map();
  const materiales = [];
  const materialesIgnorados = [];
  const materialesExcluidos = [];

  /*
    Se generan dos índices de artículos:
    1) por código
    2) por descripción

    La búsqueda se hace primero por código. Si no encuentra coincidencia,
    se intenta por descripción, igual que en la lógica del Excel.
  */
  for (const articulo of configuracion.articulos) {
    const codigo = normalizar(articulo.codigo);
    const descripcion = normalizar(articulo.descripcion);

    if (codigo && !articuloPorCodigo.has(codigo)) {
      articuloPorCodigo.set(codigo, articulo);
    }

    if (descripcion && !articuloPorDescripcion.has(descripcion)) {
      articuloPorDescripcion.set(descripcion, articulo);
    }
  }

  for (const relacion of configuracion.tiposMaterial) {
    const tipo = normalizar(relacion.tipo);
    const idOperacion = Number(relacion.id_operacion);

    if (!tipo || !Number.isInteger(idOperacion)) {
      continue;
    }

    if (!operacionesPorTipo.has(tipo)) {
      operacionesPorTipo.set(tipo, new Set());
    }

    operacionesPorTipo.get(tipo).add(idOperacion);
  }

  for (const exclusion of configuracion.exclusiones) {
    exclusiones.add(
      `${Number(exclusion.id_operacion)}|${normalizar(exclusion.codigo)}`
    );
  }

  for (const operacion of configuracion.operaciones) {
    cantidadesPorOperacion.set(Number(operacion.id_operacion), 0);
  }

  for (const fila of materialesHetmo) {
    const codigoHetmo = normalizar(fila.REFERENCIA);
    const descripcionHetmo = String(fila.DESCRIPCION ?? "").trim();
    const descripcionNormalizada = normalizar(descripcionHetmo);
    const cantidad = Number(fila.UDS) || 0;

    if (!codigoHetmo && !descripcionNormalizada) {
      materialesIgnorados.push({
        codigo: "",
        descripcion: descripcionHetmo,
        cantidad,
        motivo: "El material no tiene código ni descripción",
      });
      continue;
    }

    // Primero busca por código.
    let articulo = codigoHetmo
      ? articuloPorCodigo.get(codigoHetmo)
      : null;
    let encontradoPor = articulo ? "codigo" : "";

    // Si no encontró el código, busca por descripción.
    if (!articulo && descripcionNormalizada) {
      articulo = articuloPorDescripcion.get(descripcionNormalizada);

      if (articulo) {
        encontradoPor = "descripcion";
      }
    }

    if (!articulo) {
      materialesIgnorados.push({
        codigo: codigoHetmo,
        descripcion: descripcionHetmo,
        cantidad,
        motivo:
          "No se encontró el artículo por código ni por descripción en dbo.articulos",
      });
      continue;
    }

    const codigoArticulo = normalizar(articulo.codigo);
    const codigoMostrar = codigoHetmo || codigoArticulo;
    const descripcionMostrar =
      descripcionHetmo || String(articulo.descripcion ?? "").trim();
    const tipo = normalizar(articulo.tipo);

    if (!tipo) {
      materialesIgnorados.push({
        id_articulo: articulo.id_articulo,
        codigo: codigoMostrar,
        descripcion: descripcionMostrar,
        cantidad,
        encontradoPor,
        motivo: "El artículo no tiene tipo",
      });
      continue;
    }

    const idsOperaciones = operacionesPorTipo.get(tipo);

    if (!idsOperaciones || idsOperaciones.size === 0) {
      materiales.push({
        id_articulo: articulo.id_articulo,
        codigo: codigoMostrar,
        descripcion: descripcionMostrar,
        tipo,
        cantidad,
        encontradoPor,
        operaciones: [],
        excluido: false,
      });
      continue;
    }

    const operacionesAplicadas = [];

    for (const idOperacion of idsOperaciones) {
      /*
        Si la coincidencia fue por descripción, la REFERENCIA de HETMO puede
        no coincidir con el código guardado en dbo.articulos. Por eso se
        verifican ambos códigos contra la tabla de exclusiones.
      */
      const codigosParaExclusion = new Set(
        [codigoHetmo, codigoArticulo].filter(Boolean)
      );

      const estaExcluido = Array.from(codigosParaExclusion).some(
        (codigo) =>
          exclusiones.has(`${idOperacion}|${codigo}`)
      );

      const operacion = configuracion.operaciones.find(
        (item) => Number(item.id_operacion) === idOperacion
      );

      if (estaExcluido) {
        materialesExcluidos.push({
          id_operacion: idOperacion,
          operacion: operacion?.nombre || "",
          id_articulo: articulo.id_articulo,
          codigo: codigoMostrar,
          descripcion: descripcionMostrar,
          tipo,
          cantidad,
          encontradoPor,
        });
        continue;
      }

      cantidadesPorOperacion.set(
        idOperacion,
        (cantidadesPorOperacion.get(idOperacion) || 0) + cantidad
      );

      operacionesAplicadas.push({
        id_operacion: idOperacion,
        operacion: operacion?.nombre || "",
      });
    }

    materiales.push({
      id_articulo: articulo.id_articulo,
      codigo: codigoMostrar,
      descripcion: descripcionMostrar,
      tipo,
      cantidad,
      encontradoPor,
      operaciones: operacionesAplicadas,
      excluido:
        operacionesAplicadas.length === 0 &&
        idsOperaciones.size > 0,
    });
  }

  return {
    cantidadesPorOperacion,
    materiales,
    materialesIgnorados,
    materialesExcluidos,
    exclusiones,
    articuloPorCodigo,
    articuloPorDescripcion,
  };
}

function calcularMecanizado(
  filasMecanizado,
  idOperacionMecanizado,
  configuracion,
  exclusiones,
  articuloPorCodigo,
  articuloPorDescripcion
) {
  let cantidad = 0;
  const excluidos = [];
  const ignorados = [];
  const detalle = [];

  for (const fila of filasMecanizado) {
    const codigoHetmo = normalizar(fila.COD_ART);
    const descripcionHetmo = String(fila.DESCRIPCION ?? "").trim();
    const descripcionNormalizada = normalizar(descripcionHetmo);
    const cortes = Number(fila.RES_NUMERO_CORTES) || 0;

    /*
      Para MECANIZADO dbo.articulos NO es obligatorio.

      Se intenta encontrar el artículo para completar id/tipo y para respetar
      una eventual exclusión configurada, pero si no existe igualmente se
      cuentan los RES_NUMERO_CORTES devueltos por la consulta de fabricación.
    */
    let articulo = codigoHetmo
      ? articuloPorCodigo.get(codigoHetmo)
      : null;
    let encontradoPor = articulo ? "codigo" : "";

    if (!articulo && descripcionNormalizada) {
      articulo = articuloPorDescripcion.get(descripcionNormalizada);

      if (articulo) {
        encontradoPor = "descripcion";
      }
    }

    const codigoArticulo = normalizar(articulo?.codigo);
    const codigoMostrar = codigoHetmo || codigoArticulo;
    const descripcionMostrar =
      descripcionHetmo || String(articulo?.descripcion ?? "").trim();
    const tipoArticulo = normalizar(articulo?.tipo);

    /*
      Ya NO se excluyen automáticamente los materiales de tipo MOSQUITERO.
      Si la consulta de mecanizado los devuelve, se contabilizan.
    */

    const codigosParaExclusion = new Set(
      [codigoHetmo, codigoArticulo].filter(Boolean)
    );

    const estaExcluido = Array.from(codigosParaExclusion).some(
      (codigo) =>
        exclusiones.has(`${idOperacionMecanizado}|${codigo}`)
    );

    if (estaExcluido) {
      excluidos.push({
        id_operacion: idOperacionMecanizado,
        operacion: "MECANIZADO",
        id_articulo: articulo?.id_articulo ?? null,
        codigo: codigoMostrar,
        descripcion: descripcionMostrar,
        tipo: tipoArticulo,
        cantidad: cortes,
        encontradoPor: encontradoPor || "sin_dbo_articulos",
      });
      continue;
    }

    // Se cuentan los cortes aunque el artículo no exista en dbo.articulos.
    cantidad += cortes;

    detalle.push({
      id_articulo: articulo?.id_articulo ?? null,
      codigo: codigoMostrar,
      descripcion: descripcionMostrar,
      tipo: tipoArticulo,
      cantidad: cortes,
      encontradoPor: encontradoPor || "sin_dbo_articulos",
    });
  }

  return {
    cantidad,
    excluidos,
    ignorados,
    detalle,
  };
}

exports.calcularMaterialesObra = async (req, res) => {
  try {
    const { obraVersion, obraTexto, versionTexto } =
      separarObraVersion(req.body?.obraVersion);

    const fase = Number(req.body?.fase);

    if (!Number.isInteger(fase)) {
      return res.status(400).json({
        error: "La fase debe ser un número entero",
      });
    }

    await poolConnect;
    const pool = await getPool();

    const [
      materialesHetmo,
      filasMecanizado,
      configuracion,
    ] = await Promise.all([
      consultarMaterialesHetmo(obraTexto, versionTexto, fase),
      consultarMecanizadoHetmo(obraTexto, versionTexto, fase),
      obtenerConfiguracionCalculo(pool),
    ]);

    const tiemposStdObra = await obtenerTiemposStdObra(
      pool,
      obraVersion,
      fase
    );

    const calculoGeneral = calcularOperacionesDesdeMateriales(
      materialesHetmo,
      configuracion
    );

    const operacionMecanizado = configuracion.operaciones.find(
      (operacion) => normalizar(operacion.nombre) === "MECANIZADO"
    );

    let detalleMecanizado = [];
    let ignoradosMecanizado = [];
    let excluidosMecanizado = [];

    if (operacionMecanizado) {
      const idMecanizado = Number(operacionMecanizado.id_operacion);

      const mecanizado = calcularMecanizado(
        filasMecanizado,
        idMecanizado,
        configuracion,
        calculoGeneral.exclusiones,
        calculoGeneral.articuloPorCodigo,
        calculoGeneral.articuloPorDescripcion
      );

      calculoGeneral.cantidadesPorOperacion.set(
        idMecanizado,
        mecanizado.cantidad
      );

      detalleMecanizado = mecanizado.detalle;
      ignoradosMecanizado = mecanizado.ignorados;
      excluidosMecanizado = mecanizado.excluidos;
    }

    const operaciones = configuracion.operaciones
      .filter((operacion) =>
        OPERACIONES_CARGA_AUTOMATICA.has(
          normalizar(operacion.nombre)
        )
      )
      .map((operacion) => {
        const cantidad =
          calculoGeneral.cantidadesPorOperacion.get(
            Number(operacion.id_operacion)
          ) || 0;

        const tiempoStdBase = Number(operacion.tiempo_std) || 0;
        const tieneTiempoStdEspecifico = tiemposStdObra.has(
          Number(operacion.id_operacion)
        );
        const tiempoStd = tieneTiempoStdEspecifico
          ? tiemposStdObra.get(Number(operacion.id_operacion))
          : tiempoStdBase;

        return {
          id_operacion: Number(operacion.id_operacion),
          operacion: operacion.nombre,
          cantidad,
          tiempo_std: tiempoStd,
          tiempo_std_base: tiempoStdBase,
          tiempo_std_especifico: tieneTiempoStdEspecifico,
          total_horas:
            cantidad > 0 && tiempoStd > 0
              ? Number(
                  ((cantidad * tiempoStd) / 60).toFixed(4)
                )
              : 0,
        };
      });

    return res.json({
      obraVersion,
      obra: obraTexto,
      version: versionTexto,
      fase,
      operaciones,
      materiales: calculoGeneral.materiales,
      mecanizado: detalleMecanizado,
      materialesIgnorados: [
        ...calculoGeneral.materialesIgnorados,
        ...ignoradosMecanizado,
      ],
      materialesExcluidos: [
        ...calculoGeneral.materialesExcluidos,
        ...excluidosMecanizado,
      ],
      resumen: {
        filasMaterialesHetmo: materialesHetmo.length,
        filasMecanizadoHetmo: filasMecanizado.length,
        operacionesGeneradas: operaciones.length,
      },
    });
  } catch (error) {
    console.error("calcularMaterialesObra:", error);

    return res.status(error.statusCode || 500).json({
      error:
        error.statusCode === 400
          ? error.message
          : "Error al calcular materiales y operaciones",
      detalle: error.message,
    });
  }
};

// ============================================================
// PLANIFICACIÓN MENSUAL COMPARTIDA
// ============================================================

function mesPlanificacionValido(valor) {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(String(valor || "").trim());
}

exports.getPlanificacionCompartida = async (req, res) => {
  try {
    const mes = String(req.query?.mes || "").trim();

    if (!mesPlanificacionValido(mes)) {
      return res.status(400).json({
        error: "Debe indicar un mes válido con formato AAAA-MM",
      });
    }

    await poolConnect;
    const pool = await getPool();

    const result = await pool
      .request()
      .input("mes", sql.Char(7), mes)
      .query(`
        SELECT TOP 1
          mes,
          contenido_json,
          usuario_creacion,
          fecha_creacion,
          usuario_modificacion,
          fecha_modificacion
        FROM dbo.planificacion_produccion_mensual WITH (NOLOCK)
        WHERE mes = @mes;
      `);

    if (!result.recordset.length) {
      return res.json({
        existe: false,
        mes,
        obras: [],
        usuario_modificacion: null,
        fecha_modificacion: null,
      });
    }

    const fila = result.recordset[0];
    let contenido = {};

    try {
      contenido = JSON.parse(String(fila.contenido_json || "{}"));
    } catch {
      contenido = {};
    }

    return res.json({
      existe: true,
      mes: fila.mes,
      obras: Array.isArray(contenido?.obras) ? contenido.obras : [],
      usuario_creacion: fila.usuario_creacion || null,
      fecha_creacion: fila.fecha_creacion || null,
      usuario_modificacion: fila.usuario_modificacion || null,
      fecha_modificacion: fila.fecha_modificacion || null,
    });
  } catch (error) {
    console.error("getPlanificacionCompartida:", error);

    return res.status(500).json({
      error: "Error al obtener la planificación compartida",
      detalle: error.message,
    });
  }
};

exports.savePlanificacionCompartida = async (req, res) => {
  try {
    const mes = String(req.body?.mes || "").trim();
    const obras = Array.isArray(req.body?.obras) ? req.body.obras : null;

    if (!mesPlanificacionValido(mes)) {
      return res.status(400).json({
        error: "Debe indicar un mes válido con formato AAAA-MM",
      });
    }

    if (!obras) {
      return res.status(400).json({
        error: "La planificación debe contener un arreglo de filas",
      });
    }

    const contenidoJson = JSON.stringify({
      mes,
      obras,
    });

    const usuario = usuarioAuditoria(req);

    await poolConnect;
    const pool = await getPool();

    const result = await pool
      .request()
      .input("mes", sql.Char(7), mes)
      .input("contenido_json", sql.NVarChar(sql.MAX), contenidoJson)
      .input("usuario", sql.NVarChar(150), usuario)
      .query(`
        MERGE dbo.planificacion_produccion_mensual AS destino
        USING (
          SELECT @mes AS mes
        ) AS origen
          ON destino.mes = origen.mes
        WHEN MATCHED THEN
          UPDATE SET
            contenido_json = @contenido_json,
            usuario_modificacion = @usuario,
            fecha_modificacion = SYSDATETIME()
        WHEN NOT MATCHED THEN
          INSERT (
            mes,
            contenido_json,
            usuario_creacion,
            usuario_modificacion
          )
          VALUES (
            @mes,
            @contenido_json,
            @usuario,
            @usuario
          );

        SELECT
          mes,
          usuario_creacion,
          fecha_creacion,
          usuario_modificacion,
          fecha_modificacion
        FROM dbo.planificacion_produccion_mensual
        WHERE mes = @mes;
      `);

    return res.json({
      ok: true,
      message: `Planificación ${mes} guardada para todos los usuarios`,
      ...(result.recordset?.[0] || {}),
    });
  } catch (error) {
    console.error("savePlanificacionCompartida:", error);

    return res.status(500).json({
      error: "Error al guardar la planificación compartida",
      detalle: error.message,
    });
  }
};

