const { sql, poolConnect, getPool } = require("../db");
const XLSX = require("xlsx");

const {
  downloadByPath,
  uploadOverwriteByPath,
} = require("../services/dropbox");

// =========================================================
// CONFIGURACIÓN
// =========================================================

const SETTING_FILE_ID = "DROPBOX_RECORTES_FILE_ID";
const HOJA_PREFERIDA = "Hoja1";
const MOTIVO_AJUSTE = "CONSUMO RECORTES (DROPBOX)";
const USUARIO_SISTEMA = "sistema";

// Columnas del Excel, comenzando desde cero.
const COL_CODIGO = 0; // A
const COL_MEDIDA = 2; // C
const COL_STOCK = 3; // D
const COL_UBICACION = 5; // F
const COL_CONSUMIDO = 6; // G

// =========================================================
// HELPERS
// =========================================================

function limpiarTexto(value) {
  return String(value ?? "").trim();
}

function normalizarCodigo(value) {
  return limpiarTexto(value).toUpperCase();
}

function normalizarUbicacion(value) {
  return limpiarTexto(value).toUpperCase();
}

function normalizarMedida(value) {
  if (value === null || value === undefined) {
    return "";
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }

  return limpiarTexto(value);
}

function toNumber(value) {
  if (value === null || value === undefined || value === "") {
    return 0;
  }

  if (typeof value === "number") {
    return Number.isFinite(value) ? value : 0;
  }

  const texto = String(value)
    .trim()
    .replace(/\s/g, "")
    .replace(/\.(?=\d{3}(\D|$))/g, "")
    .replace(",", ".");

  const numero = Number(texto);

  return Number.isFinite(numero) ? numero : 0;
}

function crearCodigoRecorte(codigoBase, medida) {
  const codigo = normalizarCodigo(codigoBase);
  const medidaNormalizada = normalizarMedida(medida);

  if (!codigo || !medidaNormalizada) {
    return "";
  }

  return `${codigo}_${medidaNormalizada}`.toUpperCase();
}

async function getSetting(pool, clave) {
  const result = await pool.request().input("clave", sql.VarChar(255), clave)
    .query(`
      SELECT TOP 1 valor
      FROM dbo.app_settings
      WHERE clave = @clave;
    `);

  if (!result.recordset.length) {
    return null;
  }

  return limpiarTexto(result.recordset[0].valor);
}

async function getMotivoId(transaction) {
  const result = await new sql.Request(transaction).input(
    "nombre",
    sql.VarChar(255),
    MOTIVO_AJUSTE,
  ).query(`
      SELECT TOP 1 id_motivo
      FROM dbo.ajustes_motivos
      WITH (UPDLOCK, HOLDLOCK)
      WHERE activo = 1
        AND UPPER(LTRIM(RTRIM(nombre))) = UPPER(@nombre);
    `);

  if (result.recordset.length) {
    return Number(result.recordset[0].id_motivo);
  }

  const insertado = await new sql.Request(transaction).input(
    "nombre",
    sql.VarChar(255),
    MOTIVO_AJUSTE,
  ).query(`
      INSERT INTO dbo.ajustes_motivos
      (
        nombre,
        activo,
        tipo_movimiento
      )
      VALUES
      (
        @nombre,
        1,
        NULL
      );

      SELECT SCOPE_IDENTITY() AS id_motivo;
    `);

  return Number(insertado.recordset[0].id_motivo);
}

async function getProximoNumeroAjuste(transaction) {
  const result = await new sql.Request(transaction).query(`
    SELECT
      ISNULL(MAX(numero_ajuste), 0) + 1 AS numero
    FROM dbo.ajustes
    WITH (UPDLOCK, HOLDLOCK);
  `);

  return Number(result.recordset[0].numero);
}

async function existeColumnaDetalleUsuario(transaction) {
  const result = await new sql.Request(transaction).query(`
    SELECT TOP 1 1 AS existe
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = 'dbo'
      AND TABLE_NAME = 'ajustes_detalles'
      AND COLUMN_NAME = 'usuario';
  `);

  return result.recordset.length > 0;
}

