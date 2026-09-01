// backend/controllers/ajustes.js
const { sql, poolConnect, getPool } = require("../db");
const XLSX = require("xlsx");

const {
  downloadByPath,
  uploadOverwriteByPath,
} = require("../services/dropbox");

// ========================================================
// HELPERS
// ========================================================

const toDb = (value) =>
  value == null || String(value).trim() === "" ? null : String(value).trim();

const up = (value) => toDb(value)?.toUpperCase() ?? null;

const DEPOSITO_RECORTES_ID = -1;

function asInt(value) {
  const number = Number(value);

  return Number.isFinite(number) ? Math.trunc(number) : NaN;
}

function toNumber0(value) {
  if (value === null || value === undefined) {
    return 0;
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  const text = String(value).trim();

  if (!text) {
    return 0;
  }

  const cleaned = text
    .replace(/\s/g, "")
    .replace(/\.(?=\d{3}(\D|$))/g, "")
    .replace(/,(?=\d{3}(\D|$))/g, "")
    .replace(",", ".");

  const number = Number(cleaned);

  return Number.isFinite(number) ? number : 0;
}

function normalizarTipoMovimiento(value) {
  const text = String(value ?? "")
    .trim()
    .toUpperCase();

  if (text === "INGRESO" || text === "EGRESO") {
    return text;
  }

  return null;
}

const normalizarMotivoSistema = (value) =>
  String(value ?? "")
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase();

const MOTIVOS_SISTEMA = new Set([
  "CONSUMO PRODUCCION (DROPBOX)",
  "IMPORTACION EXCEL",
]);

const esMotivoSistema = (nombre) =>
  MOTIVOS_SISTEMA.has(normalizarMotivoSistema(nombre));

function getUsuarioReq(req) {
  return req.user?.username ?? req.user?.email ?? req.user?.name ?? null;
}

function normalizarFechaExcel(value) {
  if (
    value === null ||
    value === undefined ||
    String(value).trim() === ""
  ) {
    return null;
  }

  /*
   * Excel puede entregar la fecha como número serial
   * cuando la celda tiene formato General.
   */
  if (
    typeof value === "number" &&
    Number.isFinite(value)
  ) {
    const parsed = XLSX.SSF.parse_date_code(value);

    if (!parsed) {
      return null;
    }

    const year = parsed.y;
    const month = String(parsed.m).padStart(2, "0");
    const day = String(parsed.d).padStart(2, "0");

    return `${year}-${month}-${day}`;
  }

  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }

  const text = String(value).trim();

  /*
   * Formato DD/MM/AAAA.
   */
  const fechaArgentina = text.match(
    /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/,
  );

  if (fechaArgentina) {
    const day = fechaArgentina[1].padStart(2, "0");
    const month = fechaArgentina[2].padStart(2, "0");
    const year = fechaArgentina[3];

    return `${year}-${month}-${day}`;
  }

  /*
   * Formato AAAA-MM-DD.
   */
  const fechaIso = text.match(
    /^(\d{4})-(\d{1,2})-(\d{1,2})/,
  );

  if (fechaIso) {
    const year = fechaIso[1];
    const month = fechaIso[2].padStart(2, "0");
    const day = fechaIso[3].padStart(2, "0");

    return `${year}-${month}-${day}`;
  }

  const parsed = new Date(text);

  if (!Number.isNaN(parsed.getTime())) {
    return parsed.toISOString().slice(0, 10);
  }

  return null;
}

// ========================================================
// UBICACIÓN TÉCNICA DE STOCK
// ========================================================

async function resolveUbicacionId(transaction, { depositoId, ubicacionId }) {
  const deposito = asInt(depositoId);

  if (!Number.isFinite(deposito) || deposito <= 0) {
    throw new Error("Depósito inválido");
  }

  const ubicacion = ubicacionId == null ? NaN : asInt(ubicacionId);

  /*
   * Si el frontend envía una ubicación técnica,
   * se valida que pertenezca al depósito.
   */
  if (Number.isFinite(ubicacion) && ubicacion > 0) {
    const result = await new sql.Request(transaction)
      .input("depositoId", sql.Int, deposito)
      .input("ubicacionId", sql.Int, ubicacion).query(`
        SELECT id_ubicacion
        FROM dbo.ubicaciones
        WHERE id_deposito = @depositoId
          AND id_ubicacion = @ubicacionId;
      `);

    if (!result.recordset.length) {
      throw new Error(
        `Ubicación inválida (${ubicacion}) para el depósito ${deposito}`,
      );
    }

    return ubicacion;
  }

  /*
   * Si no se envía ubicación técnica,
   * busca primero GENERAL.
   */
  const general = await new sql.Request(transaction).input(
    "depositoId",
    sql.Int,
    deposito,
  ).query(`
      SELECT TOP 1 id_ubicacion
      FROM dbo.ubicaciones
      WHERE id_deposito = @depositoId
        AND activa = 1
        AND UPPER(LTRIM(RTRIM(nombre))) = 'GENERAL'
      ORDER BY id_ubicacion;
    `);

  if (general.recordset.length) {
    return Number(general.recordset[0].id_ubicacion);
  }

  /*
   * Si no existe GENERAL, usa la primera activa.
   */
  const primera = await new sql.Request(transaction).input(
    "depositoId",
    sql.Int,
    deposito,
  ).query(`
      SELECT TOP 1 id_ubicacion
      FROM dbo.ubicaciones
      WHERE id_deposito = @depositoId
        AND activa = 1
      ORDER BY id_ubicacion;
    `);

  if (primera.recordset.length) {
    return Number(primera.recordset[0].id_ubicacion);
  }

  throw new Error(
    `El depósito ${deposito} no tiene ubicaciones activas. Creá una ubicación GENERAL.`,
  );
}

// ========================================================
// STOCK
// ========================================================

async function getStockActual(
  transaction,
  { depositoId, articuloId, ubicacionId = null },
) {
  const result = await new sql.Request(transaction)
    .input("depositoId", sql.Int, depositoId)
    .input("articuloId", sql.Int, articuloId)
    .input("ubicacionId", sql.Int, ubicacionId).query(`
      SELECT
        ISNULL(SUM(cantidad), 0) AS cantidad
      FROM dbo.stock WITH (UPDLOCK, HOLDLOCK)
      WHERE id_deposito = @depositoId
        AND id_articulo = @articuloId
        AND (
          @ubicacionId IS NULL
          OR id_ubicacion = @ubicacionId
        );
    `);

  return Number(result.recordset?.[0]?.cantidad || 0);
}

async function upsertStockDelta(
  transaction,
  { depositoId, articuloId, ubicacionId, delta },
) {
  await new sql.Request(transaction)
    .input("depositoId", sql.Int, depositoId)
    .input("articuloId", sql.Int, articuloId)
    .input("ubicacionId", sql.Int, ubicacionId)
    .input("delta", sql.Decimal(18, 2), Number(delta))
    .query(`
      MERGE dbo.stock WITH (HOLDLOCK) AS destino

      USING (
        SELECT
          @depositoId AS id_deposito,
          @articuloId AS id_articulo,
          @ubicacionId AS id_ubicacion
      ) AS origen

      ON (
        destino.id_deposito = origen.id_deposito
        AND destino.id_articulo = origen.id_articulo
        AND destino.id_ubicacion = origen.id_ubicacion
      )

      WHEN MATCHED THEN
        UPDATE SET
          cantidad = destino.cantidad + @delta

      WHEN NOT MATCHED THEN
        INSERT
        (
          id_deposito,
          id_articulo,
          id_ubicacion,
          cantidad
        )
        VALUES
        (
          origen.id_deposito,
          origen.id_articulo,
          origen.id_ubicacion,
          @delta
        );
    `);
}

async function tryDescontarStock(
  transaction,
  { depositoId, articuloId, ubicacionId, deltaNegativo },
) {
  const result = await new sql.Request(transaction)
    .input("depositoId", sql.Int, depositoId)
    .input("articuloId", sql.Int, articuloId)
    .input("ubicacionId", sql.Int, ubicacionId)
    .input("delta", sql.Decimal(18, 2), Number(deltaNegativo))
    .query(`
      UPDATE dbo.stock
      SET cantidad = cantidad + @delta
      WHERE id_deposito = @depositoId
        AND id_articulo = @articuloId
        AND id_ubicacion = @ubicacionId
        AND cantidad + @delta >= 0;

      SELECT @@ROWCOUNT AS affected;
    `);

  return Number(result.recordset?.[0]?.affected || 0) === 1;
}

// ========================================================
// DETALLES DE AJUSTE
// ========================================================

async function detallesTieneUsuario(transaction) {
  const result = await new sql.Request(transaction).query(`
      SELECT TOP 1 1 AS existe
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = 'dbo'
        AND TABLE_NAME = 'ajustes_detalles'
        AND COLUMN_NAME = 'usuario';
    `);

  return result.recordset.length > 0;
}

async function insertDetalle(
  transaction,
  {
    ajusteId,
    cod,
    desc,
    cantidad,
    usuario,
    cantidadRequerida = null,
    cantidadFaltante = null,
    observacion = null,
  },
) {
  const conUsuario = await detallesTieneUsuario(transaction);

  const request = new sql.Request(transaction)
    .input("ajusteId", sql.Int, ajusteId)
    .input("codigo", sql.VarChar(100), cod)
    .input("descripcion", sql.VarChar(500), desc || "")
    .input("cantidad", sql.Int, cantidad)
    .input("cantidadRequerida", sql.Int, cantidadRequerida)
    .input("cantidadFaltante", sql.Int, cantidadFaltante)
    .input("observacion", sql.VarChar(sql.MAX), observacion);

  if (conUsuario) {
    request.input("usuario", sql.VarChar(255), usuario ?? null);
  }

  if (conUsuario) {
    await request.query(`
      INSERT INTO dbo.ajustes_detalles
      (
        ajuste_id,
        cod_articulo,
        descripcion,
        cantidad,
        usuario,
        cantidad_requerida,
        cantidad_faltante,
        observacion
      )
      VALUES
      (
        @ajusteId,
        @codigo,
        @descripcion,
        @cantidad,
        @usuario,
        @cantidadRequerida,
        @cantidadFaltante,
        @observacion
      );
    `);
  } else {
    await request.query(`
      INSERT INTO dbo.ajustes_detalles
      (
        ajuste_id,
        cod_articulo,
        descripcion,
        cantidad,
        cantidad_requerida,
        cantidad_faltante,
        observacion
      )
      VALUES
      (
        @ajusteId,
        @codigo,
        @descripcion,
        @cantidad,
        @cantidadRequerida,
        @cantidadFaltante,
        @observacion
      );
    `);
  }
}

// ========================================================
// MOTIVOS AUXILIARES
// ========================================================

async function requireMotivoActivo(transaction, motivoId) {
  const result = await new sql.Request(transaction).input(
    "motivoId",
    sql.Int,
    motivoId,
  ).query(`
      SELECT
        id_motivo,
        nombre,
        activo,
        tipo_movimiento
      FROM dbo.ajustes_motivos
      WITH (UPDLOCK, HOLDLOCK)
      WHERE id_motivo = @motivoId;
    `);

  if (!result.recordset.length) {
    throw new Error("Motivo inválido");
  }

  if (!result.recordset[0].activo) {
    throw new Error("Motivo inactivo");
  }

  return {
    id_motivo: Number(result.recordset[0].id_motivo),
    nombre: String(result.recordset[0].nombre || ""),
    tipo_movimiento: result.recordset[0].tipo_movimiento || null,
  };
}

async function getMotivoIdByNombreActivo(transaction, nombre) {
  const nombreNormalizado = normalizarMotivoSistema(nombre);

  const result = await new sql.Request(transaction).input(
    "nombre",
    sql.VarChar(255),
    nombreNormalizado,
  ).query(`
      SELECT TOP 1 id_motivo
      FROM dbo.ajustes_motivos
      WITH (UPDLOCK, HOLDLOCK)
      WHERE
        UPPER(
          REPLACE(
            REPLACE(
              REPLACE(
                REPLACE(
                  LTRIM(RTRIM(nombre)),
                  N'Ó',
                  N'O'
                ),
                N'Í',
                N'I'
              ),
              N'Á',
              N'A'
            ),
            N'É',
            N'E'
          )
        ) = @nombre
        AND activo = 1
      ORDER BY id_motivo;
    `);

  if (!result.recordset.length) {
    return null;
  }

  return Number(result.recordset[0].id_motivo);
}

// ========================================================
// MOTIVOS ABM
// ========================================================

exports.getMotivos = async (_req, res) => {
  try {
    await poolConnect;
    const pool = await getPool();

    const result = await pool.request().query(`
      SELECT
        id_motivo,
        nombre,
        activo,
        tipo_movimiento
      FROM dbo.ajustes_motivos
      WHERE UPPER(LTRIM(RTRIM(nombre))) NOT IN
      (
        N'CONSUMO PRODUCCIÓN (DROPBOX)',
        N'CONSUMO PRODUCCION (DROPBOX)',
        N'IMPORTACIÓN EXCEL',
        N'IMPORTACION EXCEL'
      )
      ORDER BY
        activo DESC,
        nombre ASC;
    `);

    return res.json(result.recordset || []);
  } catch (err) {
    console.error("ajustes.getMotivos:", err);

    return res.status(500).json({
      error: "Error al listar motivos",
      detalle: err.message,
    });
  }
};

exports.createMotivo = async (req, res) => {
  try {
    const nombre = String(req.body?.nombre ?? "").trim();

    const tipoMovimiento = normalizarTipoMovimiento(req.body?.tipo_movimiento);

    if (!nombre) {
      return res.status(400).json({
        error: "Nombre obligatorio",
      });
    }

    if (esMotivoSistema(nombre)) {
      return res.status(400).json({
        error: "Ese nombre está reservado para procesos internos del sistema.",
      });
    }

    await poolConnect;
    const pool = await getPool();

    const result = await pool
      .request()
      .input("nombre", sql.VarChar(150), nombre)
      .input("tipoMovimiento", sql.VarChar(10), tipoMovimiento).query(`
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
          @tipoMovimiento
        );

        SELECT SCOPE_IDENTITY() AS id_motivo;
      `);

    return res.status(201).json({
      ok: true,
      id_motivo: Number(result.recordset[0].id_motivo),
    });
  } catch (err) {
    if (
      String(err.message || "")
        .toLowerCase()
        .includes("unique")
    ) {
      return res.status(400).json({
        error: "Ya existe un motivo con ese nombre",
      });
    }

    console.error("ajustes.createMotivo:", err);

    return res.status(500).json({
      error: "Error al crear motivo",
      detalle: err.message,
    });
  }
};

