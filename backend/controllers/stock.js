// backend/controllers/stock.js
const { sql, poolConnect, getPool } = require("../db");

const norm = (value) =>
  String(value ?? "")
    .trim()
    .toUpperCase();

// Normaliza nombre de clasificación:
// "Próxima fecha recuento" => "proximaFechaRecuento"
const clasifKey = (nombre) => {
  const texto = String(nombre ?? "")
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[.,/]/g, "")
    .replace(/\s+/g, " ");

  const partes = texto.split(" ").filter(Boolean);

  if (!partes.length) {
    return "";
  }

  return partes
    .map((parte, index) => {
      const minuscula = parte.toLowerCase();

      return index === 0
        ? minuscula
        : minuscula.charAt(0).toUpperCase() + minuscula.slice(1);
    })
    .join("");
};

// =====================================================
// GET /stock
// Devuelve todos los artículos con:
// - stock total
// - depósitos
// - ubicaciones dentro de cada depósito
// - clasificaciones de recuento
// =====================================================
exports.getAll = async (_req, res) => {
  try {
    await poolConnect;
    const pool = await getPool();

    // =====================================================
    // 1. ARTÍCULOS Y STOCK TOTAL
    // =====================================================
    const baseResult = await pool.request().query(`
      SET NOCOUNT ON;

      SELECT
        a.id_articulo,
        a.codigo,
        a.descripcion,
        a.folio,
        a.proveedor,
        a.punto_pedido,
        a.tipo,
        CAST(
          SUM(ISNULL(s.cantidad, 0))
          AS DECIMAL(18, 2)
        ) AS cantidad_total

      FROM dbo.articulos a WITH (NOLOCK)

      LEFT JOIN dbo.stock s WITH (NOLOCK)
        ON s.id_articulo = a.id_articulo

      GROUP BY
        a.id_articulo,
        a.codigo,
        a.descripcion,
        a.folio,
        a.proveedor,
        a.punto_pedido,
        a.tipo

      ORDER BY
        a.codigo;
    `);

    const articulos = baseResult.recordset || [];

    if (!articulos.length) {
      return res.json([]);
    }

    // =====================================================
    // 2. STOCK POR DEPÓSITO Y UBICACIÓN
    // Fuente oficial: dbo.stock
    // =====================================================
    const stockResult = await pool.request().query(`
      SET NOCOUNT ON;

      SELECT
        s.id_articulo,
        s.id_deposito,
        ISNULL(
          d.nombre,
          'SIN ALMACEN'
        ) AS almacen,

        s.id_ubicacion,
        ISNULL(
          u.nombre,
          'SIN UBICACION'
        ) AS ubicacion,

        CAST(
          SUM(ISNULL(s.cantidad, 0))
          AS DECIMAL(18, 2)
        ) AS cantidad,

        CAST(
          SUM(ISNULL(s.asignado, 0))
          AS DECIMAL(18, 2)
        ) AS asignado,

        CAST(
          SUM(
            ISNULL(
              s.disponible,
              ISNULL(s.cantidad, 0) -
              ISNULL(s.asignado, 0)
            )
          )
          AS DECIMAL(18, 2)
        ) AS disponible

      FROM dbo.stock s WITH (NOLOCK)

      LEFT JOIN dbo.depositos d WITH (NOLOCK)
        ON d.id_deposito = s.id_deposito

      LEFT JOIN dbo.ubicaciones u WITH (NOLOCK)
        ON u.id_ubicacion = s.id_ubicacion

      GROUP BY
        s.id_articulo,
        s.id_deposito,
        d.nombre,
        s.id_ubicacion,
        u.nombre

      ORDER BY
        s.id_articulo,
        d.nombre,
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
        u.nombre;
    `);

    // Mapa:
    // id_articulo => Map(id_deposito => depósito)
    const depositosPorArticulo = new Map();

    for (const fila of stockResult.recordset || []) {
      const articuloId = Number(fila.id_articulo);
      const depositoId = Number(fila.id_deposito);

      if (!depositosPorArticulo.has(articuloId)) {
        depositosPorArticulo.set(articuloId, new Map());
      }

      const mapaDepositos = depositosPorArticulo.get(articuloId);

      if (!mapaDepositos.has(depositoId)) {
        mapaDepositos.set(depositoId, {
          id_deposito: depositoId,
          almacen: fila.almacen,
          cantidad: 0,
          asignado: 0,
          disponible: 0,
          ubicaciones: [],
        });
      }

      const deposito = mapaDepositos.get(depositoId);

      const cantidad = Number(fila.cantidad || 0);
      const asignado = Number(fila.asignado || 0);
      const disponible = Number(fila.disponible || 0);

      deposito.cantidad += cantidad;
      deposito.asignado += asignado;
      deposito.disponible += disponible;

      deposito.ubicaciones.push({
        id_ubicacion: Number(fila.id_ubicacion),
        ubicacion: fila.ubicacion,
        nombre: fila.ubicacion,
        cantidad,
        asignado,
        disponible,
      });
    }

    // =====================================================
    // 3. CLASIFICACIONES DE RECUENTO
    // =====================================================
    const clasificacionesResult = await pool.request().query(`
        SET NOCOUNT ON;

        SELECT
          ac.id_articulo,
          c.id_clasificacion,
          LTRIM(
            RTRIM(c.nombre)
          ) AS nombre,
          ac.valor

        FROM dbo.articulo_clasificaciones ac
          WITH (NOLOCK)

        INNER JOIN dbo.clasificaciones c
          WITH (NOLOCK)
          ON c.id_clasificacion =
             ac.id_clasificacion

        WHERE c.activa = 1
          AND c.id_clasificacion
            IN (64, 65, 66);
      `);

    const recuentoPorArticulo = new Map();

    for (const fila of clasificacionesResult.recordset || []) {
      const articuloId = Number(fila.id_articulo);

      if (!recuentoPorArticulo.has(articuloId)) {
        recuentoPorArticulo.set(articuloId, {});
      }

      let clave = clasifKey(fila.nombre);

      if (clave === "recuentoSino" || clave === "recuentoSiNo") {
        clave = "recuentoSiNo";
      }

      if (clave === "categoriaRecuento") {
        clave = "categoriaRecuento";
      }

      if (clave === "proximaFechaRecuento") {
        clave = "proximaFechaRecuento";
      }

      if (clave) {
        recuentoPorArticulo.get(articuloId)[clave] = fila.valor ?? "";
      }
    }

    // =====================================================
    // 4. ARMAR RESPUESTA
    // =====================================================
    const resultado = articulos.map((articulo) => {
      const articuloId = Number(articulo.id_articulo);

      const mapaDepositos = depositosPorArticulo.get(articuloId);

      const depositos = mapaDepositos ? Array.from(mapaDepositos.values()) : [];

      // Mostrar solamente depósitos con stock,
      // asignado o disponible distinto de cero.
      const depositosConMovimiento = depositos.filter(
        (deposito) =>
          Number(deposito.cantidad || 0) !== 0 ||
          Number(deposito.asignado || 0) !== 0 ||
          Number(deposito.disponible || 0) !== 0,
      );

      depositosConMovimiento.sort((a, b) =>
        String(a.almacen).localeCompare(String(b.almacen), "es", {
          sensitivity: "base",
        }),
      );

      for (const deposito of depositosConMovimiento) {
        deposito.ubicaciones = deposito.ubicaciones
          .filter(
            (ubicacion) =>
              Number(ubicacion.cantidad || 0) !== 0 ||
              Number(ubicacion.asignado || 0) !== 0 ||
              Number(ubicacion.disponible || 0) !== 0,
          )
          .sort((a, b) => {
            const nombreA = String(a.ubicacion || "")
              .trim()
              .toUpperCase();

            const nombreB = String(b.ubicacion || "")
              .trim()
              .toUpperCase();

            if (nombreA === "GENERAL" && nombreB !== "GENERAL") {
              return -1;
            }

            if (nombreB === "GENERAL" && nombreA !== "GENERAL") {
              return 1;
            }

            return nombreA.localeCompare(nombreB, "es", {
              numeric: true,
              sensitivity: "base",
            });
          });
      }

      const almacenLabel = depositosConMovimiento.length
        ? depositosConMovimiento.map((deposito) => deposito.almacen).join(" / ")
        : "";

      const ubicacionesLabel = depositosConMovimiento
        .flatMap((deposito) =>
          deposito.ubicaciones.map(
            (ubicacion) => `${deposito.almacen} - ${ubicacion.ubicacion}`,
          ),
        )
        .join(" / ");

      const recuento = recuentoPorArticulo.get(articuloId) || {};

      return {
        id_articulo: articuloId,
        codigo: articulo.codigo,
        descripcion: articulo.descripcion,
        folio: articulo.folio,
        proveedor: articulo.proveedor,

        // Se conserva por compatibilidad.
        // Este campo pertenece a dbo.articulos.
        ubicacion: ubicacionesLabel,

        punto_pedido: articulo.punto_pedido,

        tipo: articulo.tipo,

        categoriaRecuento: recuento.categoriaRecuento ?? "",

        proximaFechaRecuento: recuento.proximaFechaRecuento ?? "",

        recuentoSiNo: recuento.recuentoSiNo ?? "",

        cantidad_total: Number(articulo.cantidad_total || 0),

        almacen_label: almacenLabel,

        ubicaciones_label: ubicacionesLabel,

        depositos: depositosConMovimiento,
      };
    });

    return res.json(resultado);
  } catch (err) {
    console.error("Error en stock.getAll:", err);

    return res.status(500).json({
      error: "Error al obtener stock",
      detalle: err.message,
    });
  }
};

