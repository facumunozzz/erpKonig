const { sql, poolConnect, getPool } = require("../db");

function texto(valor) {
  const resultado = String(valor ?? "").trim();
  return resultado || null;
}

function numero(valor) {
  const resultado = Number(valor);
  return Number.isFinite(resultado) ? resultado : null;
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
          descripcion,
          UPPER(LTRIM(RTRIM(tipo))) AS tipo
        FROM dbo.articulos
        WHERE codigo IS NOT NULL
          AND LTRIM(RTRIM(codigo)) <> '';
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

function calcularOperacionesDesdeMateriales(
  materialesHetmo,
  configuracion
) {
  const articuloPorCodigo = new Map();
  const operacionesPorTipo = new Map();
  const exclusiones = new Set();
  const cantidadesPorOperacion = new Map();
  const materiales = [];
  const materialesIgnorados = [];
  const materialesExcluidos = [];

  for (const articulo of configuracion.articulos) {
    const codigo = normalizar(articulo.codigo);

    if (codigo && !articuloPorCodigo.has(codigo)) {
      articuloPorCodigo.set(codigo, articulo);
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
    const codigo = normalizar(fila.REFERENCIA);
    const descripcion = String(fila.DESCRIPCION ?? "").trim();
    const cantidad = Number(fila.UDS) || 0;

    if (!codigo) {
      continue;
    }

    const articulo = articuloPorCodigo.get(codigo);

    if (!articulo) {
      materialesIgnorados.push({
        codigo,
        descripcion,
        cantidad,
        motivo: "El código no existe en artículos",
      });
      continue;
    }

    const tipo = normalizar(articulo.tipo);

    if (!tipo) {
      materialesIgnorados.push({
        codigo,
        descripcion,
        cantidad,
        motivo: "El artículo no tiene tipo",
      });
      continue;
    }

    const idsOperaciones = operacionesPorTipo.get(tipo);

    if (!idsOperaciones || idsOperaciones.size === 0) {
      materiales.push({
        id_articulo: articulo.id_articulo,
        codigo,
        descripcion,
        tipo,
        cantidad,
        operaciones: [],
        excluido: false,
      });
      continue;
    }

    const operacionesAplicadas = [];

    for (const idOperacion of idsOperaciones) {
      const claveExclusion = `${idOperacion}|${codigo}`;
      const operacion = configuracion.operaciones.find(
        (item) => Number(item.id_operacion) === idOperacion
      );

      if (exclusiones.has(claveExclusion)) {
        materialesExcluidos.push({
          id_operacion: idOperacion,
          operacion: operacion?.nombre || "",
          id_articulo: articulo.id_articulo,
          codigo,
          descripcion,
          tipo,
          cantidad,
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
      codigo,
      descripcion,
      tipo,
      cantidad,
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
  };
}

function calcularMecanizado(
  filasMecanizado,
  idOperacionMecanizado,
  configuracion,
  exclusiones,
  articuloPorCodigo
) {
  let cantidad = 0;
  const excluidos = [];
  const ignorados = [];
  const detalle = [];

  for (const fila of filasMecanizado) {
    const codigo = normalizar(fila.COD_ART);
    const descripcion = String(fila.DESCRIPCION ?? "").trim();
    const cortes = Number(fila.RES_NUMERO_CORTES) || 0;
    const articulo = articuloPorCodigo.get(codigo);

    if (!articulo) {
      ignorados.push({
        codigo,
        descripcion,
        cantidad: cortes,
        motivo: "El código de mecanizado no existe en artículos",
      });
      continue;
    }

    const tipoArticulo = normalizar(articulo.tipo);
    const claveExclusion = `${idOperacionMecanizado}|${codigo}`;

    // El Excel no incluye los cortes de perfiles de mosquitero dentro de
    // MECANIZADO. En la obra 12918.8 esos cortes sumaban 28, produciendo
    // 263 en la web contra 235 en el Excel.
    if (tipoArticulo === "MOSQUITERO") {
      excluidos.push({
        id_operacion: idOperacionMecanizado,
        operacion: "MECANIZADO",
        id_articulo: articulo.id_articulo,
        codigo,
        descripcion,
        tipo: tipoArticulo,
        cantidad: cortes,
        motivo: "Los perfiles de mosquitero no se mecanizan en esta operación",
      });
      continue;
    }

    if (exclusiones.has(claveExclusion)) {
      excluidos.push({
        id_operacion: idOperacionMecanizado,
        operacion: "MECANIZADO",
        id_articulo: articulo.id_articulo,
        codigo,
        descripcion,
        tipo: tipoArticulo,
        cantidad: cortes,
      });
      continue;
    }

    cantidad += cortes;

    detalle.push({
      id_articulo: articulo.id_articulo,
      codigo,
      descripcion,
      tipo: tipoArticulo,
      cantidad: cortes,
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
        calculoGeneral.articuloPorCodigo
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

        const tiempoStd = Number(operacion.tiempo_std) || 0;

        return {
          id_operacion: Number(operacion.id_operacion),
          operacion: operacion.nombre,
          cantidad,
          tiempo_std: tiempoStd,
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
