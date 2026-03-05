// backend/controllers/stock.js
const { sql, poolConnect, getPool } = require("../db");

const norm = (v) => String(v ?? "").trim().toUpperCase();

// Normaliza nombre de clasificación => key camelCase sin tildes ni símbolos
const clasifKey = (nombre) => {
  const s = String(nombre ?? "")
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // saca tildes
    .replace(/[.,/]/g, "")           // saca . , /
    .replace(/\s+/g, " ");           // colapsa espacios

  const parts = s.split(" ").filter(Boolean);
  if (!parts.length) return "";

  return parts
    .map((p, i) => {
      const low = p.toLowerCase();
      return i === 0 ? low : low.charAt(0).toUpperCase() + low.slice(1);
    })
    .join("");
};

exports.getAll = async (_req, res) => {
  try {
    await poolConnect;
    const pool = await getPool();

    // 1) Base por artículo + total
    const baseRs = await pool.request().query(`
      SET NOCOUNT ON;

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
    const depRs = await pool.request().query(`
      SET NOCOUNT ON;

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

    // 3) ✅ Traer SOLO las 3 clasificaciones activas del recuento por artículo
    //    (lo hacemos por ID y por nombre para estar cubiertos)
    const clasRs = await pool.request().query(`
      SET NOCOUNT ON;

      SELECT
        ac.id_articulo,
        c.id_clasificacion,
        LTRIM(RTRIM(c.nombre)) AS nombre,
        ac.valor
      FROM dbo.articulo_clasificaciones ac WITH (NOLOCK)
      INNER JOIN dbo.clasificaciones c WITH (NOLOCK)
        ON c.id_clasificacion = ac.id_clasificacion
      WHERE c.activa = 1
        AND c.id_clasificacion IN (64, 65, 66);
    `);

    // map id_articulo -> { categoriaRecuento, proximaFechaRecuento, recuentoSiNo }
    const recByArt = new Map();

    for (const r of clasRs.recordset || []) {
      const id = Number(r.id_articulo);
      if (!recByArt.has(id)) recByArt.set(id, {});

      // el nombre viene con tildes/espacios -> lo pasamos a key limpia
      const key = clasifKey(r.nombre);

      // Queremos exactamente estas keys:
      // categoriaRecuento, proximaFechaRecuento, recuentoSiNo
      // Si por alguna razón el nombre cambia, lo “ajustamos” acá:
      let finalKey = key;
      if (finalKey === "categoriaRecuento") finalKey = "categoriaRecuento";
      if (finalKey === "proximaFechaRecuento") finalKey = "proximaFechaRecuento";
      if (finalKey === "recuentoSi/No") finalKey = "recuentoSi/No";

      // guardamos valor (string)
      recByArt.get(id)[finalKey] = r.valor ?? "";
    }

    // 4) Output final
    const out = rows.map((r) => {
      const id = Number(r.id_articulo);
      const deps = depByArt.get(id) || [];

      const depsConStock = deps.filter((d) => Number(d.cantidad || 0) !== 0);
      depsConStock.sort((a, b) => String(a.almacen).localeCompare(String(b.almacen)));

      const almacen_label = depsConStock.length
        ? depsConStock.map((d) => d.almacen).join(" / ")
        : "";

      const rec = recByArt.get(id) || {};

      return {
        codigo: r.codigo,
        descripcion: r.descripcion,
        folio: r.folio,
        proveedor: r.proveedor,
        punto_pedido: r.punto_pedido,
        tipo: r.tipo,

        // ✅ nuevas columnas desde clasificaciones
        categoriaRecuento: rec.categoriaRecuento ?? "",
        proximaFechaRecuento: rec.proximaFechaRecuento ?? "",
        recuentoSiNo: rec.recuentoSiNo ?? "",

        cantidad_total: Number(r.cantidad_total || 0),
        almacen_label,
        depositos: deps,
      };
    });

    return res.json(out);
  } catch (err) {
    console.error("Error en stock.getAll:", err);
    return res.status(500).json({ error: "Error al obtener stock", detalle: err.message });
  }
};

// =====================================================
// GET /stock/detalle
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
        SET NOCOUNT ON;

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
        SET NOCOUNT ON;

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

    return res.json(det.recordset || []);
  } catch (err) {
    console.error("Error en stock.getDetalle:", err);
    return res.status(500).json({ error: "Error al obtener detalle de stock", detalle: err.message });
  }
};