// =====================================================
// GET /stock/detalle?codigo=...
// Devuelve depósito + ubicación.
// =====================================================
exports.getDetalle = async (req, res) => {
  const codigo = norm(req.query.codigo);

  if (!codigo) {
    return res.status(400).json({
      error: "Debe indicar ?codigo=...",
    });
  }

  try {
    await poolConnect;
    const pool = await getPool();

    const articuloResult = await pool
      .request()
      .input("codigo", sql.NVarChar(100), codigo).query(`
        SET NOCOUNT ON;

        SELECT TOP 1
          id_articulo,
          codigo,
          descripcion

        FROM dbo.articulos WITH (NOLOCK)

        WHERE UPPER(
          LTRIM(
            RTRIM(codigo)
          )
        ) = @codigo;
      `);

    if (!articuloResult.recordset.length) {
      return res.status(404).json({
        error: "Artículo no encontrado",
        codigo,
      });
    }

    const articulo = articuloResult.recordset[0];

    const articuloId = Number(articulo.id_articulo);

    const detalleResult = await pool
      .request()
      .input("articuloId", sql.Int, articuloId).query(`
        SET NOCOUNT ON;

        SELECT
          s.id_deposito,

          ISNULL(
            d.nombre,
            'SIN ALMACEN'
          ) AS almacen,

          s.id_ubicacion,

          ISNULL(
            u.nombre,
            'SIN UBICACION'
          ) AS ubicacion,

          CAST(
            SUM(ISNULL(s.cantidad, 0))
            AS DECIMAL(18, 2)
          ) AS cantidad,

          CAST(
            SUM(ISNULL(s.asignado, 0))
            AS DECIMAL(18, 2)
          ) AS asignado,

          CAST(
            SUM(
              ISNULL(
                s.disponible,
                ISNULL(s.cantidad, 0) -
                ISNULL(s.asignado, 0)
              )
            )
            AS DECIMAL(18, 2)
          ) AS disponible

        FROM dbo.stock s WITH (NOLOCK)

        LEFT JOIN dbo.depositos d
          WITH (NOLOCK)
          ON d.id_deposito =
             s.id_deposito

        LEFT JOIN dbo.ubicaciones u
          WITH (NOLOCK)
          ON u.id_ubicacion =
             s.id_ubicacion

        WHERE s.id_articulo =
              @articuloId

        GROUP BY
          s.id_deposito,
          d.nombre,
          s.id_ubicacion,
          u.nombre

        HAVING
          SUM(ISNULL(s.cantidad, 0)) <> 0
          OR
          SUM(ISNULL(s.asignado, 0)) <> 0
          OR
          SUM(
            ISNULL(
              s.disponible,
              ISNULL(s.cantidad, 0) -
              ISNULL(s.asignado, 0)
            )
          ) <> 0

        ORDER BY
          almacen,

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

          ubicacion;
      `);

    const detalle = (detalleResult.recordset || []).map((fila) => ({
      id_deposito: Number(fila.id_deposito),
      almacen: fila.almacen,
      deposito: fila.almacen,

      id_ubicacion: Number(fila.id_ubicacion),
      ubicacion: fila.ubicacion,

      cantidad: Number(fila.cantidad || 0),

      asignado: Number(fila.asignado || 0),

      disponible: Number(fila.disponible || 0),
    }));

    return res.json(detalle);
  } catch (err) {
    console.error("Error en stock.getDetalle:", err);

    return res.status(500).json({
      error: "Error al obtener detalle de stock",
      detalle: err.message,
    });
  }
};

