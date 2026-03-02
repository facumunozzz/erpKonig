// backend/controllers/stock.js
const { sql, poolConnect, getPool } = require("../db");

const norm = (v) => String(v ?? "").trim().toUpperCase();

exports.getAll = async (_req, res) => {
  try {
    await poolConnect;
    const pool = await getPool();

    // 1) Base por artículo + total (SUM de dbo.stock)
    //    (Si querés que el total salga de stock_ubicaciones, decime y lo cambiamos)
    const baseRs = await pool.request().query(`
      SELECT
        a.id_articulo,
        a.codigo,
        a.descripcion,
        a.folio,
        a.proveedor,
        a.punto_pedido,
        a.tipo,
        SUM(ISNULL(s.cantidad,0)) AS cantidad_total
      FROM dbo.articulos a WITH (NOLOCK)
      LEFT JOIN dbo.stock s WITH (NOLOCK)
        ON s.id_articulo = a.id_articulo
      GROUP BY
        a.id_articulo, a.codigo, a.descripcion, a.folio, a.proveedor, a.punto_pedido, a.tipo
      ORDER BY a.codigo;
    `);

    const rows = baseRs.recordset || [];
    if (!rows.length) return res.json([]);

    // 2) Depósitos por artículo (cantidad + ubicaciones)
    //    - cantidad: SUM(stock.cantidad) por depósito
    //    - ubicaciones: DISTINCT de ubicaciones con existencia (desde stock y stock_ubicaciones)
    const depRs = await pool.request().query(`
    ;WITH depCant AS (
      SELECT
        s.id_articulo,
        s.id_deposito,
        ISNULL(d.nombre,'SIN ALMACEN') AS almacen,
        SUM(ISNULL(s.cantidad,0)) AS cantidad
      FROM dbo.stock s WITH (NOLOCK)
      LEFT JOIN dbo.depositos d WITH (NOLOCK)
        ON d.id_deposito = s.id_deposito
      GROUP BY s.id_articulo, s.id_deposito, d.nombre
    ),
    ubis AS (
      -- ubicaciones desde stock
      SELECT DISTINCT
        s.id_articulo,
        s.id_deposito,
        ISNULL(d.nombre,'SIN ALMACEN') AS almacen,
        ISNULL(u.nombre,'GENERAL') AS ubicacion
      FROM dbo.stock s WITH (NOLOCK)
      LEFT JOIN dbo.depositos d WITH (NOLOCK)
        ON d.id_deposito = s.id_deposito
      LEFT JOIN dbo.ubicaciones u WITH (NOLOCK)
        ON u.id_ubicacion = s.id_ubicacion

      UNION

      -- ubicaciones desde stock_ubicaciones
      SELECT DISTINCT
        su.id_articulo,
        u.id_deposito,
        d.nombre AS almacen,
        u.nombre AS ubicacion
      FROM dbo.stock_ubicaciones su WITH (NOLOCK)
      INNER JOIN dbo.ubicaciones u WITH (NOLOCK)
        ON u.id_ubicacion = su.id_ubicacion
      INNER JOIN dbo.depositos d WITH (NOLOCK)
        ON d.id_deposito = u.id_deposito
    ),
    ubAgg AS (
      SELECT
        x.id_articulo,
        x.id_deposito,
        x.almacen,
        STUFF((
          SELECT ' / ' + y.ubicacion
          FROM ubis y
          WHERE y.id_articulo = x.id_articulo
            AND y.id_deposito = x.id_deposito
          ORDER BY y.ubicacion
          FOR XML PATH(''), TYPE
        ).value('.', 'nvarchar(max)'), 1, 3, '') AS ubicaciones
      FROM (
        SELECT DISTINCT id_articulo, id_deposito, almacen
        FROM ubis
      ) x
    )
    SELECT
      c.id_articulo,
      c.id_deposito,
      c.almacen,
      c.cantidad,
      ISNULL(u.ubicaciones,'') AS ubicaciones
    FROM depCant c
    LEFT JOIN ubAgg u
      ON u.id_articulo = c.id_articulo
    AND u.id_deposito = c.id_deposito
    ORDER BY c.id_articulo, c.almacen;
  `);

    // indexamos por id_articulo => depositos[]
    const depByArt = new Map();
    for (const d of depRs.recordset || []) {
      const id = Number(d.id_articulo);
      if (!depByArt.has(id)) depByArt.set(id, []);
      depByArt.get(id).push({
        id_deposito: Number(d.id_deposito),
        almacen: d.almacen,
        cantidad: Number(d.cantidad || 0),
        ubicaciones: String(d.ubicaciones || ""),
      });
    }

    const out = rows.map((r) => {
      const id = Number(r.id_articulo);
      return {
        codigo: r.codigo,
        descripcion: r.descripcion,
        folio: r.folio,
        proveedor: r.proveedor,
        punto_pedido: r.punto_pedido,
        tipo: r.tipo,
        cantidad_total: Number(r.cantidad_total || 0),
        depositos: depByArt.get(id) || [],
      };
    });

    res.json(out);
  } catch (err) {
    console.error("Error en stock.getAll:", err);
    res.status(500).json({ error: "Error al obtener stock", detalle: err.message });
  }
};