exports.updateMotivo = async (req, res) => {
  try {
    const id = asInt(req.params.id);

    if (!Number.isFinite(id) || id <= 0) {
      return res.status(400).json({
        error: "ID inválido",
      });
    }

    const vieneNombre = Object.prototype.hasOwnProperty.call(
      req.body || {},
      "nombre",
    );

    const vieneActivo = Object.prototype.hasOwnProperty.call(
      req.body || {},
      "activo",
    );

    const vieneTipoMovimiento = Object.prototype.hasOwnProperty.call(
      req.body || {},
      "tipo_movimiento",
    );

    if (!vieneNombre && !vieneActivo && !vieneTipoMovimiento) {
      return res.status(400).json({
        error: "Debe enviar al menos nombre, activo o tipo de movimiento",
      });
    }

    const nombre = vieneNombre ? String(req.body.nombre || "").trim() : null;

    if (vieneNombre && !nombre) {
      return res.status(400).json({
        error: "Nombre inválido",
      });
    }

    if (vieneNombre && esMotivoSistema(nombre)) {
      return res.status(400).json({
        error: "Ese nombre está reservado para procesos internos del sistema.",
      });
    }

    const activo = vieneActivo ? (req.body.activo ? 1 : 0) : null;

    const tipoMovimiento = vieneTipoMovimiento
      ? normalizarTipoMovimiento(req.body?.tipo_movimiento)
      : null;

    await poolConnect;
    const pool = await getPool();

    const actual = await pool.request().input("id", sql.Int, id).query(`
        SELECT
          id_motivo,
          nombre,
          activo,
          tipo_movimiento
        FROM dbo.ajustes_motivos
        WHERE id_motivo = @id;
      `);

    if (!actual.recordset.length) {
      return res.status(404).json({
        error: "Motivo no encontrado",
      });
    }

    if (esMotivoSistema(actual.recordset[0].nombre)) {
      return res.status(403).json({
        error:
          "Este motivo es interno del sistema y no puede editarse ni desactivarse.",
      });
    }

    const result = await pool
      .request()
      .input("id", sql.Int, id)
      .input("nombre", sql.VarChar(150), nombre)
      .input("activo", sql.Bit, activo)
      .input("tipoMovimiento", sql.VarChar(10), tipoMovimiento)
      .input("vieneTipo", sql.Bit, vieneTipoMovimiento ? 1 : 0).query(`
        UPDATE dbo.ajustes_motivos
        SET
          nombre =
            CASE
              WHEN @nombre IS NULL
                THEN nombre
              ELSE @nombre
            END,

          activo =
            CASE
              WHEN @activo IS NULL
                THEN activo
              ELSE @activo
            END,

          tipo_movimiento =
            CASE
              WHEN @vieneTipo = 0
                THEN tipo_movimiento
              ELSE @tipoMovimiento
            END

        WHERE id_motivo = @id;

        SELECT @@ROWCOUNT AS affected;
      `);

    if (Number(result.recordset[0].affected) !== 1) {
      return res.status(404).json({
        error: "Motivo no encontrado",
      });
    }

    return res.json({ ok: true });
  } catch (err) {
    if (
      String(err.message || "")
        .toLowerCase()
        .includes("unique")
    ) {
      return res.status(400).json({
        error: "Ya existe un motivo con ese nombre",
      });
    }

    console.error("ajustes.updateMotivo:", err);

    return res.status(500).json({
      error: "Error al actualizar motivo",
      detalle: err.message,
    });
  }
};

exports.deleteMotivo = async (req, res) => {
  try {
    const id = asInt(req.params.id);

    if (!Number.isFinite(id) || id <= 0) {
      return res.status(400).json({
        error: "ID inválido",
      });
    }

    await poolConnect;
    const pool = await getPool();

    const actual = await pool.request().input("id", sql.Int, id).query(`
        SELECT
          id_motivo,
          nombre,
          activo
        FROM dbo.ajustes_motivos
        WHERE id_motivo = @id;
      `);

    if (!actual.recordset.length) {
      return res.status(404).json({
        error: "Motivo no encontrado",
      });
    }

    if (esMotivoSistema(actual.recordset[0].nombre)) {
      return res.status(403).json({
        error: "Este motivo es interno del sistema y no puede eliminarse.",
      });
    }

    const used = await pool.request().input("id", sql.Int, id).query(`
        SELECT TOP 1 1 AS used
        FROM dbo.ajustes
        WHERE motivo_id = @id;
      `);

    if (used.recordset.length) {
      return res.status(400).json({
        error:
          "No se puede borrar porque el motivo ya fue utilizado. Desactivalo.",
      });
    }

    const result = await pool.request().input("id", sql.Int, id).query(`
        DELETE FROM dbo.ajustes_motivos
        WHERE id_motivo = @id;

        SELECT @@ROWCOUNT AS affected;
      `);

    if (Number(result.recordset[0].affected) !== 1) {
      return res.status(404).json({
        error: "Motivo no encontrado",
      });
    }

    return res.json({ ok: true });
  } catch (err) {
    console.error("ajustes.deleteMotivo:", err);

    return res.status(500).json({
      error: "Error al borrar motivo",
      detalle: err.message,
    });
  }
};

// LISTADO DE AJUSTES Y BORRADORES
exports.getAll = async (req, res) => {
  try {
    await poolConnect;
    const pool = await getPool();

    /*
     * Por defecto no se muestran los consumos internos de Dropbox.
     *
     * El frontend puede pedirlos enviando:
     *
     * GET /ajustes?incluirDropbox=1
     */
    const incluirDropbox =
      String(req.query?.incluirDropbox || "") === "1";

    const result = await pool
      .request()
      .input("incluirDropbox", sql.Bit, incluirDropbox ? 1 : 0)
      .query(`
        SELECT
          CAST(a.numero_ajuste AS VARCHAR(50)) AS id,
          a.numero_ajuste,
          CAST(NULL AS INT) AS id_borrador,
          CAST(
            CASE
              WHEN EXISTS
              (
                SELECT 1
                FROM dbo.consumo_produccion_alertas alerta
                WHERE alerta.numero_movimiento = a.numero_ajuste
                  AND alerta.leida = 0
              )
                THEN 'REVISAR'
              ELSE 'CONFIRMADO'
            END
            AS VARCHAR(20)
          ) AS estado,
          a.deposito,
          a.obra,
          a.version,
          CASE
            WHEN m.nombre IS NULL
              THEN a.motivo
            WHEN EXISTS
            (
              SELECT 1
              FROM dbo.ajustes_detalles ad_ingreso
              WHERE ad_ingreso.ajuste_id = a.numero_ajuste
                AND ad_ingreso.cantidad > 0
            )
            AND NOT EXISTS
            (
              SELECT 1
              FROM dbo.ajustes_detalles ad_egreso
              WHERE ad_egreso.ajuste_id = a.numero_ajuste
                AND ad_egreso.cantidad < 0
            )
              THEN CONCAT(m.nombre, ' (Ingreso)')

            WHEN EXISTS
            (
              SELECT 1
              FROM dbo.ajustes_detalles ad_egreso
              WHERE ad_egreso.ajuste_id = a.numero_ajuste
                AND ad_egreso.cantidad < 0
            )
            AND NOT EXISTS
            (
              SELECT 1
              FROM dbo.ajustes_detalles ad_ingreso
              WHERE ad_ingreso.ajuste_id = a.numero_ajuste
                AND ad_ingreso.cantidad > 0
            )
              THEN CONCAT(m.nombre, ' (Egreso)')

            WHEN m.tipo_movimiento = 'INGRESO'
              THEN CONCAT(m.nombre, ' (Ingreso)')

            WHEN m.tipo_movimiento = 'EGRESO'
              THEN CONCAT(m.nombre, ' (Egreso)')

            ELSE m.nombre
          END AS motivo,

          a.fecha,
          a.fecha_real,
          a.remito_referencia,
          a.id_referente,

          r.nombre AS referente,

          CAST(
            CASE
              WHEN UPPER(
                REPLACE(
                  LTRIM(RTRIM(ISNULL(a.motivo, ''))),
                  N'Ó',
                  N'O'
                )
              ) LIKE N'CONSUMO PRODUCCION (DROPBOX)%'
                THEN 1
              ELSE 0
            END
            AS BIT
          ) AS es_consumo_dropbox

        FROM dbo.ajustes a

        LEFT JOIN dbo.ajustes_motivos m
          ON m.id_motivo = a.motivo_id

        LEFT JOIN dbo.referentes r
          ON r.id_referente = a.id_referente

        WHERE
          @incluirDropbox = 1

          OR UPPER(
            REPLACE(
              LTRIM(RTRIM(ISNULL(a.motivo, ''))),
              N'Ó',
              N'O'
            )
          ) NOT LIKE N'CONSUMO PRODUCCION (DROPBOX)%'

        UNION ALL

        SELECT
          CONCAT('BORRADOR-', b.id_borrador) AS id,

          CAST(NULL AS INT) AS numero_ajuste,

          b.id_borrador,

          CAST('BORRADOR' AS VARCHAR(20)) AS estado,

          b.deposito,
          b.obra,
          b.version,
          b.motivo,

          b.fecha_creacion AS fecha,
          b.fecha_real,
          b.remito_referencia,
          b.id_referente,

          r.nombre AS referente,

          CAST(0 AS BIT) AS es_consumo_dropbox

        FROM dbo.ajustes_borradores b

        LEFT JOIN dbo.referentes r
          ON r.id_referente = b.id_referente

        ORDER BY fecha DESC;
      `);

    return res.json(result.recordset || []);
  } catch (err) {
    console.error("ajustes.getAll:", err);

    return res.status(500).json({
      error: "Error al listar ajustes",
      detalle: err.message,
    });
  }
};


// OBTENER AJUSTE CONFIRMADO
exports.getById = async (req, res) => {
  try {
    const numero = asInt(req.params.id);

    if (!Number.isFinite(numero) || numero <= 0) {
      return res.status(400).json({
        error: "Número inválido",
      });
    }

    await poolConnect;
    const pool = await getPool();

    const cabecera = await pool.request().input("numero", sql.Int, numero)
      .query(`
        SELECT
          a.numero_ajuste AS id,
          a.numero_ajuste,
          CAST(
            CASE
              WHEN EXISTS
              (
                SELECT 1
                FROM dbo.consumo_produccion_alertas alerta
                WHERE alerta.numero_movimiento = a.numero_ajuste
                  AND alerta.leida = 0
              )
                THEN 'REVISAR'

              ELSE 'CONFIRMADO'
            END
            AS VARCHAR(20)
          ) AS estado,
          a.deposito,
          a.obra,
          a.version,
          a.motivo_id,
          CASE
            WHEN m.nombre IS NULL
              THEN NULL

            WHEN m.tipo_movimiento = 'INGRESO'
              THEN CONCAT(m.nombre, ' (Ingreso)')

            WHEN m.tipo_movimiento = 'EGRESO'
              THEN CONCAT(m.nombre, ' (Egreso)')

            WHEN EXISTS
            (
              SELECT 1
              FROM dbo.ajustes_detalles ad_tipo
              WHERE ad_tipo.ajuste_id = a.numero_ajuste
                AND ad_tipo.cantidad > 0
            )
            AND NOT EXISTS
            (
              SELECT 1
              FROM dbo.ajustes_detalles ad_tipo
              WHERE ad_tipo.ajuste_id = a.numero_ajuste
                AND ad_tipo.cantidad < 0
            )
              THEN CONCAT(m.nombre, ' (Ingreso)')

            WHEN EXISTS
            (
              SELECT 1
              FROM dbo.ajustes_detalles ad_tipo
              WHERE ad_tipo.ajuste_id = a.numero_ajuste
                AND ad_tipo.cantidad < 0
            )
            AND NOT EXISTS
            (
              SELECT 1
              FROM dbo.ajustes_detalles ad_tipo
              WHERE ad_tipo.ajuste_id = a.numero_ajuste
                AND ad_tipo.cantidad > 0
            )
              THEN CONCAT(m.nombre, ' (Egreso)')

            ELSE m.nombre
          END AS motivo,
          a.fecha,
          a.fecha_real,
          a.remito_referencia,
          a.id_referente,
          r.nombre AS referente,
          a.usuario,
          CAST(
            CASE
              WHEN UPPER(
                REPLACE(
                  LTRIM(RTRIM(ISNULL(a.motivo, ''))),
                  N'Ó',
                  N'O'
                )
              ) LIKE N'CONSUMO PRODUCCION (DROPBOX)%'
                THEN 1
              ELSE 0
            END
            AS BIT
          ) AS es_consumo_dropbox

        FROM dbo.ajustes a

        LEFT JOIN dbo.ajustes_motivos m
          ON m.id_motivo = a.motivo_id

        LEFT JOIN dbo.referentes r
          ON r.id_referente = a.id_referente

        WHERE a.numero_ajuste = @numero;
      `);

    if (!cabecera.recordset.length) {
      return res.status(404).json({
        error: "Ajuste no encontrado",
      });
    }

    const detalle = await pool.request().input("numero", sql.Int, numero)
      .query(`
        SELECT
          ad.ajuste_id,
          ad.cod_articulo,
          ad.descripcion,
          ad.cantidad,
          ad.cantidad_requerida,
          ad.cantidad_faltante,
          ad.observacion,
          ad.id_recorte,
          ad.id_ubicacion_recorte,
          ru.nombre AS ubicacion_recorte

        FROM dbo.ajustes_detalles ad

        LEFT JOIN dbo.recortes_ubicaciones ru
          ON ru.id_ubicacion_recorte = ad.id_ubicacion_recorte

        WHERE ad.ajuste_id = @numero

        ORDER BY ad.cod_articulo;
      `);

    return res.json({
      cabecera: cabecera.recordset[0],
      detalle: detalle.recordset || [],
    });
  } catch (err) {
    console.error("ajustes.getById:", err);

    return res.status(500).json({
      error: "Error al obtener detalle del ajuste",
      detalle: err.message,
    });
  }
};

// ========================================================
// CREAR AJUSTE
// ========================================================