// =====================================================
// GET /stock/necesidades-produccion
// Fuente oficial: dbo.stock
// No consulta dbo.stock_ubicaciones.
// =====================================================
exports.getNecesidadesProduccion = async (_req, res) => {
  try {
    await poolConnect;
    const pool = await getPool();

    const result = await pool.request().query(`
        SET NOCOUNT ON;

        ;WITH stockActual AS
        (
          SELECT
            s.id_articulo,
            s.id_deposito,
            s.id_ubicacion,

            CAST(
              SUM(ISNULL(s.cantidad, 0))
              AS DECIMAL(18, 4)
            ) AS stock_actual

          FROM dbo.stock s WITH (NOLOCK)

          GROUP BY
            s.id_articulo,
            s.id_deposito,
            s.id_ubicacion
        ),

        base AS
        (
          SELECT
            o.id AS orden_id,
            o.numero_orden,
            o.fecha,
            o.estado,
            o.modo_faltantes,

            producto.codigo
              AS producto_codigo,

            producto.descripcion
              AS producto_descripcion,

            material.codigo
              AS material_codigo,

            material.descripcion
              AS material_descripcion,

            ISNULL(
              material.tipo,
              ''
            ) AS material_categoria,

            CAST(
              ISNULL(
                detalle.cantidad,
                0
              )
              AS DECIMAL(18, 4)
            ) AS cantidad_requerida,

            CAST(
              ISNULL(
                detalle.cantidad_faltante,
                0
              )
              AS DECIMAL(18, 4)
            ) AS cantidad_faltante,

            detalle.reservado,
            detalle.estado_material,

            deposito.nombre
              AS deposito_origen,

            ISNULL(
              ubicacion.nombre,
              'GENERAL'
            ) AS ubicacion_origen,

            ISNULL(
              stockActual.stock_actual,
              0
            ) AS stock_actual,

            CASE
              WHEN o.estado = 'EN_PROCESO'
              THEN
                CASE
                  WHEN ISNULL(
                    stockActual.stock_actual,
                    0
                  ) <
                  ISNULL(
                    detalle.cantidad,
                    0
                  )
                  THEN
                    ISNULL(
                      detalle.cantidad,
                      0
                    )
                    -
                    ISNULL(
                      stockActual.stock_actual,
                      0
                    )
                  ELSE 0
                END

              WHEN
                o.estado = 'CONFIRMADA'
                AND ISNULL(
                  detalle.cantidad_faltante,
                  0
                ) > 0
              THEN
                CASE
                  WHEN ISNULL(
                    stockActual.stock_actual,
                    0
                  ) < 0
                  THEN ISNULL(
                    detalle.cantidad_faltante,
                    0
                  )
                  ELSE 0
                END

              ELSE 0
            END AS cantidad_a_ingresar

          FROM dbo.produccion_orden_detalles
            detalle WITH (NOLOCK)

          INNER JOIN dbo.produccion_ordenes
            o WITH (NOLOCK)
            ON o.id = detalle.orden_id

          LEFT JOIN dbo.articulos
            producto WITH (NOLOCK)
            ON producto.id_articulo =
               detalle.producto_id

          INNER JOIN dbo.articulos
            material WITH (NOLOCK)
            ON material.id_articulo =
               detalle.material_id

          LEFT JOIN dbo.depositos
            deposito WITH (NOLOCK)
            ON deposito.id_deposito =
               detalle.deposito_origen_id

          LEFT JOIN dbo.ubicaciones
            ubicacion WITH (NOLOCK)
            ON ubicacion.id_ubicacion =
               detalle.ubicacion_origen_id

          LEFT JOIN stockActual
            ON stockActual.id_articulo =
               detalle.material_id

           AND stockActual.id_deposito =
               detalle.deposito_origen_id

           AND
           (
             (
               stockActual.id_ubicacion
                 IS NULL
               AND
               detalle.ubicacion_origen_id
                 IS NULL
             )
             OR
             stockActual.id_ubicacion =
               detalle.ubicacion_origen_id
           )

          WHERE ISNULL(
            o.estado,
            'CONFIRMADA'
          ) IN (
            'CONFIRMADA',
            'EN_PROCESO'
          )
        )

        SELECT
          orden_id,
          numero_orden,
          fecha,
          estado,
          modo_faltantes,

          producto_codigo,
          producto_descripcion,

          material_codigo,
          material_descripcion,
          material_categoria,

          cantidad_requerida,
          cantidad_faltante,
          stock_actual,
          cantidad_a_ingresar,

          deposito_origen,
          ubicacion_origen,

          reservado,
          estado_material

        FROM base

        WHERE cantidad_a_ingresar > 0

        ORDER BY
          fecha DESC,
          orden_id DESC,
          material_codigo;
      `);

    return res.json(result.recordset || []);
  } catch (err) {
    console.error("Error en stock.getNecesidadesProduccion:", err);

    return res.status(500).json({
      error: "Error al obtener necesidades de producción",
      detalle: err.message,
    });
  }
};