// =====================================================
// GET /stock/detalle (dejalo como lo tenías)
// =====================================================
exports.getDetalle = async (req, res) => {
  const codigo = norm(req.query.codigo);
  if (!codigo) return res.status(400).json({ error: "Debe indicar ?codigo=..." });

  try {
    await poolConnect;
    const pool = await getPool();

    const art = await pool
      .request()
      .input("codigo", sql.VarChar(80), codigo)
      .query(`
        SELECT TOP 1 id_articulo
        FROM dbo.articulos WITH (NOLOCK)
        WHERE UPPER(LTRIM(RTRIM(codigo))) = @codigo
      `);

    if (!art.recordset.length) {
      return res.status(404).json({ error: "Artículo no encontrado", codigo });
    }

    const idArticulo = art.recordset[0].id_articulo;

    const det = await pool
      .request()
      .input("idArt", sql.Int, idArticulo)
      .query(`
        ;WITH su AS (
          SELECT
            u.id_deposito,
            d.nombre AS almacen,
            u.nombre AS ubicacion,
            SUM(su.cantidad) AS cantidad_su
          FROM dbo.stock_ubicaciones su WITH (NOLOCK)
          INNER JOIN dbo.ubicaciones u WITH (NOLOCK)
            ON u.id_ubicacion = su.id_ubicacion
          INNER JOIN dbo.depositos d WITH (NOLOCK)
            ON d.id_deposito = u.id_deposito
          WHERE su.id_articulo = @idArt
          GROUP BY u.id_deposito, d.nombre, u.nombre
        ),
        sd AS (
          SELECT
            s.id_deposito,
            ISNULL(d.nombre,'SIN ALMACEN') AS almacen,
            ISNULL(u.nombre,'GENERAL') AS ubicacion,
            SUM(ISNULL(s.cantidad,0)) AS cantidad_sd
          FROM dbo.stock s WITH (NOLOCK)
          LEFT JOIN dbo.depositos d WITH (NOLOCK)
            ON d.id_deposito = s.id_deposito
          LEFT JOIN dbo.ubicaciones u WITH (NOLOCK)
            ON u.id_ubicacion = s.id_ubicacion
          WHERE s.id_articulo = @idArt
          GROUP BY s.id_deposito, d.nombre, u.nombre
        )
        SELECT
          COALESCE(sd.id_deposito, su.id_deposito) AS id_deposito,
          COALESCE(sd.almacen, su.almacen)         AS almacen,
          COALESCE(sd.ubicacion, su.ubicacion)     AS ubicacion,
          COALESCE(sd.cantidad_sd, su.cantidad_su) AS cantidad
        FROM sd
        FULL OUTER JOIN su
          ON su.id_deposito = sd.id_deposito
         AND su.ubicacion  = sd.ubicacion
        ORDER BY almacen, ubicacion;
      `);

    res.json(det.recordset || []);
  } catch (err) {
    console.error("Error en stock.getDetalle:", err);
    res.status(500).json({ error: "Error al obtener detalle de stock", detalle: err.message });
  }
};