async function crearAjusteRecortes(req, res) {
  const usuario = getUsuarioReq(req);
  const motivoId = asInt(req.body?.motivo_id);
  const remitoReferencia = toDb(req.body?.remito_referencia);
  const fechaReal = toDb(req.body?.fecha_real);
  const obra = toDb(req.body?.obra);
  const version = toDb(req.body?.version);

  const referenteRaw = req.body?.id_referente;
  const referenteId =
    referenteRaw === null ||
    referenteRaw === undefined ||
    String(referenteRaw).trim() === ""
      ? null
      : asInt(referenteRaw);

  const itemsRaw = Array.isArray(req.body?.items) ? req.body.items : [];

  if (!Number.isInteger(motivoId) || motivoId <= 0) {
    return res.status(400).json({
      error: "Debe seleccionar un motivo.",
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
      codigo: up(itemRaw?.cod_articulo ?? itemRaw?.codigo),
      id_recorte: asInt(itemRaw?.id_recorte),
      cantidad: Number(itemRaw?.cantidad),
      id_ubicacion_recorte: asInt(itemRaw?.id_ubicacion),
    };

    if (
      !item.codigo ||
      !Number.isInteger(item.id_recorte) ||
      item.id_recorte <= 0 ||
      !Number.isFinite(item.cantidad) ||
      item.cantidad === 0 ||
      !Number.isInteger(item.id_ubicacion_recorte) ||
      item.id_ubicacion_recorte <= 0
    ) {
      continue;
    }

    const clave = `${item.id_recorte}|${item.id_ubicacion_recorte}`;
    const actual = agrupados.get(clave) || {
      ...item,
      cantidad: 0,
    };

    actual.cantidad += item.cantidad;
    agrupados.set(clave, actual);
  }

  const items = Array.from(agrupados.values()).filter(
    (item) => item.cantidad !== 0,
  );

  if (!items.length) {
    return res.status(400).json({
      error: "Debe incluir al menos un recorte válido.",
    });
  }

  let transaction;

  try {
    await poolConnect;
    const pool = await getPool();

    transaction = new sql.Transaction(pool);
    await transaction.begin();

    const motivo = await requireMotivoActivo(transaction, motivoId);

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

    const numeroResult = await new sql.Request(transaction).query(`
      SELECT ISNULL(MAX(numero_ajuste), 0) + 1 AS numero
      FROM dbo.ajustes WITH (UPDLOCK, HOLDLOCK);
    `);

    const numeroAjuste = Number(numeroResult.recordset[0].numero);

    await new sql.Request(transaction)
      .input("numeroAjuste", sql.Int, numeroAjuste)
      .input("motivoId", sql.Int, motivoId)
      .input("motivo", sql.VarChar(255), motivo.nombre)
      .input("usuario", sql.VarChar(255), usuario)
      .input("remito", sql.VarChar(255), remitoReferencia)
      .input("fechaReal", sql.Date, fechaReal)
      .input("obra", sql.VarChar(255), obra)
      .input("version", sql.VarChar(255), version)
      .input("referenteId", sql.Int, referenteId)
      .query(`
        INSERT INTO dbo.ajustes
        (
          numero_ajuste,
          deposito,
          motivo_id,
          motivo,
          fecha,
          fecha_real,
          remito_referencia,
          obra,
          version,
          id_referente,
          usuario,
          es_recortes
        )
        VALUES
        (
          @numeroAjuste,
          'Recortes',
          @motivoId,
          @motivo,
          GETDATE(),
          COALESCE(@fechaReal, CONVERT(date, GETDATE())),
          @remito,
          @obra,
          @version,
          @referenteId,
          @usuario,
          1
        );
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

      const ubicacionResult = await new sql.Request(transaction)
        .input("id", sql.Int, item.id_ubicacion_recorte)
        .query(`
          SELECT id_ubicacion_recorte, nombre
          FROM dbo.recortes_ubicaciones WITH (UPDLOCK, HOLDLOCK)
          WHERE id_ubicacion_recorte = @id
            AND activo = 1;
        `);

      if (!ubicacionResult.recordset.length) {
        throw new Error(
          `La ubicación de ${item.codigo} no existe o está inactiva.`,
        );
      }

      const nombreUbicacion = String(
        ubicacionResult.recordset[0].nombre || "",
      );

      if (item.cantidad < 0) {
        const descuento = await new sql.Request(transaction)
          .input("idRecorte", sql.Int, item.id_recorte)
          .input("idUbicacion", sql.Int, item.id_ubicacion_recorte)
          .input("cantidad", sql.Decimal(18, 3), Math.abs(item.cantidad))
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
      } else {
        await new sql.Request(transaction)
          .input("idRecorte", sql.Int, item.id_recorte)
          .input("idUbicacion", sql.Int, item.id_ubicacion_recorte)
          .input("ubicacion", sql.VarChar(150), nombreUbicacion)
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
      }

      await new sql.Request(transaction)
        .input("ajusteId", sql.Int, numeroAjuste)
        .input("codigo", sql.VarChar(150), item.codigo)
        .input(
          "descripcion",
          sql.VarChar(500),
          recorteResult.recordset[0].descripcion || "",
        )
        .input("cantidad", sql.Decimal(18, 3), item.cantidad)
        .input("idRecorte", sql.Int, item.id_recorte)
        .input(
          "idUbicacionRecorte",
          sql.Int,
          item.id_ubicacion_recorte,
        )
        .input("usuario", sql.VarChar(255), usuario)
        .query(`
          INSERT INTO dbo.ajustes_detalles
          (
            ajuste_id,
            cod_articulo,
            descripcion,
            cantidad,
            id_recorte,
            id_ubicacion_recorte,
            usuario
          )
          VALUES
          (
            @ajusteId,
            @codigo,
            @descripcion,
            @cantidad,
            @idRecorte,
            @idUbicacionRecorte,
            @usuario
          );
        `);
    }

    await transaction.commit();

    return res.status(201).json({
      ok: true,
      ajuste: {
        numero_ajuste: numeroAjuste,
      },
    });
  } catch (error) {
    if (transaction && transaction._aborted !== true) {
      try {
        await transaction.rollback();
      } catch (rollbackError) {
        console.error("Error haciendo rollback:", rollbackError);
      }
    }

    console.error("crearAjusteRecortes:", error);

    return res.status(400).json({
      error: error.message || "Error al ajustar recortes.",
    });
  }
}

exports.create = async (req, res) => {
  const usuario = getUsuarioReq(req);

  const depositoId = asInt(req.body?.deposito_id);

  if (depositoId === DEPOSITO_RECORTES_ID) {
    return crearAjusteRecortes(req, res);
  }

  const motivoId = asInt(req.body?.motivo_id);

  const remitoReferencia = toDb(req.body?.remito_referencia);

  const referenteRaw = req.body?.id_referente;

  const referenteId =
    referenteRaw === null ||
    referenteRaw === undefined ||
    String(referenteRaw).trim() === ""
      ? null
      : asInt(referenteRaw);

  const fechaReal = toDb(req.body?.fecha_real);

  const obra = toDb(req.body?.obra);

  const version = toDb(req.body?.version);

  const itemsRaw = Array.isArray(req.body?.items) ? req.body.items : [];

  if (!Number.isFinite(depositoId) || depositoId <= 0) {
    return res.status(400).json({
      error: "Depósito obligatorio",
    });
  }

  if (!Number.isFinite(motivoId) || motivoId <= 0) {
    return res.status(400).json({
      error: "Motivo obligatorio",
    });
  }

  if (
    referenteId !== null &&
    (!Number.isFinite(referenteId) || referenteId <= 0)
  ) {
    return res.status(400).json({
      error: "Referente inválido",
    });
  }

  if (!itemsRaw.length) {
    return res.status(400).json({
      error: "Debe incluir al menos un artículo",
    });
  }

  /*
   * Consolida los artículos por código.
   *
   * También conserva la ubicación descriptiva
   * que se guarda en dbo.articulos.ubicacion.
   */
  const agrupados = new Map();

  for (const item of itemsRaw) {
    const codigo = up(item?.cod_articulo ?? item?.codigo);

    const cantidad = Number(item?.cantidad);

    if (!codigo || !Number.isFinite(cantidad) || cantidad === 0) {
      continue;
    }

    const ubicacionItemId = asInt(item?.id_ubicacion);

if (!Number.isFinite(ubicacionItemId) || ubicacionItemId <= 0) {
  continue;
}

const clave = `${codigo}|${ubicacionItemId}`;

const actual = agrupados.get(clave) || {
  codigo,
  cantidad: 0,
  id_ubicacion: ubicacionItemId,
};

actual.cantidad += cantidad;

agrupados.set(clave, actual);
  }

  const items = Array.from(agrupados.values());

  if (!items.length) {
    return res.status(400).json({
      error: "Ítems inválidos",
    });
  }

  let transaction;

  try {
    await poolConnect;
    const pool = await getPool();

    transaction = new sql.Transaction(pool);

    await transaction.begin();

    // ----------------------------------------------------
    // DEPÓSITO
    // ----------------------------------------------------

    const depositoResult = await new sql.Request(transaction).input(
      "depositoId",
      sql.Int,
      depositoId,
    ).query(`
          SELECT
            id_deposito,
            nombre

          FROM dbo.depositos
          WITH (UPDLOCK, HOLDLOCK)

          WHERE id_deposito = @depositoId;
        `);

    if (!depositoResult.recordset.length) {
      await transaction.rollback();

      return res.status(400).json({
        error: `Depósito inexistente: ${depositoId}`,
      });
    }

    const nombreDeposito = String(depositoResult.recordset[0].nombre || "");

    // ----------------------------------------------------
    // MOTIVO
    // ----------------------------------------------------

    let motivo;

    try {
      motivo = await requireMotivoActivo(transaction, motivoId);
    } catch (err) {
      await transaction.rollback();

      return res.status(400).json({
        error: err.message || "Motivo inválido",
      });
    }

    // ----------------------------------------------------
    // REFERENTE
    // ----------------------------------------------------

    if (referenteId !== null) {
      const referente = await new sql.Request(transaction).input(
        "referenteId",
        sql.Int,
        referenteId,
      ).query(`
            SELECT
              id_referente,
              nombre,
              activo

            FROM dbo.referentes
            WITH (UPDLOCK, HOLDLOCK)

            WHERE id_referente = @referenteId;
          `);

      if (!referente.recordset.length) {
        await transaction.rollback();

        return res.status(400).json({
          error: "Referente inexistente",
        });
      }

      if (!referente.recordset[0].activo) {
        await transaction.rollback();

        return res.status(400).json({
          error: "Referente inactivo",
        });
      }
    }

    // ----------------------------------------------------
    // ARTÍCULOS
    // ----------------------------------------------------

    const codigos = items.map((item) => item.codigo);

    const parametros = codigos.map((_, index) => `@codigo${index}`).join(",");

    const requestArticulos = new sql.Request(transaction);

    codigos.forEach((codigo, index) => {
      requestArticulos.input(`codigo${index}`, sql.VarChar(100), codigo);
    });

    const articulos = await requestArticulos.query(`
        SELECT
          id_articulo,

          UPPER(
            LTRIM(
              RTRIM(codigo)
            )
          ) AS codigo,

          descripcion

        FROM dbo.articulos
        WITH (UPDLOCK, HOLDLOCK)

        WHERE UPPER(
          LTRIM(
            RTRIM(codigo)
          )
        ) IN (${parametros});
      `);

    const articulosPorCodigo = new Map(
      articulos.recordset.map((articulo) => [
        String(articulo.codigo),
        {
          id_articulo: Number(articulo.id_articulo),

          descripcion: String(articulo.descripcion || ""),
        },
      ]),
    );

    const codigosInexistentes = items
      .filter((item) => !articulosPorCodigo.has(item.codigo))
      .map((item) => item.codigo);

    if (codigosInexistentes.length) {
      await transaction.rollback();

      return res.status(400).json({
        error: "Códigos inexistentes",
        detalle: codigosInexistentes,
      });
    }

    // ----------------------------------------------------
    // VALIDAR STOCK PROYECTADO
    // ----------------------------------------------------

    for (const item of items) {
      const articulo = articulosPorCodigo.get(item.codigo);

      const ubicacionId = await resolveUbicacionId(transaction, {
        depositoId,
        ubicacionId: item.id_ubicacion,
      });

      const disponible = await getStockActual(transaction, {
        depositoId,
        articuloId: articulo.id_articulo,
        ubicacionId,
      });

      const proyectado = disponible + item.cantidad;

      if (proyectado < 0) {
        await transaction.rollback();

        return res.status(400).json({
          error: "Stock insuficiente para ajustar",

          detalle: {
            cod_articulo: item.codigo,

            disponible,

            intento_ajuste: item.cantidad,

            quedaria: proyectado,
          },
        });
      }
    }

    // ----------------------------------------------------
    // PRÓXIMO NÚMERO
    // ----------------------------------------------------

    const numeroResult = await new sql.Request(transaction).query(`
          SELECT
            ISNULL(
              MAX(numero_ajuste),
              0
            ) + 1 AS numero

          FROM dbo.ajustes
          WITH (UPDLOCK, HOLDLOCK);
        `);

    const numeroAjuste = Number(numeroResult.recordset[0].numero);

    // ----------------------------------------------------
    // CABECERA
    // ----------------------------------------------------

    await new sql.Request(transaction)
      .input("numeroAjuste", sql.Int, numeroAjuste)
      .input("deposito", sql.VarChar(255), nombreDeposito)
      .input("motivoId", sql.Int, motivoId)
      .input("motivo", sql.VarChar(255), motivo.nombre)
      .input("obra", sql.NVarChar(200), obra)
      .input("version", sql.NVarChar(100), version)
      .input("remitoReferencia", sql.VarChar(255), remitoReferencia)
      .input("referenteId", sql.Int, referenteId)
      .input("fechaReal", sql.Date, fechaReal)
      .input("usuario", sql.VarChar(255), usuario).query(`
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
          id_referente,
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
          COALESCE(
            @fechaReal,
            CONVERT(date, GETDATE())
          ),
          @remitoReferencia,
          @referenteId,
          @usuario
        );
      `);

    // ----------------------------------------------------
    // DETALLES, UBICACIÓN Y STOCK
    // ----------------------------------------------------

    for (const item of items) {
      const articulo = articulosPorCodigo.get(item.codigo);

      await insertDetalle(transaction, {
        ajusteId: numeroAjuste,
        cod: item.codigo,
        desc: articulo.descripcion,
        cantidad: item.cantidad,
        usuario,
      });

      const ubicacionId = await resolveUbicacionId(transaction, {
        depositoId,
        ubicacionId: item.id_ubicacion,
      });

      await upsertStockDelta(transaction, {
        depositoId,
        articuloId: articulo.id_articulo,
        ubicacionId,
        delta: item.cantidad,
      });
    }

    await transaction.commit();

    const creado = await pool
      .request()
      .input("numeroAjuste", sql.Int, numeroAjuste).query(`
        SELECT
          a.numero_ajuste AS id,
          a.numero_ajuste,
          a.deposito,
          a.obra,
          a.version,
          m.nombre AS motivo,
          a.fecha,
          a.fecha_real,
          a.remito_referencia,
          a.id_referente,
          r.nombre AS referente

        FROM dbo.ajustes a

        LEFT JOIN dbo.ajustes_motivos m
          ON m.id_motivo = a.motivo_id

        LEFT JOIN dbo.referentes r
          ON r.id_referente = a.id_referente

        WHERE a.numero_ajuste = @numeroAjuste;
      `);

    return res.status(201).json({
      message: "Ajuste creado",
      ajuste: creado.recordset[0],
    });
  } catch (err) {
    console.error("ajustes.create:", err);

    try {
      if (transaction) {
        await transaction.rollback();
      }
    } catch {}

    return res.status(500).json({
      error: "Error al crear ajuste",
      detalle: err.message,
    });
  }
};

// ========================================================
// DESCARGAR PLANTILLA
// ========================================================

exports.downloadTemplate = (_req, res) => {
  try {
    const data = [
      ["Código", "Tipo de movimiento", "Depósito", "Ubicación", "Cantidad"],
    ];

    const worksheet = XLSX.utils.aoa_to_sheet(data);

    const workbook = XLSX.utils.book_new();

    XLSX.utils.book_append_sheet(workbook, worksheet, "Ajustes");

    const buffer = XLSX.write(workbook, {
      type: "buffer",
      bookType: "xlsx",
    });

    res.setHeader(
      "Content-Disposition",
      'attachment; filename="Plantilla_Ajustes.xlsx"',
    );

    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );

    return res.status(200).send(buffer);
  } catch (err) {
    console.error("ajustes.downloadTemplate:", err);

    return res.status(500).json({
      error: "Error al generar plantilla",
      detalle: err.message,
    });
  }
};

// ========================================================
// IMPORTAR AJUSTES DESDE EXCEL
// ========================================================

exports.importarDesdeExcel = async (req, res) => {
  if (!req.file) {
    return res.status(400).json({
      error: "No se recibió archivo",
    });
  }

  let rows;

  try {
    const workbook = XLSX.read(req.file.buffer, {
      type: "buffer",
    });

    const sheet = workbook.Sheets[workbook.SheetNames[0]];

    rows = XLSX.utils.sheet_to_json(sheet, {
      header: 1,
      defval: "",
    });
  } catch (err) {
    return res.status(400).json({
      error: "Archivo inválido",
      detalle: err.message,
    });
  }

  if (!rows || rows.length < 2) {
    return res.status(400).json({
      error: "El Excel no tiene datos",
    });
  }

  rows.shift();

  const errores = [];
  const movimientos = [];

  rows.forEach((row, index) => {
    const fila = index + 2;

    const [codigoRaw, tipoRaw, depositoRaw, ubicacionRaw, cantidadRaw] = row;

    const codigo = up(codigoRaw);
    const deposito = toDb(depositoRaw);
    const ubicacion = toDb(ubicacionRaw);

    const tipo = String(tipoRaw || "")
      .trim()
      .toUpperCase();

    const cantidad = toNumber0(cantidadRaw);

    if (!codigo) {
      errores.push({
        fila,
        error: "Código vacío",
      });

      return;
    }

    if (!deposito) {
      errores.push({
        fila,
        error: "Depósito vacío",
      });

      return;
    }

    if (!ubicacion) {
      errores.push({
        fila,
        error: "Ubicación vacía",
      });

      return;
    }

    if (!Number.isFinite(cantidad) || cantidad <= 0) {
      errores.push({
        fila,
        error: "Cantidad inválida",
      });

      return;
    }

    if (!["ENTRADA", "SALIDA"].includes(tipo)) {
      errores.push({
        fila,
        error: "Tipo inválido. Use ENTRADA o SALIDA",
      });

      return;
    }

    movimientos.push({
      fila,
      codigo,
      deposito,
      ubicacion,
      tipo,
      cantidad: Math.trunc(cantidad),
    });
  });

  if (errores.length) {
    return res.status(400).json({
      errores,
    });
  }

  const grupos = new Map();

  for (const movimiento of movimientos) {
    const key = `${movimiento.deposito}||${movimiento.ubicacion}`;

    if (!grupos.has(key)) {
      grupos.set(key, []);
    }

    grupos.get(key).push(movimiento);
  }

  let transaction;

  try {
    await poolConnect;
    const pool = await getPool();

    transaction = new sql.Transaction(pool);

    await transaction.begin();

    const motivoId = await getMotivoIdByNombreActivo(
      transaction,
      "IMPORTACION EXCEL",
    );

    if (!motivoId) {
      throw new Error('Falta el motivo "IMPORTACIÓN EXCEL" o está inactivo');
    }

    const ajustes = [];

    for (const [key, movimientosGrupo] of grupos.entries()) {
      const [depositoNombre, ubicacionNombre] = key.split("||");

      const depositoResult = await new sql.Request(transaction).input(
        "nombre",
        sql.VarChar(255),
        depositoNombre,
      ).query(`
            SELECT
              id_deposito,
              nombre

            FROM dbo.depositos
            WITH (UPDLOCK, HOLDLOCK)

            WHERE nombre = @nombre;
          `);

      if (!depositoResult.recordset.length) {
        throw new Error(`Depósito inexistente: ${depositoNombre}`);
      }

      const depositoId = Number(depositoResult.recordset[0].id_deposito);

      const ubicacionResult = await new sql.Request(transaction)
        .input("depositoId", sql.Int, depositoId)
        .input("nombre", sql.VarChar(255), ubicacionNombre).query(`
            SELECT TOP 1 id_ubicacion

            FROM dbo.ubicaciones
            WITH (UPDLOCK, HOLDLOCK)

            WHERE id_deposito = @depositoId
              AND UPPER(
                LTRIM(
                  RTRIM(nombre)
                )
              ) = UPPER(
                LTRIM(
                  RTRIM(@nombre)
                )
              );
          `);

      if (!ubicacionResult.recordset.length) {
        throw new Error(
          `Ubicación inexistente: "${ubicacionNombre}" para depósito "${depositoNombre}"`,
        );
      }

      const ubicacionId = Number(ubicacionResult.recordset[0].id_ubicacion);

      const numeroResult = await new sql.Request(transaction).query(`
            SELECT
              ISNULL(
                MAX(numero_ajuste),
                0
              ) + 1 AS numero

            FROM dbo.ajustes
            WITH (UPDLOCK, HOLDLOCK);
          `);

      const numeroAjuste = Number(numeroResult.recordset[0].numero);

      await new sql.Request(transaction)
        .input("numeroAjuste", sql.Int, numeroAjuste)
        .input("deposito", sql.VarChar(255), depositoNombre)
        .input("motivoId", sql.Int, motivoId)
        .input(
          "motivo",
          sql.VarChar(255),
          `IMPORTACIÓN EXCEL (${ubicacionNombre})`,
        ).query(`
          INSERT INTO dbo.ajustes
          (
            numero_ajuste,
            deposito,
            motivo_id,
            motivo,
            fecha,
            usuario
          )
          VALUES
          (
            @numeroAjuste,
            @deposito,
            @motivoId,
            @motivo,
            GETDATE(),
            'sistema'
          );
        `);

      const agrupados = new Map();

      for (const movimiento of movimientosGrupo) {
        const delta =
          movimiento.tipo === "SALIDA"
            ? -movimiento.cantidad
            : movimiento.cantidad;

        agrupados.set(
          movimiento.codigo,
          (agrupados.get(movimiento.codigo) || 0) + delta,
        );
      }

      for (const [codigo, deltaRaw] of agrupados.entries()) {
        const delta = Math.trunc(deltaRaw);

        if (delta === 0) {
          continue;
        }

        const articuloResult = await new sql.Request(transaction).input(
          "codigo",
          sql.VarChar(100),
          codigo,
        ).query(`
              SELECT
                id_articulo,
                descripcion

              FROM dbo.articulos
              WITH (UPDLOCK, HOLDLOCK)

              WHERE UPPER(
                LTRIM(
                  RTRIM(codigo)
                )
              ) = @codigo;
            `);

        if (!articuloResult.recordset.length) {
          throw new Error(`Código inexistente: ${codigo}`);
        }

        const articuloId = Number(articuloResult.recordset[0].id_articulo);

        const descripcion = String(
          articuloResult.recordset[0].descripcion || "",
        );

        if (delta < 0) {
          const disponible = await getStockActual(transaction, {
            depositoId,
            articuloId,
            ubicacionId,
          });

          if (disponible + delta < 0) {
            throw new Error(
              `Stock insuficiente para ${codigo} en ${depositoNombre}/${ubicacionNombre}`,
            );
          }
        }

        await insertDetalle(transaction, {
          ajusteId: numeroAjuste,
          cod: codigo,
          desc: descripcion,
          cantidad: delta,
          usuario: "sistema",
        });

        await upsertStockDelta(transaction, {
          depositoId,
          articuloId,
          ubicacionId,
          delta,
        });
      }

      ajustes.push({
        deposito: depositoNombre,

        ubicacion: ubicacionNombre,

        numero_ajuste: numeroAjuste,
      });
    }

    await transaction.commit();

    return res.json({
      ok: true,
      ajustes,
    });
  } catch (err) {
    try {
      if (transaction) {
        await transaction.rollback();
      }
    } catch {}

    return res.status(400).json({
      error: String(err?.message || err),
    });
  }
};

// ALERTAS DE CONSUMO
async function insertAlertaConsumoProduccion(
  transaction,
  {
    numeroMovimiento,
    obra,
    version,
    codigo,
    descripcion,
    cantidadRequerida,
    cantidadAjustada,
    cantidadFaltante,
    motivo,
    fechaLinea,
  },
) {
  const numeroMovimientoDb =
    numeroMovimiento == null
      ? null
      : Number(numeroMovimiento);

  const codigoDb =
    codigo == null
      ? null
      : String(codigo).trim();

  const cantidadFaltanteDb =
    cantidadFaltante == null
      ? null
      : Number(cantidadFaltante);

  /*
   * Evita insertar dos alertas pendientes para el mismo
   * movimiento, código y cantidad faltante.
   *
   * Esto resuelve el caso en que el error se registra:
   * 1. desde grupo.articulos;
   * 2. nuevamente desde grupo.fallidos.
   */
  const existente = await new sql.Request(transaction)
    .input(
      "numeroMovimiento",
      sql.Int,
      numeroMovimientoDb,
    )
    .input(
      "codigo",
      sql.VarChar(100),
      codigoDb,
    )
    .input(
      "cantidadFaltante",
      sql.Int,
      cantidadFaltanteDb,
    )
    .query(`
      SELECT TOP 1
        id_alerta
      FROM dbo.consumo_produccion_alertas
      WHERE numero_movimiento = @numeroMovimiento
        AND ISNULL(codigo, '') = ISNULL(@codigo, '')
        AND ISNULL(cantidad_faltante, 0) =
            ISNULL(@cantidadFaltante, 0)
        AND leida = 0;
    `);

  if (existente.recordset.length) {
    return Number(existente.recordset[0].id_alerta);
  }

  const result = await new sql.Request(transaction)
    .input(
      "numeroMovimiento",
      sql.Int,
      numeroMovimientoDb,
    )
    .input(
      "obra",
      sql.NVarChar(sql.MAX),
      obra == null
        ? null
        : String(obra).trim(),
    )
    .input(
      "version",
      sql.NVarChar(sql.MAX),
      version == null
        ? null
        : String(version).trim(),
    )
    .input(
      "codigo",
      sql.VarChar(100),
      codigoDb,
    )
    .input(
      "descripcion",
      sql.VarChar(500),
      descripcion == null
        ? null
        : String(descripcion).trim(),
    )
    .input(
      "cantidadRequerida",
      sql.Int,
      cantidadRequerida ?? null,
    )
    .input(
      "cantidadAjustada",
      sql.Int,
      cantidadAjustada ?? null,
    )
    .input(
      "cantidadFaltante",
      sql.Int,
      cantidadFaltanteDb,
    )
    .input(
      "motivo",
      sql.NVarChar(sql.MAX),
      motivo == null
        ? null
        : String(motivo).trim(),
    )
    .input(
      "fechaLinea",
      sql.Date,
      fechaLinea ?? null,
    )
    .query(`
      INSERT INTO dbo.consumo_produccion_alertas
      (
        numero_movimiento,
        obra,
        version,
        codigo,
        descripcion,
        cantidad_requerida,
        cantidad_ajustada,
        cantidad_faltante,
        motivo,
        fecha_linea,
        leida
      )
      VALUES
      (
        @numeroMovimiento,
        @obra,
        @version,
        @codigo,
        @descripcion,
        @cantidadRequerida,
        @cantidadAjustada,
        @cantidadFaltante,
        @motivo,
        @fechaLinea,
        0
      );

      SELECT SCOPE_IDENTITY() AS id_alerta;
    `);

  return Number(result.recordset?.[0]?.id_alerta || 0);
}

// CONSUMIR PRODUCCIÓN DESDE DROPBOX
async function runConsumoProduccion() {
  let transaction = null;

  await poolConnect;
  const pool = await getPool();

  try {
    const setting = await pool
      .request()
      .input("clave", sql.VarChar(255), "DROPBOX_PRODUCCION_FILE_ID").query(`
        SELECT valor
        FROM dbo.app_settings
        WHERE clave = @clave;
      `);

    if (!setting.recordset.length) {
      return {
        ok: false,
        error: "No existe configuración DROPBOX_PRODUCCION_FILE_ID",
      };
    }

    const fileRef = String(setting.recordset[0].valor || "").trim();

    if (!fileRef) {
      return {
        ok: false,
        error: "DROPBOX_PRODUCCION_FILE_ID está vacío",
      };
    }

    const buffer = await downloadByPath(fileRef);

    const workbook = XLSX.read(buffer, {
      type: "buffer",
    });

    const worksheet = workbook.Sheets.materiales;

    if (!worksheet) {
      return {
        ok: false,
        error: 'No existe la hoja "materiales"',
      };
    }

    const rows = XLSX.utils.sheet_to_json(worksheet, {
      header: 1,
      defval: "",
    });

    if (!rows.length) {
      return {
        ok: true,
        message: "Hoja materiales vacía",
        ajustados: 0,
        fallidos: 0,
      };
    }

    const header = rows[0];
    const dataRows = rows.slice(1);

    transaction = new sql.Transaction(pool);

    await transaction.begin();

    const motivoId = await getMotivoIdByNombreActivo(
      transaction,
      "CONSUMO PRODUCCION (DROPBOX)",
    );

    if (!motivoId) {
      throw new Error(
        'Falta el motivo "CONSUMO PRODUCCIÓN (DROPBOX)" o está inactivo',
      );
    }

    const depositoResult = await new sql.Request(transaction).input(
      "nombre",
      sql.VarChar(255),
      "Producción",
    ).query(`
          SELECT
            id_deposito,
            nombre

          FROM dbo.depositos
          WITH (UPDLOCK, HOLDLOCK)

          WHERE nombre = @nombre;
        `);

    if (!depositoResult.recordset.length) {
      throw new Error('No existe el depósito "Producción"');
    }

    const depositoId = Number(depositoResult.recordset[0].id_deposito);

    const depositoNombre = String(
      depositoResult.recordset[0].nombre || "Producción",
    );

    const ubicacionResult = await new sql.Request(transaction).input(
      "depositoId",
      sql.Int,
      depositoId,
    ).query(`
          SELECT TOP 1 id_ubicacion

          FROM dbo.ubicaciones
          WITH (UPDLOCK, HOLDLOCK)

          WHERE id_deposito = @depositoId
            AND activa = 1
            AND UPPER(
              LTRIM(
                RTRIM(nombre)
              )
            ) = 'GENERAL'

          ORDER BY id_ubicacion;
        `);

    if (!ubicacionResult.recordset.length) {
      throw new Error(
        "No existe la ubicación GENERAL para el depósito Producción",
      );
    }

    const ubicacionId = Number(ubicacionResult.recordset[0].id_ubicacion);

    const grupos = new Map();
    const itemsCorrectos = [];
    const itemsFallidos = [];

    const obtenerGrupo = (obra, version) => {
      const key = `${obra ?? "NULL"}||${version ?? "NULL"}`;

      if (!grupos.has(key)) {
        grupos.set(key, {
          obra,
          version,
          articulos: new Map(),
          fallidos: [],
        });
      }

      return grupos.get(key);
    };

    const registrarFallo = (grupo, item) => {
      itemsFallidos.push(item);

      if (grupo) {
        grupo.fallidos.push(item);
      }
    };

    for (let index = 0; index < dataRows.length; index += 1) {
      const row = dataRows[index];
      const excelRow = index + 2;

      const obraCelda = String(row[0] ?? "").trim();

      if (!obraCelda) {
        break;
      }

      const obra = toDb(row[0]);
      const version = toDb(row[4]);
      const codigo = up(row[1]);
      const fechaLinea = normalizarFechaExcel(row[7]);

      const grupo = obtenerGrupo(obra, version);

      const requerido = toNumber0(row[5]);
      const yaAjustado = toNumber0(row[6]);

      if (yaAjustado >= requerido) {
        continue;
      }

      const diferencia = Math.trunc(requerido - yaAjustado);

      if (diferencia <= 0) {
        continue;
      }

      if (!codigo) {
        registrarFallo(grupo, {
          row: excelRow,
          codigo: "SIN_CODIGO",
          descripcion: "",
          requerido: diferencia,
          ajustado: 0,
          faltante: diferencia,
          obra,
          version,
          motivo: "Código vacío",
        });

        continue;
      }

      const articuloResult = await new sql.Request(transaction).input(
        "codigo",
        sql.VarChar(100),
        codigo,
      ).query(`
            SELECT TOP 1
              id_articulo,
              descripcion

            FROM dbo.articulos
            WITH (UPDLOCK, HOLDLOCK)

            WHERE UPPER(
              LTRIM(
                RTRIM(codigo)
              )
            ) = @codigo;
          `);

      if (!articuloResult.recordset.length) {
        registrarFallo(grupo, {
          row: excelRow,
          codigo,
          descripcion: "",
          requerido: diferencia,
          ajustado: 0,
          faltante: diferencia,
          obra,
          version,
          motivo: "Código inexistente",
        });

        continue;
      }

      const articuloId = Number(articuloResult.recordset[0].id_articulo);

      const descripcion = String(articuloResult.recordset[0].descripcion || "");

      const disponible = await getStockActual(transaction, {
        depositoId,
        articuloId,
        ubicacionId,
      });

      const ajustable = Math.min(disponible, diferencia);

      const faltante = diferencia - ajustable;

      if (ajustable <= 0) {
        registrarFallo(grupo, {
          row: excelRow,
          codigo,
          descripcion,
          requerido: diferencia,
          ajustado: 0,
          faltante: diferencia,
          obra,
          version,
          motivo: "Sin stock disponible",
        });

        const anterior = grupo.articulos.get(codigo);

        grupo.articulos.set(codigo, {
          descripcion,
          delta: anterior?.delta || 0,
          requerido: (anterior?.requerido || 0) + diferencia,
          faltante: (anterior?.faltante || 0) + diferencia,
          fechaLinea,
          observacion: "Sin stock disponible",
        });

        continue;
      }

      const descontado = await tryDescontarStock(transaction, {
        depositoId,
        articuloId,
        ubicacionId,
        deltaNegativo: -ajustable,
      });

      if (!descontado) {
        registrarFallo(grupo, {
          row: excelRow,
          codigo,
          descripcion,
          requerido: diferencia,
          ajustado: 0,
          faltante: diferencia,
          obra,
          version,
          motivo: "No se pudo descontar stock",
        });

        continue;
      }

      row[6] = yaAjustado + ajustable;
      const quedoCompletamenteAjustado =
        Number(row[6]) >= requerido;

      itemsCorrectos.push({
        row: excelRow,
        codigo,
        articuloId,
        descripcion,
        requerido: diferencia,
        ajustado: ajustable,
        faltante,
        obra,
        version,
      });

      if (faltante > 0) {
        registrarFallo(grupo, {
          row: excelRow,
          codigo,
          descripcion,
          requerido: diferencia,
          ajustado: ajustable,
          faltante,
          obra,
          version,
          motivo: "Stock parcial: se ajustó hasta cero",
        });
      }

      const anterior = grupo.articulos.get(codigo);

      grupo.articulos.set(codigo, {
        descripcion,

        delta: (anterior?.delta || 0) - ajustable,

        requerido: (anterior?.requerido || 0) + diferencia,

        faltante: (anterior?.faltante || 0) + faltante,
        fechaLinea,
        observacion:
          faltante > 0
            ? "Stock parcial: se ajustó hasta cero"
            : anterior?.observacion || null,
      });
    }

    if (!itemsCorrectos.length && !itemsFallidos.length) {
      await transaction.rollback();
      transaction = null;

      return {
        ok: true,
        message: "No hay diferencias para ajustar",
        ajustados: 0,
        fallidos: 0,
        resumen_fallidos: [],
      };
    }

    const ajustesCreados = [];

    for (const grupo of grupos.values()) {
      const tieneDetalle =
        grupo.fallidos.length > 0 ||
        Array.from(grupo.articulos.values()).some(
          (item) => item.delta !== 0 || item.faltante !== 0,
        );

      if (!tieneDetalle) {
        continue;
      }

      const numeroResult = await new sql.Request(transaction).query(`
            SELECT
              ISNULL(
                MAX(numero_ajuste),
                0
              ) + 1 AS numero

            FROM dbo.ajustes
            WITH (UPDLOCK, HOLDLOCK);
          `);

      const numeroAjuste = Number(numeroResult.recordset[0].numero);

      await new sql.Request(transaction)
        .input("numeroAjuste", sql.Int, numeroAjuste)
        .input("deposito", sql.VarChar(255), depositoNombre)
        .input("motivoId", sql.Int, motivoId)
        .input("motivo", sql.VarChar(255), "CONSUMO PRODUCCIÓN (DROPBOX)")
        .input("obra", sql.NVarChar(sql.MAX), grupo.obra)
        .input("version", sql.NVarChar(sql.MAX), grupo.version)
        .input("usuario", sql.VarChar(255), "sistema").query(`
          INSERT INTO dbo.ajustes
          (
            numero_ajuste,
            deposito,
            motivo_id,
            motivo,
            obra,
            version,
            fecha,
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
            @usuario
          );
        `);

      for (const [codigo, item] of grupo.articulos.entries()) {
        if (item.delta === 0 && item.faltante === 0) {
          continue;
        }

        await insertDetalle(transaction, {
          ajusteId: numeroAjuste,
          cod: codigo,
          desc: item.descripcion,
          cantidad: item.delta || 0,
          usuario: "sistema",
          cantidadRequerida: item.requerido || null,
          cantidadFaltante: item.faltante || null,
          observacion: item.observacion || null,
        });

        if (item.faltante > 0) {
          await insertAlertaConsumoProduccion(transaction, {
            numeroMovimiento: numeroAjuste,
            obra: grupo.obra,
            version: grupo.version,
            codigo,
            descripcion: item.descripcion,
            cantidadRequerida: item.requerido,
            cantidadAjustada: Math.abs(item.delta || 0),
            cantidadFaltante: item.faltante,
            motivo: item.observacion || "Consumo parcial",
            fechaLinea: item.fechaLinea ?? null,
          });
        }
      }

      for (const fallo of grupo.fallidos) {
        await insertDetalle(transaction, {
          ajusteId: numeroAjuste,
          cod: fallo.codigo || "SIN_CODIGO",
          desc: fallo.descripcion || "",
          cantidad: 0,
          usuario: "sistema",
          cantidadRequerida: fallo.requerido || null,
          cantidadFaltante: fallo.faltante || null,
          observacion: `Fila ${fallo.row}: ${fallo.motivo}`,
        });

        await insertAlertaConsumoProduccion(transaction, {
          numeroMovimiento: numeroAjuste,
          obra: grupo.obra,
          version: grupo.version,
          codigo: fallo.codigo || "SIN_CODIGO",
          descripcion: fallo.descripcion || "",
          cantidadRequerida: fallo.requerido || null,
          cantidadAjustada: fallo.ajustado || 0,
          cantidadFaltante: fallo.faltante || null,
          motivo: `Fila ${fallo.row}: ${fallo.motivo}`,
          fechaLinea: fallo.fechaLinea ?? null,
        });
      }

      ajustesCreados.push({
        numero_ajuste: numeroAjuste,
        obra: grupo.obra,
        version: grupo.version,
      });
    }

    const outputRows = [header, ...dataRows];

    workbook.Sheets.materiales = XLSX.utils.aoa_to_sheet(outputRows);

    const outputBuffer = XLSX.write(workbook, {
      type: "buffer",
      bookType: "xlsx",
    });

    await uploadOverwriteByPath(fileRef, outputBuffer);

    await transaction.commit();
    transaction = null;

    return {
      ok: true,
      ajustes: ajustesCreados,
      cantidad_ajustes: ajustesCreados.length,
      ajustados: itemsCorrectos.length,
      fallidos: itemsFallidos.length,
      resumen_fallidos: itemsFallidos,
    };
  } catch (err) {
    if (transaction) {
      try {
        await transaction.rollback();
      } catch {}
    }

    throw err;
  }
}

exports.consumirProduccionDropbox = async (_req, res) => {
  try {
    const result = await runConsumoProduccion();

    return res.json(result);
  } catch (err) {
    console.error("ajustes.consumirProduccionDropbox:", err);

    return res.status(500).json({
      error: "Error al consumir producción",
      detalle: err.message,
      status: err?.response?.status || null,
      dropbox: err?.response?.data || null,
    });
  }
};

// ========================================================
// ALERTAS
// ========================================================

exports.getAlertasConsumoPendientes = async (_req, res) => {
  try {
    await poolConnect;
    const pool = await getPool();

    const result = await pool.request().query(`
          SELECT TOP 200
            id_alerta,
            fecha,
            fecha_linea,
            numero_movimiento,
            obra,
            version,
            codigo,
            descripcion,
            cantidad_requerida,
            cantidad_ajustada,
            cantidad_faltante,
            motivo

          FROM dbo.consumo_produccion_alertas

          WHERE leida = 0

          ORDER BY
            fecha ASC,
            id_alerta ASC;
        `);

    return res.json(result.recordset || []);
  } catch (err) {
    console.error("ajustes.getAlertasConsumoPendientes:", err);

    return res.status(500).json({
      error: "Error al obtener alertas de consumo",
      detalle: err.message,
    });
  }
};

exports.marcarAlertasConsumoLeidas = async (req, res) => {
  try {
    const ids = Array.isArray(req.body?.ids)
      ? req.body.ids
          .map((id) => asInt(id))
          .filter(
            (id) =>
              Number.isFinite(id) &&
              id > 0,
          )
      : [];

    if (!ids.length) {
      return res.json({
        ok: true,
        afectados: 0,
      });
    }

    await poolConnect;
    const pool = await getPool();

    const request = pool.request();

    const parametros = ids.map((id, index) => {
      const nombre = `id${index}`;

      request.input(
        nombre,
        sql.Int,
        id,
      );

      return `@${nombre}`;
    });

    const result = await request.query(`
      DECLARE @AlertasSeleccionadas TABLE
      (
        id_alerta INT PRIMARY KEY,
        numero_movimiento INT
      );

      INSERT INTO @AlertasSeleccionadas
      (
        id_alerta,
        numero_movimiento
      )
      SELECT
        id_alerta,
        numero_movimiento
      FROM dbo.consumo_produccion_alertas
      WHERE id_alerta IN
      (
        ${parametros.join(",")}
      )
        AND leida = 0;

      /*
       * La alerta deja de estar pendiente.
       */
      UPDATE dbo.consumo_produccion_alertas
      SET leida = 1
      WHERE id_alerta IN
      (
        SELECT id_alerta
        FROM @AlertasSeleccionadas
      );

      /*
       * Se conserva cantidad_faltante.
       *
       * Solo se agrega una observación histórica.
       * DISTINCT evita repetir la leyenda cuando se
       * resuelven varias alertas del mismo movimiento.
       */
      UPDATE detalle
      SET observacion =
        CASE
          WHEN CHARINDEX(
            'Revisión resuelta manualmente',
            ISNULL(detalle.observacion, '')
          ) > 0
            THEN detalle.observacion

          ELSE CONCAT(
            ISNULL(detalle.observacion, ''),
            CASE
              WHEN ISNULL(detalle.observacion, '') = ''
                THEN ''
              ELSE ' - '
            END,
            'Revisión resuelta manualmente'
          )
        END

      FROM dbo.ajustes_detalles detalle

      INNER JOIN
      (
        SELECT DISTINCT numero_movimiento
        FROM @AlertasSeleccionadas
        WHERE numero_movimiento IS NOT NULL
      ) alerta
        ON alerta.numero_movimiento =
           detalle.ajuste_id;

      SELECT COUNT(*) AS afectados
      FROM @AlertasSeleccionadas;
    `);

    return res.json({
      ok: true,
      afectados: Number(
        result.recordset?.[0]?.afectados || 0,
      ),
    });
  } catch (err) {
    console.error(
      "ajustes.marcarAlertasConsumoLeidas:",
      err,
    );

    return res.status(500).json({
      error:
        "Error al marcar alertas como resueltas",
      detalle: err.message,
    });
  }
};

// BORRADORES
async function getNombreDeposito(pool, depositoId) {
  const id = asInt(depositoId);

  if (!Number.isFinite(id) || id <= 0) {
    return null;
  }

  const result = await pool.request().input("id", sql.Int, id).query(`
      SELECT TOP 1 nombre
      FROM dbo.depositos
      WHERE id_deposito = @id;
    `);

  return result.recordset[0]?.nombre || null;
}

async function getNombreMotivo(pool, motivoId) {
  const id = asInt(motivoId);

  if (!Number.isFinite(id) || id <= 0) {
    return null;
  }

  const result = await pool.request().input("id", sql.Int, id).query(`
      SELECT TOP 1 nombre
      FROM dbo.ajustes_motivos
      WHERE id_motivo = @id;
    `);

  return result.recordset[0]?.nombre || null;
}

exports.saveDraft = async (req, res) => {
  let transaction;

  try {
    await poolConnect;
    const pool = await getPool();

    const usuario = getUsuarioReq(req);

    const idBorradorRaw = req.body?.id_borrador;

    const idBorrador =
      idBorradorRaw === null ||
      idBorradorRaw === undefined ||
      String(idBorradorRaw).trim() === ""
        ? null
        : asInt(idBorradorRaw);

    const depositoIdRaw = req.body?.deposito_id;

    const depositoId =
      depositoIdRaw === null ||
      depositoIdRaw === undefined ||
      String(depositoIdRaw).trim() === ""
        ? null
        : asInt(depositoIdRaw);

    const motivoIdRaw = req.body?.motivo_id;

    const motivoId =
      motivoIdRaw === null ||
      motivoIdRaw === undefined ||
      String(motivoIdRaw).trim() === ""
        ? null
        : asInt(motivoIdRaw);

    const referenteIdRaw = req.body?.id_referente;

    const referenteId =
      referenteIdRaw === null ||
      referenteIdRaw === undefined ||
      String(referenteIdRaw).trim() === ""
        ? null
        : asInt(referenteIdRaw);

    const depositoNombre = await getNombreDeposito(pool, depositoId);

    const motivoNombre = await getNombreMotivo(pool, motivoId);

    const tipoAjuste = String(req.body?.tipo_ajuste || "INGRESO")
      .trim()
      .toUpperCase();

    const remitoReferencia = toDb(req.body?.remito_referencia);

    const fechaReal = toDb(req.body?.fecha_real);

    const obra = toDb(req.body?.obra);

    const version = toDb(req.body?.version);

    const items = Array.isArray(req.body?.items) ? req.body.items : [];

    transaction = new sql.Transaction(pool);

    await transaction.begin();

    let draftId = idBorrador;

    if (draftId) {
      const existe = await new sql.Request(transaction).input(
        "id",
        sql.Int,
        draftId,
      ).query(`
            SELECT TOP 1 id_borrador

            FROM dbo.ajustes_borradores

            WHERE id_borrador = @id;
          `);

      if (!existe.recordset.length) {
        draftId = null;
      }
    }

    if (!draftId) {
      const creado = await new sql.Request(transaction)
        .input("depositoId", sql.Int, depositoId)
        .input("deposito", sql.NVarChar(255), depositoNombre)
        .input("motivoId", sql.Int, motivoId)
        .input("motivo", sql.NVarChar(255), motivoNombre)
        .input("tipoAjuste", sql.VarChar(20), tipoAjuste)
        .input("remitoReferencia", sql.NVarChar(255), remitoReferencia)
        .input("referenteId", sql.Int, referenteId)
        .input("fechaReal", sql.Date, fechaReal)
        .input("obra", sql.NVarChar(200), obra)
        .input("version", sql.NVarChar(100), version)
        .input("usuario", sql.NVarChar(255), usuario).query(`
            INSERT INTO dbo.ajustes_borradores
            (
              deposito_id,
              deposito,
              motivo_id,
              motivo,
              tipo_ajuste,
              remito_referencia,
              id_referente,
              fecha_real,
              obra,
              version,
              usuario,
              fecha_creacion,
              fecha_actualizacion
            )
            VALUES
            (
              @depositoId,
              @deposito,
              @motivoId,
              @motivo,
              @tipoAjuste,
              @remitoReferencia,
              @referenteId,
              @fechaReal,
              @obra,
              @version,
              @usuario,
              GETDATE(),
              GETDATE()
            );

            SELECT
              SCOPE_IDENTITY()
              AS id_borrador;
          `);

      draftId = Number(creado.recordset[0].id_borrador);
    } else {
      await new sql.Request(transaction)
        .input("id", sql.Int, draftId)
        .input("depositoId", sql.Int, depositoId)
        .input("deposito", sql.NVarChar(255), depositoNombre)
        .input("motivoId", sql.Int, motivoId)
        .input("motivo", sql.NVarChar(255), motivoNombre)
        .input("tipoAjuste", sql.VarChar(20), tipoAjuste)
        .input("remitoReferencia", sql.NVarChar(255), remitoReferencia)
        .input("referenteId", sql.Int, referenteId)
        .input("fechaReal", sql.Date, fechaReal)
        .input("obra", sql.NVarChar(sql.MAX), obra)
        .input("version", sql.NVarChar(sql.MAX), version)
        .input("usuario", sql.NVarChar(255), usuario).query(`
          UPDATE dbo.ajustes_borradores
          SET
            deposito_id = @depositoId,
            deposito = @deposito,
            motivo_id = @motivoId,
            motivo = @motivo,
            tipo_ajuste = @tipoAjuste,
            remito_referencia = @remitoReferencia,
            id_referente = @referenteId,
            fecha_real = @fechaReal,
            obra = @obra,
            version = @version,
            usuario = @usuario,
            fecha_actualizacion = GETDATE()

          WHERE id_borrador = @id;
        `);

      await new sql.Request(transaction).input("id", sql.Int, draftId).query(`
          DELETE
          FROM dbo.ajustes_borradores_detalles
          WHERE id_borrador = @id;
        `);
    }

    for (let index = 0; index < items.length; index += 1) {
      const item = items[index] || {};

      const codigo = up(item.codigo) || "";

      const descripcion = String(item.descripcion || "").trim();

      const proveedor = String(item.proveedor || "").trim();

      const stock = String(item.stock ?? "").trim();

      const stockTotal = String(
        item.stock_total ?? item.stockTotal ?? "",
      ).trim();

      const ubicacion = String(item.ubicacion || "").trim();

      const idRecorteRaw = item.id_recorte;
      const idRecorte =
        idRecorteRaw === null ||
        idRecorteRaw === undefined ||
        String(idRecorteRaw).trim() === ""
          ? null
          : asInt(idRecorteRaw);

      const idUbicacionRaw = item.id_ubicacion;
      const idUbicacion =
        idUbicacionRaw === null ||
        idUbicacionRaw === undefined ||
        String(idUbicacionRaw).trim() === ""
          ? null
          : asInt(idUbicacionRaw);

      const cantidad = String(item.cantidad ?? "").trim();

      if (!codigo && !descripcion && !cantidad) {
        continue;
      }

      await new sql.Request(transaction)
        .input("idBorrador", sql.Int, draftId)
        .input("codigo", sql.NVarChar(100), codigo || null)
        .input("descripcion", sql.NVarChar(500), descripcion || null)
        .input("proveedor", sql.NVarChar(255), proveedor || null)
        .input("stock", sql.NVarChar(50), stock || null)
        .input("stockTotal", sql.NVarChar(50), stockTotal || null)
        .input("idRecorte", sql.Int, Number.isFinite(idRecorte) && idRecorte > 0 ? idRecorte : null)
        .input(
          "idUbicacion",
          sql.Int,
          Number.isFinite(idUbicacion) && idUbicacion > 0 ? idUbicacion : null,
        )
        .input("ubicacion", sql.NVarChar(100), ubicacion || null)
        .input("cantidad", sql.NVarChar(50), cantidad || null)
        .input("orden", sql.Int, index).query(`
          INSERT INTO dbo.ajustes_borradores_detalles
          (
            id_borrador,
            codigo,
            descripcion,
            proveedor,
            stock,
            stock_total,
            id_recorte,
            id_ubicacion,
            ubicacion,
            cantidad,
            orden
          )
          VALUES
          (
            @idBorrador,
            @codigo,
            @descripcion,
            @proveedor,
            @stock,
            @stockTotal,
            @idRecorte,
            @idUbicacion,
            @ubicacion,
            @cantidad,
            @orden
          );
        `);
    }

    await transaction.commit();

    return res.json({
      ok: true,
      id_borrador: draftId,
      message: "Borrador guardado",
    });
  } catch (err) {
    console.error("ajustes.saveDraft:", err);

    try {
      if (transaction) {
        await transaction.rollback();
      }
    } catch {}

    return res.status(500).json({
      error: "Error al guardar borrador",
      detalle: err.message,
    });
  }
};


exports.getDraftById = async (req, res) => {
  try {
    const id = asInt(req.params.id);

    if (!Number.isFinite(id) || id <= 0) {
      return res.status(400).json({
        error: "Borrador inválido",
      });
    }

    await poolConnect;
    const pool = await getPool();

    const cabecera = await pool.request().input("id", sql.Int, id).query(`
          SELECT
            b.*,
            r.nombre AS referente

          FROM dbo.ajustes_borradores b

          LEFT JOIN dbo.referentes r
            ON r.id_referente = b.id_referente

          WHERE b.id_borrador = @id;
        `);

    if (!cabecera.recordset.length) {
      return res.status(404).json({
        error: "Borrador no encontrado",
      });
    }

    const detalle = await pool.request().input("id", sql.Int, id).query(`
          SELECT
            codigo,
            descripcion,
            proveedor,
            stock,
            stock_total,
            id_recorte,
            id_ubicacion,
            ubicacion,
            cantidad

          FROM dbo.ajustes_borradores_detalles

          WHERE id_borrador = @id

          ORDER BY
            orden ASC,
            id_detalle ASC;
        `);

    return res.json({
      cabecera: cabecera.recordset[0],
      detalle: detalle.recordset || [],
    });
  } catch (err) {
    console.error("ajustes.getDraftById:", err);

    return res.status(500).json({
      error: "Error al obtener borrador",
      detalle: err.message,
    });
  }
};

exports.deleteDraft = async (req, res) => {
  try {
    const id = asInt(req.params.id);

    if (!Number.isFinite(id) || id <= 0) {
      return res.status(400).json({
        error: "Borrador inválido",
      });
    }

    await poolConnect;
    const pool = await getPool();

    await pool.request().input("id", sql.Int, id).query(`
        DELETE
        FROM dbo.ajustes_borradores
        WHERE id_borrador = @id;
      `);

    return res.json({
      ok: true,
    });
  } catch (err) {
    console.error("ajustes.deleteDraft:", err);

    return res.status(500).json({
      error: "Error al eliminar borrador",
      detalle: err.message,
    });
  }
};

exports.confirmDraft = async (req, res) => {
  try {
    const id = asInt(req.params.id);

    if (!Number.isFinite(id) || id <= 0) {
      return res.status(400).json({
        error: "Borrador inválido",
      });
    }

    await poolConnect;
    const pool = await getPool();

    const cabecera = await pool.request().input("id", sql.Int, id).query(`
          SELECT *
          FROM dbo.ajustes_borradores
          WHERE id_borrador = @id;
        `);

    if (!cabecera.recordset.length) {
      return res.status(404).json({
        error: "Borrador no encontrado",
      });
    }

    const borrador = cabecera.recordset[0];

    const detalle = await pool.request().input("id", sql.Int, id).query(`
          SELECT
            codigo,
            descripcion,
            id_recorte,
            id_ubicacion,
            ubicacion,
            cantidad

          FROM dbo.ajustes_borradores_detalles

          WHERE id_borrador = @id

          ORDER BY
            orden ASC,
            id_detalle ASC;
        `);

    const items = (detalle.recordset || [])
      .map((item) => {
        const cantidad = Number(item.cantidad);

        if (!item.codigo || !Number.isFinite(cantidad) || cantidad <= 0) {
          return null;
        }

        return {
          cod_articulo: String(item.codigo).trim().toUpperCase(),

          id_recorte:
            item.id_recorte !== null &&
            item.id_recorte !== undefined &&
            Number.isFinite(Number(item.id_recorte))
              ? Number(item.id_recorte)
              : null,

          id_ubicacion:
            item.id_ubicacion !== null &&
            item.id_ubicacion !== undefined &&
            Number.isFinite(Number(item.id_ubicacion))
              ? Number(item.id_ubicacion)
              : null,

          ubicacion: String(item.ubicacion || "").trim(),

          cantidad:
            String(borrador.tipo_ajuste || "").toUpperCase() === "EGRESO"
              ? -Math.abs(cantidad)
              : Math.abs(cantidad),
        };
      })
      .filter(Boolean);

    if (!items.length) {
      return res.status(400).json({
        error: "El borrador no tiene ítems válidos para confirmar",
      });
    }

    req.body = {
      deposito_id: borrador.deposito_id,

      motivo_id: borrador.motivo_id,

      obra: borrador.obra,

      version: borrador.version,

      remito_referencia: borrador.remito_referencia,

      id_referente: borrador.id_referente,

      fecha_real: borrador.fecha_real,

      items,
    };

    /*
     * Intercepta la respuesta de create
     * para borrar el borrador únicamente
     * cuando el ajuste fue creado.
     */
    const jsonOriginal = res.json.bind(res);

    const statusOriginal = res.status.bind(res);

    let statusCode = 200;
    let payload = null;

    res.status = (code) => {
      statusCode = code;
      return res;
    };

    res.json = (body) => {
      payload = body;
      return res;
    };

    await exports.create(req, res);

    res.status = statusOriginal;
    res.json = jsonOriginal;

    if (statusCode >= 400) {
      return res.status(statusCode).json(payload);
    }

    await pool.request().input("id", sql.Int, id).query(`
        DELETE
        FROM dbo.ajustes_borradores
        WHERE id_borrador = @id;
      `);

    return res.status(statusCode).json(payload);
  } catch (err) {
    console.error("ajustes.confirmDraft:", err);

    return res.status(500).json({
      error: "Error al confirmar borrador",
      detalle: err.message,
    });
  }
};


// ========================================================
// REVERSIÓN DE MOVIMIENTOS POR REFERENCIA
// ========================================================
async function getExistingTableName(executor, names) {
  const request =
    executor instanceof sql.Transaction
      ? new sql.Request(executor)
      : executor.request();

  names.forEach((name, index) => {
    request.input(`tabla${index}`, sql.NVarChar(128), name);
  });

  const parametros = names.map((_, index) => `@tabla${index}`).join(",");

  const orden = names
    .map((_, index) => `WHEN @tabla${index} THEN ${index}`)
    .join("\n");

  const result = await request.query(`
    SELECT TOP 1 name
    FROM sys.objects
    WHERE type = 'U'
      AND name IN (${parametros})
    ORDER BY
      CASE name
        ${orden}
        ELSE 999
      END;
  `);

  return result.recordset[0]?.name || null;
}

function createDbRequest(executor) {
  return executor instanceof sql.Transaction
    ? new sql.Request(executor)
    : executor.request();
}

async function getEfectosPorReferencia(
  executor, 
  referencia, 
  tablasReversion = null,
) {
  const efectos = [];

  const tablas =
    tablasReversion ||
    (await getTablasReversion(executor));
  
   const {
    transferenciaDetalle,
    ajusteDetalle,
    ajustesTable,
    remitosTable,
    remitosDetalle,
  } = tablas;

  if (ajustesTable && ajusteDetalle) {
    const request = createDbRequest(executor).input(
      "referencia",
      sql.NVarChar(200),
      referencia,
    );

    const result = await request.query(`
      SELECT
        CAST(
          CASE
            WHEN ad.cantidad > 0
              THEN 'AJUSTE (Ingreso)'
            WHEN ad.cantidad < 0
              THEN 'AJUSTE (Egreso)'
            ELSE 'AJUSTE'
          END
          AS VARCHAR(50)
        ) AS tipo_original,

        CAST(
          a.numero_ajuste AS VARCHAR(50)
        ) AS numero_original,

        CONVERT(
          date,
          ISNULL(a.fecha_real, a.fecha)
        ) AS fecha_real,

        CAST(
          a.deposito AS VARCHAR(255)
        ) AS deposito,

        CAST(
          ad.cod_articulo AS VARCHAR(100)
        ) AS codigo,

        CAST(
          ad.descripcion AS VARCHAR(500)
        ) AS descripcion,

        CAST(
          ad.cantidad AS INT
        ) AS cantidad_original,

        CAST(
          -ad.cantidad AS INT
        ) AS cantidad_reversion,

        CAST(
          a.remito_referencia AS VARCHAR(255)
        ) AS referencia,

        CAST(
          ref.nombre AS VARCHAR(255)
        ) AS referente,

        a.id_referente

      FROM dbo.${ajustesTable} a

      JOIN dbo.${ajusteDetalle} ad
        ON ad.ajuste_id = a.numero_ajuste

      LEFT JOIN dbo.referentes ref
        ON ref.id_referente = a.id_referente

      WHERE
        a.remito_referencia = @referencia

        AND UPPER(
          LTRIM(
            RTRIM(
              ISNULL(a.motivo, '')
            )
          )
        ) NOT IN
        (
          'REVERSIÓN DE REFERENCIA',
          'REVERSION DE REFERENCIA'
        );
    `);

    efectos.push(...(result.recordset || []));
  }

  // ------------------------------------------------------
  // TRANSFERENCIAS
  // Una transferencia genera dos efectos:
  // origen negativo y destino positivo.
  // ------------------------------------------------------

  if (transferenciaDetalle) {
    const request = createDbRequest(executor).input(
      "referencia",
      sql.NVarChar(200),
      referencia,
    );

    const result = await request.query(`
      SELECT
        CAST(
          'TRANSFERENCIA' AS VARCHAR(50)
        ) AS tipo_original,

        CAST(
          t.numero_transferencia AS VARCHAR(50)
        ) AS numero_original,

        CONVERT(
          date,
          ISNULL(t.fecha_real, t.fecha)
        ) AS fecha_real,

        CAST(
          t.origen AS VARCHAR(255)
        ) AS deposito,

        CAST(
          a.codigo AS VARCHAR(100)
        ) AS codigo,

        CAST(
          a.descripcion AS VARCHAR(500)
        ) AS descripcion,

        CAST(
          -ABS(td.cantidad) AS INT
        ) AS cantidad_original,

        CAST(
          ABS(td.cantidad) AS INT
        ) AS cantidad_reversion,

        CAST(
          t.remito_referencia AS VARCHAR(255)
        ) AS referencia,

        CAST(
          ref.nombre AS VARCHAR(255)
        ) AS referente,

        t.id_referente

      FROM dbo.transferencias t

      JOIN dbo.${transferenciaDetalle} td
        ON td.transferencia_id = t.id

      JOIN dbo.articulos a
        ON a.id_articulo = td.articulo_id

      LEFT JOIN dbo.referentes ref
        ON ref.id_referente = t.id_referente

      WHERE
        t.remito_referencia = @referencia
      UNION ALL

      SELECT
        CAST(
          'TRANSFERENCIA' AS VARCHAR(50)
        ) AS tipo_original,

        CAST(
          t.numero_transferencia AS VARCHAR(50)
        ) AS numero_original,

        CONVERT(
          date,
          ISNULL(t.fecha_real, t.fecha)
        ) AS fecha_real,

        CAST(
          t.destino AS VARCHAR(255)
        ) AS deposito,

        CAST(
          a.codigo AS VARCHAR(100)
        ) AS codigo,

        CAST(
          a.descripcion AS VARCHAR(500)
        ) AS descripcion,

        CAST(
          ABS(td.cantidad) AS INT
        ) AS cantidad_original,

        CAST(
          -ABS(td.cantidad) AS INT
        ) AS cantidad_reversion,

        CAST(
          t.remito_referencia AS VARCHAR(255)
        ) AS referencia,

        CAST(
          ref.nombre AS VARCHAR(255)
        ) AS referente,

        t.id_referente

      FROM dbo.transferencias t

      JOIN dbo.${transferenciaDetalle} td
        ON td.transferencia_id = t.id

      JOIN dbo.articulos a
        ON a.id_articulo = td.articulo_id

      LEFT JOIN dbo.referentes ref
        ON ref.id_referente = t.id_referente

      WHERE
  t.remito_referencia = @referencia;
    `);

    efectos.push(...(result.recordset || []));
  }

  // ------------------------------------------------------
  // REMITOS
  // ------------------------------------------------------

  if (remitosTable && remitosDetalle) {
    const request = createDbRequest(executor).input(
      "referencia",
      sql.NVarChar(200),
      referencia,
    );

    const result = await request.query(`
      SELECT
        CAST(
          CASE
            WHEN UPPER(
              LTRIM(
                RTRIM(
                  ISNULL(r.tipo, '')
                )
              )
            ) = 'SALIDA'
              THEN 'REMITO (Egreso)'
            ELSE 'REMITO (Ingreso)'
          END
          AS VARCHAR(50)
        ) AS tipo_original,

        CAST(
          r.numero_transaccion AS VARCHAR(50)
        ) AS numero_original,

        CONVERT(
          date,
          r.fecha
        ) AS fecha_real,

        CAST(
          r.deposito_nombre AS VARCHAR(255)
        ) AS deposito,

        CAST(
          rd.cod_articulo AS VARCHAR(100)
        ) AS codigo,

        CAST(
          rd.descripcion AS VARCHAR(500)
        ) AS descripcion,

        CAST(
          CASE
            WHEN UPPER(
              LTRIM(
                RTRIM(
                  ISNULL(r.tipo, '')
                )
              )
            ) = 'SALIDA'
              THEN -ABS(rd.cantidad)
            ELSE ABS(rd.cantidad)
          END AS INT
        ) AS cantidad_original,

        CAST(
          CASE
            WHEN UPPER(
              LTRIM(
                RTRIM(
                  ISNULL(r.tipo, '')
                )
              )
            ) = 'SALIDA'
              THEN ABS(rd.cantidad)
            ELSE -ABS(rd.cantidad)
          END AS INT
        ) AS cantidad_reversion,

        CAST(
          r.numero_remito AS VARCHAR(255)
        ) AS referencia,

        CAST(
          NULL AS VARCHAR(255)
        ) AS referente,

        CAST(
          NULL AS INT
        ) AS id_referente

      FROM dbo.${remitosTable} r

      JOIN dbo.${remitosDetalle} rd
        ON rd.remito_id = r.numero_remito

      WHERE
        UPPER(
          LTRIM(
            RTRIM(
              CAST(
                r.numero_remito AS VARCHAR(255)
              )
            )
          )
        ) =
        UPPER(
          LTRIM(
            RTRIM(@referencia)
          )
        );
    `);

    efectos.push(...(result.recordset || []));
  }

  return efectos
  .map((row, index) => {
    const tipoOriginal = String(
      row.tipo_original || "",
    )
      .trim()
      .toUpperCase();

    const numeroOriginal = String(
      row.numero_original || "",
    ).trim();

    const deposito = String(
      row.deposito || "",
    )
      .trim()
      .toUpperCase();

    const codigo = String(
      row.codigo || "",
    )
      .trim()
      .toUpperCase();

    const cantidadOriginal = Number(
      row.cantidad_original || 0,
    );

    const cantidadReversion = Number(
      row.cantidad_reversion || 0,
    );

    /*
     * El índice se agrega para diferenciar líneas repetidas
     * dentro de una misma transacción.
     */
    const idMovimientoOriginal = [
      tipoOriginal,
      numeroOriginal,
      deposito,
      codigo,
      cantidadOriginal,
      index,
    ].join("|");

    return {
      ...row,

      id_movimiento_original:
        idMovimientoOriginal,

      cantidad_original:
        cantidadOriginal,

      cantidad_reversion:
        cantidadReversion,

      id_referente:
        row.id_referente == null
          ? null
          : Number(row.id_referente),
    };
  })
  .filter(
    (row) =>
      row.codigo &&
      row.deposito &&
      row.cantidad_reversion !== 0,
  );
}

async function getTablasReversion(executor) {
  const transferenciaDetalle =
    await getExistingTableName(executor, [
      "transferencias_detalle",
      "transferencia_detalles",
      "transferencias_detalles",
    ]);

  const ajusteDetalle =
    await getExistingTableName(executor, [
      "ajustes_detalles",
      "ajuste_detalles",
    ]);

  const ajustesTable =
    await getExistingTableName(executor, [
      "ajustes",
    ]);

  const remitosTable =
    await getExistingTableName(executor, [
      "remitos",
    ]);

  const remitosDetalle =
    await getExistingTableName(executor, [
      "remitos_detalles",
    ]);

  return {
    transferenciaDetalle,
    ajusteDetalle,
    ajustesTable,
    remitosTable,
    remitosDetalle,
  };
}

async function consumirStockReversion(
  transaction,
  { depositoId, articuloId, cantidad },
) {
  let restante = Number(cantidad);

  const result = await new sql.Request(transaction)
    .input("depositoId", sql.Int, depositoId)
    .input("articuloId", sql.Int, articuloId).query(`
        SELECT
          s.id_stock,
          s.cantidad,
          s.id_ubicacion,
          u.nombre AS ubicacion

        FROM dbo.stock s
        WITH (UPDLOCK, HOLDLOCK)

        LEFT JOIN dbo.ubicaciones u
          ON u.id_ubicacion = s.id_ubicacion

        WHERE
          s.id_deposito = @depositoId
          AND s.id_articulo = @articuloId
          AND s.cantidad > 0

        ORDER BY
          CASE
            WHEN UPPER(
              LTRIM(
                RTRIM(
                  ISNULL(u.nombre, '')
                )
              )
            ) = 'GENERAL'
              THEN 0
            ELSE 1
          END,

          s.id_ubicacion,
          s.id_stock;
      `);

  for (const row of result.recordset || []) {
    if (restante <= 0) {
      break;
    }

    const disponible = Number(row.cantidad || 0);

    const tomar = Math.min(disponible, restante);

    if (tomar <= 0) {
      continue;
    }

    const update = await new sql.Request(transaction)
      .input("idStock", sql.Int, Number(row.id_stock))
      .input("cantidad", sql.Int, tomar).query(`
          UPDATE dbo.stock
          SET cantidad = cantidad - @cantidad
          WHERE id_stock = @idStock
            AND cantidad >= @cantidad;

          SELECT @@ROWCOUNT AS affected;
        `);

    if (Number(update.recordset?.[0]?.affected || 0) !== 1) {
      throw new Error(
        "El stock cambió durante la reversión. Volvé a intentar.",
      );
    }

    restante -= tomar;
  }

  if (restante > 0) {
    throw new Error(`Stock insuficiente. Faltan ${restante} unidades.`);
  }
}

// ========================================================
// PREVISUALIZAR REVERSIÓN
// ========================================================

async function procesarReferenciasEnLotes(
  referencias,
  cantidadPorLote,
  callback,
) {
  const resultados = [];

  for (
    let inicio = 0;
    inicio < referencias.length;
    inicio += cantidadPorLote
  ) {
    const lote = referencias.slice(
      inicio,
      inicio + cantidadPorLote,
    );

    const resultadosLote = await Promise.all(
      lote.map(callback),
    );

    for (const resultado of resultadosLote) {
      if (Array.isArray(resultado)) {
        resultados.push(...resultado);
      }
    }
  }

  return resultados;
}

async function obtenerIdsYaRevertidos(
  poolOrTransaction,
  idsMovimientos,
) {
  const ids = [
    ...new Set(
      (idsMovimientos || [])
        .map((id) => String(id || "").trim())
        .filter(Boolean),
    ),
  ];

  const idsRevertidos = new Set();

  if (!ids.length) {
    return idsRevertidos;
  }

  /*
   * SQL Server admite un máximo aproximado de 2100 parámetros.
   * Usamos bloques de 500 para mantener un margen seguro.
   */
  const cantidadPorLote = 500;

  for (
    let inicio = 0;
    inicio < ids.length;
    inicio += cantidadPorLote
  ) {
    const lote = ids.slice(
      inicio,
      inicio + cantidadPorLote,
    );

    const request = new sql.Request(
      poolOrTransaction,
    );

    const parametros = lote.map((id, index) => {
      const nombre = `idMovimiento${index}`;

      request.input(
        nombre,
        sql.NVarChar(600),
        id,
      );

      return `@${nombre}`;
    });

    const result = await request.query(`
      SELECT id_movimiento_original
      FROM dbo.ajustes_reversiones_detalles
      WHERE id_movimiento_original IN
      (
        ${parametros.join(",")}
      );
    `);

    for (const fila of result.recordset || []) {
      const id = String(
        fila.id_movimiento_original || "",
      ).trim();

      if (id) {
        idsRevertidos.add(id);
      }
    }
  }

  return idsRevertidos;
}

exports.buscarMovimientosParaReversion = async (req, res) => {
  const inicioProceso = Date.now();

  try {
    const modo = String(req.query?.modo || "")
      .trim()
      .toLowerCase();

    const referencia = String(
      req.query?.referencia || "",
    ).trim();

    const obra = String(req.query?.obra || "").trim();

    const version = String(
      req.query?.version || "",
    ).trim();

    if (
      !["referencia", "obra_version"].includes(
        modo,
      )
    ) {
      return res.status(400).json({
        error: "Modo de búsqueda inválido",
      });
    }

    if (
      modo === "referencia" &&
      !referencia
    ) {
      return res.status(400).json({
        error: "Debe indicar una referencia",
      });
    }

    if (
      modo === "obra_version" &&
      (!obra || !version)
    ) {
      return res.status(400).json({
        error: "Debe indicar obra y versión",
      });
    }

    await poolConnect;
    const pool = await getPool();

    const tablasReversion = await getTablasReversion(pool);
    let movimientos = [];

    if (modo === "referencia") {
      movimientos =
        await getEfectosPorReferencia(
          pool,
          referencia,
          tablasReversion,
        );
    } else {
      /*
       * Gracias al índice IX_ajustes_obra_version,
       * esta consulta puede localizar directamente
       * los ajustes de la obra y la versión.
       */
      const referenciasResult = await pool
        .request()
        .input(
          "obra",
          sql.NVarChar(200),
          obra,
        )
        .input(
          "version",
          sql.NVarChar(100),
          version,
        )
        .query(`
          SELECT DISTINCT
            remito_referencia
          FROM dbo.ajustes
          WHERE obra = @obra
            AND version = @version
            AND remito_referencia IS NOT NULL
            AND remito_referencia <> '';
        `);

      const referencias = [
        ...new Set(
          (
            referenciasResult.recordset ||
            []
          )
            .map((fila) =>
              String(
                fila.remito_referencia ||
                  "",
              ).trim(),
            )
            .filter(Boolean),
        ),
      ];

      if (!referencias.length) {
        return res.status(404).json({
          error:
            "No se encontraron referencias para esa obra y versión",
        });
      }

      movimientos =
        await procesarReferenciasEnLotes(
          referencias,
          15,
          async (
            referenciaEncontrada,
          ) => {
            const encontrados =
              await getEfectosPorReferencia(
                pool,
                referenciaEncontrada,
                tablasReversion,
              );

            return encontrados.map(
              (movimiento) => ({
                ...movimiento,

                referencia_busqueda:
                  referenciaEncontrada,
              }),
            );
          },
        );
    }

    /*
     * Eliminamos eventuales duplicados.
     */
    const movimientosUnicos = [];
    const idsEncontrados = new Set();

    for (const movimiento of movimientos) {
      const id = String(
        movimiento.id_movimiento_original ||
          "",
      ).trim();

      if (!id) {
        continue;
      }

      if (idsEncontrados.has(id)) {
        continue;
      }

      idsEncontrados.add(id);

      movimientosUnicos.push({
        ...movimiento,

        id_movimiento_original: id,
      });
    }

    if (!movimientosUnicos.length) {
      return res.status(404).json({
        error:
          modo === "referencia"
            ? "No se encontraron movimientos para esa referencia"
            : "No se encontraron movimientos para esa obra y versión",
      });
    }

    /*
     * Consultamos únicamente los IDs que aparecieron
     * en esta búsqueda.
     *
     * Antes se descargaba la tabla completa de
     * ajustes_reversiones_detalles.
     */
    const idsRevertidos =
      await obtenerIdsYaRevertidos(
        pool,
        movimientosUnicos.map(
          (movimiento) =>
            movimiento.id_movimiento_original,
        ),
      );

    const movimientosDisponibles =
      movimientosUnicos.map(
        (movimiento) => ({
          ...movimiento,

          ya_revertido:
            idsRevertidos.has(
              movimiento.id_movimiento_original,
            ),
        }),
      );

    const tiempoMs =
      Date.now() - inicioProceso;

    console.log(
      [
        "Búsqueda de reversión:",
        `modo=${modo}`,
        `movimientos=${movimientosDisponibles.length}`,
        `revertidos=${idsRevertidos.size}`,
        `tiempo=${tiempoMs}ms`,
      ].join(" "),
    );

    return res.json({
      modo,

      referencia:
        modo === "referencia"
          ? referencia
          : null,

      obra:
        modo === "obra_version"
          ? obra
          : null,

      version:
        modo === "obra_version"
          ? version
          : null,

      cantidad_movimientos:
        movimientosDisponibles.length,

      cantidad_disponibles:
        movimientosDisponibles.filter(
          (movimiento) =>
            !movimiento.ya_revertido,
        ).length,

      tiempo_ms: tiempoMs,

      movimientos:
        movimientosDisponibles,
    });
  } catch (err) {
    console.error(
      "ajustes.buscarMovimientosParaReversion:",
      err,
    );

    return res.status(500).json({
      error:
        "Error al buscar movimientos para reversión",

      detalle: err.message,
    });
  }
};

// ========================================================
// CONFIRMAR REVERSIÓN
// ========================================================

exports.revertirReferencia = async (req, res) => {
  const modo = String(
    req.body?.modo || "",
  )
    .trim()
    .toLowerCase();

  const referencia = String(
    req.body?.referencia || "",
  ).trim();

  const obra = String(
    req.body?.obra || "",
  ).trim();

  const version = String(
    req.body?.version || "",
  ).trim();

  const confirmar =
    req.body?.confirmar === true;

  const movimientosSeleccionados =
    Array.isArray(req.body?.movimientos)
      ? req.body.movimientos
          .map((id) =>
            String(id || "").trim(),
          )
          .filter(Boolean)
      : [];

  const motivoUsuario = toDb(
    req.body?.motivo,
  );

  const usuario = getUsuarioReq(req);

  if (
    !["referencia", "obra_version"].includes(
      modo,
    )
  ) {
    return res.status(400).json({
      error: "Modo de reversión inválido",
    });
  }

  if (
    modo === "referencia" &&
    !referencia
  ) {
    return res.status(400).json({
      error: "Debe indicar una referencia",
    });
  }

  if (
    modo === "obra_version" &&
    (!obra || !version)
  ) {
    return res.status(400).json({
      error: "Debe indicar obra y versión",
    });
  }

  if (!confirmar) {
    return res.status(400).json({
      error:
        "La reversión requiere confirmar: true",
    });
  }

  if (!movimientosSeleccionados.length) {
    return res.status(400).json({
      error:
        "Debe seleccionar al menos un movimiento para revertir",
    });
  }

  let transaction;

  try {
    await poolConnect;
    const pool = await getPool();

    transaction = new sql.Transaction(pool);

    await transaction.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);
    const tablasReversion =
      await getTablasReversion(transaction);

    let todosLosMovimientos = [];

if (modo === "referencia") {
  todosLosMovimientos =
    await getEfectosPorReferencia(
      transaction,
      referencia,
      tablasReversion,
    );
} else {
  const referenciasResult =
    await new sql.Request(transaction)
      .input(
        "obra",
        sql.NVarChar(200),
        obra,
      )
      .input(
        "version",
        sql.NVarChar(100),
        version,
      )
      .query(`
        SELECT DISTINCT
          remito_referencia
        FROM dbo.ajustes
        WHERE obra = @obra
          AND version = @version
          AND remito_referencia IS NOT NULL
          AND remito_referencia <> '';
      `);

  const referencias = [
    ...new Set(
      (referenciasResult.recordset || [])
        .map((fila) =>
          String(
            fila.remito_referencia || "",
          ).trim(),
        )
        .filter(Boolean),
    ),
  ];

  todosLosMovimientos = [];
  for (const referenciaEncontrada of referencias) {
    const movimientosReferencia =
      await getEfectosPorReferencia(
        transaction,
        referenciaEncontrada,
        tablasReversion,
      );

    todosLosMovimientos.push(
      ...movimientosReferencia,
    );
  }
}

const seleccionadosSet = new Set(
  movimientosSeleccionados,
);

const movimientos =
  todosLosMovimientos.filter(
    (movimiento) =>
      seleccionadosSet.has(
        String(
          movimiento.id_movimiento_original,
        ),
      ),
  );

if (!movimientos.length) {
      await transaction.rollback();

      return res.status(404).json({
        error: "No se encontraron movimientos para esa referencia",
      });
    }

    const requestRevertidos =
  new sql.Request(transaction);

const parametrosRevertidos =
  movimientos.map(
    (_, index) =>
      `@movimiento${index}`,
  );

movimientos.forEach(
  (movimiento, index) => {
    requestRevertidos.input(
      `movimiento${index}`,
      sql.NVarChar(600),
      movimiento.id_movimiento_original,
    );
  },
);

const revertidosResult =
  await requestRevertidos.query(`
    SELECT
      id_movimiento_original

    FROM dbo.ajustes_reversiones_detalles
    WITH (UPDLOCK, HOLDLOCK)

    WHERE id_movimiento_original IN
    (
      ${parametrosRevertidos.join(",")}
    );
  `);

if (revertidosResult.recordset.length) {
  await transaction.rollback();

  return res.status(409).json({
    error:
      "Uno o más movimientos seleccionados ya fueron revertidos",

    movimientos:
      revertidosResult.recordset,
  });
}

    const motivoId = await getMotivoIdByNombreActivo(
      transaction,
      "REVERSIÓN DE REFERENCIA",
    );

    if (!motivoId) {
      throw new Error(
        'Falta el motivo interno "REVERSIÓN DE REFERENCIA". Ejecutá el SQL.',
      );
    }

    const depositosResult = await new sql.Request(transaction).query(`
            SELECT
              id_deposito,
              nombre

            FROM dbo.depositos
            WITH (UPDLOCK, HOLDLOCK);
          `);

    const depositoPorNombre = new Map(
      (depositosResult.recordset || []).map((row) => [
        normalizarMotivoSistema(row.nombre),

        {
          id: Number(row.id_deposito),

          nombre: String(row.nombre || ""),
        },
      ]),
    );

    const codigos = [
      ...new Set(movimientos.map((row) => up(row.codigo)).filter(Boolean)),
    ];

    const requestArticulos = new sql.Request(transaction);

    const parametros = codigos.map((_, index) => `@codigo${index}`).join(",");

    codigos.forEach((codigo, index) => {
      requestArticulos.input(`codigo${index}`, sql.VarChar(100), codigo);
    });

    const articulosResult = await requestArticulos.query(`
          SELECT
            id_articulo,

            UPPER(
              LTRIM(
                RTRIM(codigo)
              )
            ) AS codigo,

            descripcion

          FROM dbo.articulos
          WITH (UPDLOCK, HOLDLOCK)

          WHERE
            UPPER(
              LTRIM(
                RTRIM(codigo)
              )
            ) IN (${parametros});
        `);

    const articuloPorCodigo = new Map(
      (articulosResult.recordset || []).map((row) => [
        String(row.codigo),

        {
          id: Number(row.id_articulo),

          descripcion: String(row.descripcion || ""),
        },
      ]),
    );

    const faltanCodigos = codigos.filter(
      (codigo) => !articuloPorCodigo.has(codigo),
    );

    if (faltanCodigos.length) {
      throw new Error(`Códigos inexistentes: ${faltanCodigos.join(", ")}`);
    }

    const agrupados = new Map();

    for (const movimiento of movimientos) {
      const deposito = depositoPorNombre.get(
        normalizarMotivoSistema(movimiento.deposito),
      );

      if (!deposito) {
        throw new Error(`Depósito inexistente: ${movimiento.deposito}`);
      }

      const codigo = up(movimiento.codigo);

      const clave = `${deposito.id}|${codigo}`;

      const actual = agrupados.get(clave) || {
        deposito,
        codigo,

        descripcion: movimiento.descripcion || "",

        delta: 0,
        fuentes: [],
      };

      actual.delta += Number(movimiento.cantidad_reversion || 0);

      actual.fuentes.push(movimiento);

      agrupados.set(clave, actual);
    }

    const gruposAplicables = [...agrupados.values()].filter(
      (grupo) => grupo.delta !== 0,
    );

    const faltantes = [];

    for (const grupo of gruposAplicables) {
      if (grupo.delta >= 0) {
        continue;
      }

      const articulo = articuloPorCodigo.get(grupo.codigo);

      const disponible = await getStockActual(transaction, {
        depositoId: grupo.deposito.id,

        articuloId: articulo.id,

        ubicacionId: null,
      });

      const requerido = Math.abs(grupo.delta);

      if (disponible < requerido) {
        faltantes.push({
          deposito: grupo.deposito.nombre,

          codigo: grupo.codigo,

          requerido,
          disponible,
        });
      }
    }

    if (faltantes.length) {
      await transaction.rollback();

      return res.status(400).json({
        error: "No se puede revertir porque falta stock",

        faltantes,
      });
    }

    const insertReversion = await new sql.Request(transaction)
      .input("referencia", sql.NVarChar(255), referencia)
      .input("usuario", sql.NVarChar(255), usuario)
      .input("motivo", sql.NVarChar(500), motivoUsuario).query(`
            INSERT INTO dbo.ajustes_reversiones
            (
              referencia_original,
              fecha_reversion,
              usuario,
              motivo,
              estado
            )
            OUTPUT
              INSERTED.id_reversion
            VALUES
            (
              @referencia,
              GETDATE(),
              @usuario,
              @motivo,
              'CONFIRMADA'
            );
          `);

    const idReversion = Number(insertReversion.recordset[0].id_reversion);

    const porDeposito = new Map();

    for (const grupo of gruposAplicables) {
      if (!porDeposito.has(grupo.deposito.id)) {
        porDeposito.set(grupo.deposito.id, {
          deposito: grupo.deposito,

          items: [],
        });
      }

      porDeposito.get(grupo.deposito.id).items.push(grupo);
    }

    const ajustesGenerados = [];

    for (const bloque of porDeposito.values()) {
      const numeroResult = await new sql.Request(transaction).query(`
              SELECT
                ISNULL(
                  MAX(numero_ajuste),
                  0
                ) + 1 AS numero

              FROM dbo.ajustes
              WITH (UPDLOCK, HOLDLOCK);
            `);

      const numeroAjuste = Number(numeroResult.recordset[0].numero);

      const primerFuente = bloque.items[0]?.fuentes?.[0] || {};

      await new sql.Request(transaction)
        .input("numero", sql.Int, numeroAjuste)
        .input("deposito", sql.VarChar(255), bloque.deposito.nombre)
        .input("motivoId", sql.Int, motivoId)
        .input("motivo", sql.VarChar(255), "REVERSIÓN DE REFERENCIA")
        .input("referencia", sql.VarChar(255), `REVERSIÓN: ${referencia}`)
        .input("referenteId", sql.Int, primerFuente.id_referente || null)
        .input("usuario", sql.VarChar(255), usuario).query(`
            INSERT INTO dbo.ajustes
            (
              numero_ajuste,
              deposito,
              motivo_id,
              motivo,
              fecha,
              fecha_real,
              remito_referencia,
              id_referente,
              usuario
            )
            VALUES
            (
              @numero,
              @deposito,
              @motivoId,
              @motivo,
              GETDATE(),
              CONVERT(date, GETDATE()),
              @referencia,
              @referenteId,
              @usuario
            );
          `);

      const ubicacionDestino = await resolveUbicacionId(transaction, {
        depositoId: bloque.deposito.id,

        ubicacionId: null,
      });

      for (const grupo of bloque.items) {
        const articulo = articuloPorCodigo.get(grupo.codigo);

        await insertDetalle(transaction, {
          ajusteId: numeroAjuste,

          cod: grupo.codigo,

          desc: articulo.descripcion || grupo.descripcion,

          cantidad: grupo.delta,

          usuario,

          observacion: `Reversión automática de referencia ${referencia}`,
        });

        if (grupo.delta < 0) {
          await consumirStockReversion(transaction, {
            depositoId: bloque.deposito.id,

            articuloId: articulo.id,

            cantidad: Math.abs(grupo.delta),
          });
        } else {
          await upsertStockDelta(transaction, {
            depositoId: bloque.deposito.id,

            articuloId: articulo.id,

            ubicacionId: ubicacionDestino,

            delta: grupo.delta,
          });
        }

        for (const fuente of grupo.fuentes) {
          await new sql.Request(transaction)
  .input(
    "idReversion",
    sql.Int,
    idReversion,
  )
  .input(
    "numeroAjuste",
    sql.Int,
    numeroAjuste,
  )
  .input(
    "tipoOriginal",
    sql.NVarChar(50),
    fuente.tipo_original,
  )
  .input(
    "numeroOriginal",
    sql.NVarChar(50),
    fuente.numero_original,
  )
  .input(
    "deposito",
    sql.NVarChar(255),
    fuente.deposito,
  )
  .input(
    "codigo",
    sql.NVarChar(100),
    fuente.codigo,
  )
  .input(
    "cantidadOriginal",
    sql.Int,
    fuente.cantidad_original,
  )
  .input(
    "cantidadReversion",
    sql.Int,
    fuente.cantidad_reversion,
  )
  .input(
    "idMovimientoOriginal",
    sql.NVarChar(600),
    fuente.id_movimiento_original,
  )
  .query(`
    INSERT INTO dbo.ajustes_reversiones_detalles
    (
      id_reversion,
      numero_ajuste_generado,
      tipo_original,
      numero_transaccion_original,
      deposito,
      codigo,
      cantidad_original,
      cantidad_reversion,
      id_movimiento_original
    )
    VALUES
    (
      @idReversion,
      @numeroAjuste,
      @tipoOriginal,
      @numeroOriginal,
      @deposito,
      @codigo,
      @cantidadOriginal,
      @cantidadReversion,
      @idMovimientoOriginal
    );
  `);
        }
      }

      ajustesGenerados.push({
        numero_ajuste: numeroAjuste,

        deposito: bloque.deposito.nombre,
      });
    }

    await transaction.commit();

    return res.status(201).json({
      ok: true,

      message: "Referencia revertida correctamente",

      id_reversion: idReversion,

      referencia,

      ajustes_generados: ajustesGenerados,
    });
  } catch (err) {
    console.error("ajustes.revertirReferencia:", err);

    try {
      if (transaction) {
        await transaction.rollback();
      }
    } catch {}

    if (Number(err?.number) === 2601 || Number(err?.number) === 2627) {
      return res.status(409).json({
        error: "Uno de los movimientos seleccionados ya fue revertido",
      });
    }

    return res.status(500).json({
      error: "Error al revertir la referencia",

      detalle: err.message,
    });
  }
};

// STOCK DE ARTÍCULO POR UBICACIÓN

exports.getStockArticuloUbicaciones = async (req, res) => {
  try {
    const codigo = String(req.query?.codigo || "").trim().toUpperCase();

    const depositoId = asInt(req.query?.deposito_id);

    const ubicacionRaw = req.query?.id_ubicacion;

    const ubicacionSolicitada =
      ubicacionRaw === undefined ||
      ubicacionRaw === null ||
      String(ubicacionRaw).trim() === ""
        ? null
        : asInt(ubicacionRaw);

    if (!codigo) {
      return res.status(400).json({
        error: "Debe indicar el código del artículo.",
      });
    }

    if (!Number.isInteger(depositoId) || depositoId <= 0) {
      return res.status(400).json({
        error: "Debe indicar un depósito válido.",
      });
    }

    if (
      ubicacionSolicitada !== null &&
      (!Number.isInteger(ubicacionSolicitada) ||
        ubicacionSolicitada <= 0)
    ) {
      return res.status(400).json({
        error: "La ubicación indicada no es válida.",
      });
    }

    await poolConnect;
    const pool = await getPool();

    // Buscar artículo
    const articuloResult = await pool
      .request()
      .input("codigo", sql.VarChar(100), codigo)
      .query(`
        SELECT TOP 1
          id_articulo,
          codigo,
          descripcion
        FROM dbo.articulos
        WHERE UPPER(LTRIM(RTRIM(codigo))) = @codigo;
      `);

    if (!articuloResult.recordset.length) {
      return res.status(404).json({
        error: "Artículo no encontrado.",
      });
    }

    const articulo = articuloResult.recordset[0];
    const articuloId = Number(articulo.id_articulo);

    // Verificar depósito
    const depositoResult = await pool
      .request()
      .input("depositoId", sql.Int, depositoId)
      .query(`
        SELECT TOP 1
          id_deposito,
          nombre
        FROM dbo.depositos
        WHERE id_deposito = @depositoId;
      `);

    if (!depositoResult.recordset.length) {
      return res.status(404).json({
        error: "Depósito no encontrado.",
      });
    }

    // Traer todas las ubicaciones activas del depósito, incluyendo aquellas donde el artículo tiene stock 0

    const ubicacionesResult = await pool
      .request()
      .input("depositoId", sql.Int, depositoId)
      .input("articuloId", sql.Int, articuloId)
      .query(`
        SELECT
          u.id_ubicacion,
          u.nombre,
          CAST(
            ISNULL(
              SUM(
                CASE
                  WHEN s.id_articulo = @articuloId
                    THEN s.cantidad
                  ELSE 0
                END
              ),
              0
            )
            AS DECIMAL(18, 2)
          ) AS stock_ubicacion
        FROM dbo.ubicaciones u

        LEFT JOIN dbo.stock s
          ON s.id_ubicacion = u.id_ubicacion
          AND s.id_deposito = u.id_deposito
          AND s.id_articulo = @articuloId

        WHERE u.id_deposito = @depositoId
          AND u.activa = 1

        GROUP BY
          u.id_ubicacion,
          u.nombre

        ORDER BY
          stock_ubicacion DESC,
          u.nombre ASC,
          u.id_ubicacion ASC;
      `);

    const ubicaciones = (ubicacionesResult.recordset || []).map(
      (ubicacion) => ({
        id_ubicacion: Number(ubicacion.id_ubicacion),
        nombre: String(ubicacion.nombre || ""),
        stock_ubicacion: Number(ubicacion.stock_ubicacion || 0),
      })
    );

    if (!ubicaciones.length) {
      return res.status(400).json({
        error: "El depósito no tiene ubicaciones activas.",
      });
    }

    // Stock total del artículo dentro del depósito
    const stockDepositoResult = await pool
      .request()
      .input("depositoId", sql.Int, depositoId)
      .input("articuloId", sql.Int, articuloId)
      .query(`
        SELECT
          CAST(ISNULL(SUM(cantidad), 0) AS DECIMAL(18, 2))
            AS stock_deposito
        FROM dbo.stock
        WHERE id_deposito = @depositoId
          AND id_articulo = @articuloId;
      `);

    const stockDeposito = Number(
      stockDepositoResult.recordset?.[0]?.stock_deposito || 0
    );

    // Stock total del artículo en todos los depósitos
    const stockTotalResult = await pool
      .request()
      .input("articuloId", sql.Int, articuloId)
      .query(`
        SELECT
          CAST(ISNULL(SUM(cantidad), 0) AS DECIMAL(18, 2))
            AS stock_total
        FROM dbo.stock
        WHERE id_articulo = @articuloId;
      `);

    const stockTotal = Number(
      stockTotalResult.recordset?.[0]?.stock_total || 0
    );

    let ubicacionSeleccionada = null;
    let empate = false;
    let ubicacionesEmpatadas = [];

    // Si el usuario cambió manualmente la ubicación, devolver exactamente el stock de esa ubicación
    if (ubicacionSolicitada !== null) {
      ubicacionSeleccionada = ubicaciones.find(
        (ubicacion) =>
          ubicacion.id_ubicacion === ubicacionSolicitada
      );

      if (!ubicacionSeleccionada) {
        return res.status(400).json({
          error: "La ubicación no pertenece al depósito seleccionado.",
        });
      }
    } else {
      const stockMaximo = Math.max(
        ...ubicaciones.map(
          (ubicacion) => Number(ubicacion.stock_ubicacion || 0)
        )
      );

      const ubicacionesConMaximo = ubicaciones.filter(
        (ubicacion) =>
          Number(ubicacion.stock_ubicacion || 0) === stockMaximo
      );

      /*
       * Solo se considera empate cuando existe stock real.
       * Si todas las ubicaciones tienen stock 0, se utiliza
       * GENERAL o la primera ubicación activa.
       */
      if (
        stockMaximo > 0 &&
        ubicacionesConMaximo.length > 1
      ) {
        empate = true;
        ubicacionesEmpatadas = ubicacionesConMaximo;
      } else if (stockMaximo > 0) {
        ubicacionSeleccionada = ubicacionesConMaximo[0];
      } else {
        ubicacionSeleccionada =
          ubicaciones.find(
            (ubicacion) =>
              String(ubicacion.nombre || "")
                .trim()
                .toUpperCase() === "GENERAL"
          ) || ubicaciones[0];
      }
    }

    return res.json({
      codigo: articulo.codigo,
      descripcion: articulo.descripcion,

      stock_deposito: stockDeposito,
      stock_total: stockTotal,

      id_ubicacion:
        ubicacionSeleccionada?.id_ubicacion ?? null,

      ubicacion_nombre:
        ubicacionSeleccionada?.nombre ?? "",

      stock_ubicacion:
        ubicacionSeleccionada?.stock_ubicacion ?? null,

      empate,
      ubicaciones_empatadas: ubicacionesEmpatadas,
      ubicaciones,
    });
  } catch (error) {
    console.error(
      "ajustes.getStockArticuloUbicaciones:",
      error
    );

    return res.status(500).json({
      error: "Error al consultar el stock por ubicación.",
      detalle: error.message,
    });
  }
};


// ========================================================
// OPCIONES DE CÓDIGOS CONCATENADOS DE STOCK RECORTES
// ========================================================
exports.getOpcionesRecortes = async (req, res) => {
  try {
    const codigoBase = String(req.params?.codigoBase || "")
      .trim()
      .toUpperCase();

    if (!codigoBase) {
      return res.status(400).json({
        error: "Debe indicar un código base.",
      });
    }

    await poolConnect;
    const pool = await getPool();

    const result = await pool
      .request()
      .input("codigoBase", sql.VarChar(150), codigoBase)
      .query(`
        SELECT
          r.id_recorte,
          UPPER(LTRIM(RTRIM(r.codigo))) AS codigo,
          r.descripcion,
          r.medida,
          ISNULL(SUM(sr.cantidad), 0) AS stock_total
        FROM dbo.recortes r
        LEFT JOIN dbo.stock_recortes sr
          ON sr.id_recorte = r.id_recorte
        WHERE r.activo = 1
          AND (
            UPPER(LTRIM(RTRIM(r.codigo))) = @codigoBase
            OR UPPER(LTRIM(RTRIM(r.codigo))) LIKE @codigoBase + '[_]%'
          )
        GROUP BY
          r.id_recorte,
          r.codigo,
          r.descripcion,
          r.medida
        ORDER BY
          CASE
            WHEN UPPER(LTRIM(RTRIM(r.codigo))) = @codigoBase THEN 0
            ELSE 1
          END,
          r.codigo;
      `);

    return res.json(result.recordset || []);
  } catch (error) {
    console.error("getOpcionesRecortes:", error);

    return res.status(500).json({
      error: "No se pudieron buscar los códigos concatenados de Stock Recortes.",
      detalle: error.message,
    });
  }
};

exports._runConsumoProduccion = runConsumoProduccion;