async function insertarDetalleAjuste(
  transaction,
  { ajusteId, codigo, descripcion, cantidad, observacion },
) {
  const tieneUsuario = await existeColumnaDetalleUsuario(transaction);

  const request = new sql.Request(transaction)
    .input("ajusteId", sql.Int, ajusteId)
    .input("codigo", sql.VarChar(100), codigo)
    .input("descripcion", sql.VarChar(500), descripcion || "")
    .input("cantidad", sql.Decimal(18, 3), cantidad)
    .input("observacion", sql.VarChar(sql.MAX), observacion || null);

  if (tieneUsuario) {
    request.input("usuario", sql.VarChar(255), USUARIO_SISTEMA);

    await request.query(`
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

    return;
  }

  await request.query(`
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

async function buscarArticuloBase(transaction, codigoBase) {
  const result = await new sql.Request(transaction).input(
    "codigo",
    sql.VarChar(100),
    normalizarCodigo(codigoBase),
  ).query(`
      SELECT TOP 1
        id_articulo,
        codigo,
        descripcion
      FROM dbo.articulos
      WITH (UPDLOCK, HOLDLOCK)
      WHERE UPPER(LTRIM(RTRIM(codigo))) = @codigo;
    `);

  return result.recordset[0] || null;
}

async function buscarRecorte(transaction, codigoRecorte) {
  const result = await new sql.Request(transaction).input(
    "codigo",
    sql.VarChar(100),
    normalizarCodigo(codigoRecorte),
  ).query(`
      SELECT TOP 1
        id_recorte,
        codigo,
        descripcion,
        medida,
        activo
      FROM dbo.recortes
      WITH (UPDLOCK, HOLDLOCK)
      WHERE UPPER(LTRIM(RTRIM(codigo))) = @codigo;
    `);

  return result.recordset[0] || null;
}

async function buscarUbicacionRecorte(transaction, nombreUbicacion) {
  const ubicacionNormalizada =
    normalizarUbicacion(nombreUbicacion) || "GENERAL";

  let result = await new sql.Request(transaction).input(
    "nombre",
    sql.VarChar(150),
    ubicacionNormalizada,
  ).query(`
      SELECT TOP 1
        id_ubicacion_recorte,
        nombre
      FROM dbo.recortes_ubicaciones
      WITH (UPDLOCK, HOLDLOCK)
      WHERE activo = 1
        AND UPPER(LTRIM(RTRIM(nombre))) = @nombre;
    `);

  if (result.recordset.length) {
    return result.recordset[0];
  }

  /*
   * Si la ubicación indicada en Excel no existe,
   * no la creamos automáticamente.
   * Se intenta utilizar GENERAL.
   */
  result = await new sql.Request(transaction).query(`
    SELECT TOP 1
      id_ubicacion_recorte,
      nombre
    FROM dbo.recortes_ubicaciones
    WITH (UPDLOCK, HOLDLOCK)
    WHERE activo = 1
      AND UPPER(LTRIM(RTRIM(nombre))) = 'GENERAL';
  `);

  return result.recordset[0] || null;
}

async function crearRecorte(
  transaction,
  { codigoRecorte, codigoBase, medida, descripcion },
) {
  const result = await new sql.Request(transaction)
    .input("codigo", sql.VarChar(100), codigoRecorte)
    .input("descripcion", sql.VarChar(250), descripcion || codigoBase)
    .input("medida", sql.VarChar(100), medida).query(`
      INSERT INTO dbo.recortes
      (
        codigo,
        descripcion,
        medida,
        obra_version,
        activo
      )
      OUTPUT INSERTED.id_recorte
      VALUES
      (
        @codigo,
        @descripcion,
        @medida,
        '',
        1
      );
    `);

  return Number(result.recordset[0].id_recorte);
}

async function obtenerStockUbicacion(
  transaction,
  idRecorte,
  idUbicacionRecorte,
) {
  const result = await new sql.Request(transaction)
    .input("idRecorte", sql.Int, idRecorte)
    .input("idUbicacionRecorte", sql.Int, idUbicacionRecorte).query(`
      SELECT TOP 1
        id_stock_recorte,
        cantidad
      FROM dbo.stock_recortes
      WITH (UPDLOCK, HOLDLOCK)
      WHERE id_recorte = @idRecorte
        AND id_ubicacion_recorte = @idUbicacionRecorte;
    `);

  if (!result.recordset.length) {
    return {
      id_stock_recorte: null,
      cantidad: 0,
    };
  }

  return {
    id_stock_recorte: Number(result.recordset[0].id_stock_recorte),
    cantidad: Number(result.recordset[0].cantidad || 0),
  };
}

async function actualizarStockRecorte(
  transaction,
  { idRecorte, idUbicacionRecorte, ubicacion, delta },
) {
  const stockActual = await obtenerStockUbicacion(
    transaction,
    idRecorte,
    idUbicacionRecorte,
  );

  const nuevoStock = stockActual.cantidad + delta;

  if (nuevoStock < 0) {
    return {
      ok: false,
      stockAnterior: stockActual.cantidad,
      nuevoStock: stockActual.cantidad,
      motivo: "Stock insuficiente",
    };
  }

  if (stockActual.id_stock_recorte) {
    await new sql.Request(transaction)
      .input("idStockRecorte", sql.Int, stockActual.id_stock_recorte)
      .input("nuevoStock", sql.Decimal(18, 3), nuevoStock).query(`
        UPDATE dbo.stock_recortes
        SET
          cantidad = @nuevoStock,
          fecha_actualizacion = SYSDATETIME()
        WHERE id_stock_recorte = @idStockRecorte;
      `);
  } else {
    await new sql.Request(transaction)
      .input("idRecorte", sql.Int, idRecorte)
      .input("idUbicacionRecorte", sql.Int, idUbicacionRecorte)
      .input("ubicacion", sql.VarChar(150), ubicacion)
      .input("cantidad", sql.Decimal(18, 3), nuevoStock).query(`
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
          @idUbicacionRecorte,
          @ubicacion,
          @cantidad
        );
      `);
  }

  return {
    ok: true,
    stockAnterior: stockActual.cantidad,
    nuevoStock,
  };
}

async function insertarAlerta(
  transaction,
  { numeroAjuste, codigo, descripcion, cantidad, motivo },
) {
  /*
   * Reutilizamos la tabla que ya utiliza el modal
   * de revisiones de Dropbox.
   */
  await new sql.Request(transaction)
    .input("numeroMovimiento", sql.Int, numeroAjuste || null)
    .input("codigo", sql.VarChar(100), codigo || "SIN_CODIGO")
    .input("descripcion", sql.VarChar(500), descripcion || "")
    .input("cantidadRequerida", sql.Int, Math.trunc(Math.abs(cantidad || 0)))
    .input("cantidadAjustada", sql.Int, 0)
    .input("cantidadFaltante", sql.Int, Math.trunc(Math.abs(cantidad || 0)))
    .input("motivo", sql.NVarChar(sql.MAX), motivo).query(`
      INSERT INTO dbo.consumo_produccion_alertas
      (
        numero_movimiento,
        codigo,
        descripcion,
        cantidad_requerida,
        cantidad_ajustada,
        cantidad_faltante,
        motivo,
        leida
      )
      VALUES
      (
        @numeroMovimiento,
        @codigo,
        @descripcion,
        @cantidadRequerida,
        @cantidadAjustada,
        @cantidadFaltante,
        @motivo,
        0
      );
    `);
}

// =========================================================
// PROCESO PRINCIPAL
// =========================================================

async function runConsumoRecortesDropbox() {
  await poolConnect;

  const pool = await getPool();
  let transaction = null;

  try {
    const fileRef = await getSetting(pool, SETTING_FILE_ID);

    if (!fileRef) {
      throw new Error(`No existe o está vacío ${SETTING_FILE_ID}`);
    }

    const buffer = await downloadByPath(fileRef);

    const workbook = XLSX.read(buffer, {
      type: "buffer",
      cellDates: true,
    });

    const nombreHoja = workbook.SheetNames.includes(HOJA_PREFERIDA)
      ? HOJA_PREFERIDA
      : workbook.SheetNames[0];

    if (!nombreHoja) {
      throw new Error("El archivo Excel no tiene hojas disponibles");
    }

    const worksheet = workbook.Sheets[nombreHoja];

    const rows = XLSX.utils.sheet_to_json(worksheet, {
      header: 1,
      defval: "",
      raw: true,
    });

    if (rows.length <= 1) {
      return {
        ok: true,
        mensaje: "No hay filas para procesar",
        procesados: 0,
        alertas: 0,
      };
    }

    transaction = new sql.Transaction(pool);
    await transaction.begin();

    const motivoId = await getMotivoId(transaction);
    const numeroAjuste = await getProximoNumeroAjuste(transaction);

    const movimientos = [];
    const errores = [];

    for (let index = 1; index < rows.length; index += 1) {
      const row = rows[index];
      const numeroFila = index + 1;

      const codigoBase = normalizarCodigo(row[COL_CODIGO]);

      const medida = normalizarMedida(row[COL_MEDIDA]);

      const consumido = toNumber(row[COL_CONSUMIDO]);

      const ubicacionExcel =
        normalizarUbicacion(row[COL_UBICACION]) || "GENERAL";

      /*
       * Las filas sin consumo quedan sin modificar.
       */
      if (consumido === 0) {
        continue;
      }

      const codigoRecorte = crearCodigoRecorte(codigoBase, medida);

      if (!codigoBase || !medida || !codigoRecorte) {
        errores.push({
          fila: numeroFila,
          codigo: codigoRecorte || codigoBase,
          motivo: "Código o medida vacíos",
        });

        await insertarAlerta(transaction, {
          numeroAjuste,
          codigo: codigoRecorte || codigoBase,
          descripcion: "",
          cantidad: consumido,
          motivo:
            `Recortes Dropbox - fila ${numeroFila}: ` +
            "Código o medida vacíos",
        });

        continue;
      }

      let recorte = await buscarRecorte(transaction, codigoRecorte);

      /*
       * Si el recorte no existe, validamos primero
       * que exista el artículo base.
       */
      if (!recorte) {
        const articuloBase = await buscarArticuloBase(transaction, codigoBase);

        if (!articuloBase) {
          errores.push({
            fila: numeroFila,
            codigo: codigoRecorte,
            motivo: `No existe el artículo base ${codigoBase}`,
          });

          await insertarAlerta(transaction, {
            numeroAjuste,
            codigo: codigoRecorte,
            descripcion: "",
            cantidad: consumido,
            motivo:
              `Recortes Dropbox - fila ${numeroFila}: ` +
              `no existe el artículo base ${codigoBase}`,
          });

          continue;
        }

        const idRecorte = await crearRecorte(transaction, {
          codigoRecorte,
          codigoBase,
          medida,
          descripcion: articuloBase.descripcion || codigoBase,
        });

        recorte = {
          id_recorte: idRecorte,
          codigo: codigoRecorte,
          descripcion: articuloBase.descripcion || codigoBase,
          medida,
        };
      }

      const ubicacion = await buscarUbicacionRecorte(
        transaction,
        ubicacionExcel,
      );

      if (!ubicacion) {
        errores.push({
          fila: numeroFila,
          codigo: codigoRecorte,
          motivo: "No existe la ubicación indicada ni GENERAL",
        });

        await insertarAlerta(transaction, {
          numeroAjuste,
          codigo: codigoRecorte,
          descripcion: recorte.descripcion,
          cantidad: consumido,
          motivo:
            `Recortes Dropbox - fila ${numeroFila}: ` +
            `no existe ubicación ${ubicacionExcel} ni GENERAL`,
        });

        continue;
      }

      /*
       * Positivo consumido = egreso.
       * Negativo consumido = ingreso.
       */
      const delta = consumido * -1;

      const resultadoStock = await actualizarStockRecorte(transaction, {
        idRecorte: Number(recorte.id_recorte),
        idUbicacionRecorte: Number(ubicacion.id_ubicacion_recorte),
        ubicacion: limpiarTexto(ubicacion.nombre),
        delta,
      });

      if (!resultadoStock.ok) {
        errores.push({
          fila: numeroFila,
          codigo: codigoRecorte,
          motivo:
            `Stock insuficiente. Disponible: ` +
            resultadoStock.stockAnterior +
            `, solicitado: ${consumido}`,
        });

        await insertarAlerta(transaction, {
          numeroAjuste,
          codigo: codigoRecorte,
          descripcion: recorte.descripcion,
          cantidad: consumido,
          motivo:
            `Recortes Dropbox - fila ${numeroFila}: ` +
            `stock insuficiente. Disponible ` +
            resultadoStock.stockAnterior,
        });

        /*
         * No dejamos consumo en cero porque no fue procesado.
         */
        row[COL_STOCK] = resultadoStock.stockAnterior;

        continue;
      }

      /*
       * Actualiza el Excel:
       * D = nuevo stock.
       * G = consumo procesado en cero.
       */
      row[COL_STOCK] = resultadoStock.nuevoStock;

      row[COL_CONSUMIDO] = 0;

      movimientos.push({
        fila: numeroFila,
        codigo: codigoRecorte,
        descripcion: recorte.descripcion,
        ubicacion: limpiarTexto(ubicacion.nombre),
        consumido,
        delta,
        stockAnterior: resultadoStock.stockAnterior,
        stockNuevo: resultadoStock.nuevoStock,
      });
    }

    /*
     * Creamos un único ajuste con todos los movimientos
     * realizados durante esta ejecución.
     */
    if (movimientos.length || errores.length) {
      await new sql.Request(transaction)
        .input("numeroAjuste", sql.Int, numeroAjuste)
        .input("deposito", sql.VarChar(255), "Recortes")
        .input("motivoId", sql.Int, motivoId)
        .input("motivo", sql.VarChar(255), MOTIVO_AJUSTE)
        .input("usuario", sql.VarChar(255), USUARIO_SISTEMA)
        .input("remito", sql.VarChar(255), `DROPBOX-RECORTES-${numeroAjuste}`)
        .query(`
          INSERT INTO dbo.ajustes
          (
            numero_ajuste,
            deposito,
            motivo_id,
            motivo,
            remito_referencia,
            fecha,
            fecha_real,
            usuario
          )
          VALUES
          (
            @numeroAjuste,
            @deposito,
            @motivoId,
            @motivo,
            @remito,
            GETDATE(),
            CAST(GETDATE() AS DATE),
            @usuario
          );
        `);

      for (const movimiento of movimientos) {
        await insertarDetalleAjuste(transaction, {
          ajusteId: numeroAjuste,
          codigo: movimiento.codigo,
          descripcion: movimiento.descripcion,
          cantidad: movimiento.delta,
          observacion:
            `Dropbox recortes. Ubicación: ` +
            `${movimiento.ubicacion}. ` +
            `Stock anterior: ${movimiento.stockAnterior}. ` +
            `Stock nuevo: ${movimiento.stockNuevo}.`,
        });
      }

      /*
       * Los errores también aparecen dentro del ajuste,
       * con cantidad cero.
       */
      for (const error of errores) {
        await insertarDetalleAjuste(transaction, {
          ajusteId: numeroAjuste,
          codigo: error.codigo || "SIN_CODIGO",
          descripcion: "",
          cantidad: 0,
          observacion: `Fila ${error.fila}: ${error.motivo}`,
        });
      }
    }

    /*
     * Conservamos la hoja original y solamente
     * reemplazamos sus valores.
     */
    workbook.Sheets[nombreHoja] = XLSX.utils.aoa_to_sheet(rows);

    const outputBuffer = XLSX.write(workbook, {
      type: "buffer",
      bookType: "xlsx",
    });

    /*
     * Primero actualizamos Dropbox.
     * Si falla, se hace rollback de SQL.
     */
    await uploadOverwriteByPath(fileRef, outputBuffer);

    await transaction.commit();
    transaction = null;

    return {
      ok: true,
      archivo: fileRef,
      hoja: nombreHoja,
      numero_ajuste: movimientos.length || errores.length ? numeroAjuste : null,
      procesados: movimientos.length,
      alertas: errores.length,
      movimientos,
      errores,
    };
  } catch (error) {
    if (transaction) {
      try {
        await transaction.rollback();
      } catch (rollbackError) {
        console.error("Rollback consumo recortes:", rollbackError);
      }
    }

    throw error;
  }
}

// =========================================================
// ENDPOINT
// =========================================================

exports.consumirRecortesDropbox = async (_req, res) => {
  try {
    const resultado = await runConsumoRecortesDropbox();

    return res.json(resultado);
  } catch (error) {
    let dropboxError = error.response?.data || null;

    if (Buffer.isBuffer(dropboxError)) {
      try {
        dropboxError = JSON.parse(dropboxError.toString("utf8"));
      } catch {
        dropboxError = dropboxError.toString("utf8");
      }
    }

    console.error("dropboxRecortes.consumirRecortesDropbox:", error);

    return res.status(500).json({
      error: "Error procesando el stock de recortes desde Dropbox",
      detalle: error.message,
      dropbox: dropboxError,
    });
  }
};

exports._runConsumoRecortesDropbox = runConsumoRecortesDropbox;
