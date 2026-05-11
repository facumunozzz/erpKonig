// backend/controllers/stock.js
const { sql, poolConnect, getPool } = require("../db");

const norm = (v) => String(v ?? "").trim().toUpperCase();

// Normaliza nombre de clasificación => key camelCase sin tildes ni símbolos
const clasifKey = (nombre) => {
  const s = String(nombre ?? "")
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[.,/]/g, "")
    .replace(/\s+/g, " ");

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
    // IMPORTANTE: ubicacion viene desde dbo.articulos.
    const baseRs = await pool.request().query(`
      SET NOCOUNT ON;

      SELECT
        a.id_articulo,
        a.codigo,
        a.descripcion,
        a.folio,
        a.proveedor,
        a.ubicacion,
        a.punto_pedido,
        a.tipo,
        SUM(ISNULL(s.cantidad, 0)) AS cantidad_total
      FROM dbo.articulos a WITH (NOLOCK)
      LEFT JOIN dbo.stock s WITH (NOLOCK)
        ON s.id_articulo = a.id_articulo
      GROUP BY
        a.id_articulo,
        a.codigo,
        a.descripcion,
        a.folio,
        a.proveedor,
        a.ubicacion,
        a.punto_pedido,
        a.tipo
      ORDER BY a.codigo;
    `);

    const rows = baseRs.recordset || [];
    if (!rows.length) return res.json([]);

    // 2) Depósitos por artículo.
    // Ya no devolvemos ubicaciones por depósito.
    const depRs = await pool.request().query(`
      SET NOCOUNT ON;

      SELECT
        s.id_articulo,
        s.id_deposito,
        ISNULL(d.nombre, 'SIN ALMACEN') AS almacen,
        SUM(ISNULL(s.cantidad, 0)) AS cantidad
      FROM dbo.stock s WITH (NOLOCK)
      LEFT JOIN dbo.depositos d WITH (NOLOCK)
        ON d.id_deposito = s.id_deposito
      GROUP BY
        s.id_articulo,
        s.id_deposito,
        d.nombre
      ORDER BY
        s.id_articulo,
        almacen;
    `);

    const depByArt = new Map();

    for (const d of depRs.recordset || []) {
      const id = Number(d.id_articulo);

      if (!depByArt.has(id)) depByArt.set(id, []);

      depByArt.get(id).push({
        id_deposito: Number(d.id_deposito),
        almacen: d.almacen,
        cantidad: Number(d.cantidad || 0),
      });
    }

    // 3) Clasificaciones activas del recuento
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

    const recByArt = new Map();

    for (const r of clasRs.recordset || []) {
      const id = Number(r.id_articulo);
      if (!recByArt.has(id)) recByArt.set({});

      if (!recByArt.has(id)) recByArt.set(id, {});

      const key = clasifKey(r.nombre);

      let finalKey = key;

      if (finalKey === "categoriaRecuento") finalKey = "categoriaRecuento";
      if (finalKey === "proximaFechaRecuento") finalKey = "proximaFechaRecuento";
      if (
        finalKey === "recuentoSiNo" ||
        finalKey === "recuentoSino" ||
        finalKey === "recuentoSi/No"
      ) {
        finalKey = "recuentoSiNo";
      }

      recByArt.get(id)[finalKey] = r.valor ?? "";
    }

    // 4) Output final
    const out = rows.map((r) => {
      const id = Number(r.id_articulo);
      const deps = depByArt.get(id) || [];

      const depsConStock = deps.filter((d) => Number(d.cantidad || 0) !== 0);

      depsConStock.sort((a, b) =>
        String(a.almacen).localeCompare(String(b.almacen))
      );

      const almacen_label = depsConStock.length
        ? depsConStock.map((d) => d.almacen).join(" / ")
        : "";

      const rec = recByArt.get(id) || {};

      return {
        id_articulo: id,
        codigo: r.codigo,
        descripcion: r.descripcion,
        folio: r.folio,
        proveedor: r.proveedor,
        ubicacion: r.ubicacion ?? "",
        punto_pedido: r.punto_pedido,
        tipo: r.tipo,

        categoriaRecuento: rec.categoriaRecuento ?? "",
        proximaFechaRecuento: rec.proximaFechaRecuento ?? "",
        recuentoSiNo: rec.recuentoSiNo ?? "",

        cantidad_total: Number(r.cantidad_total || 0),
        almacen_label,
        depositos: depsConStock,
      };
    });

    return res.json(out);
  } catch (err) {
    console.error("Error en stock.getAll:", err);
    return res.status(500).json({
      error: "Error al obtener stock",
      detalle: err.message,
    });
  }
};

// =====================================================
// GET /stock/detalle
// Ahora devuelve SOLO depósitos, no ubicaciones.
// =====================================================
exports.getDetalle = async (req, res) => {
  const codigo = norm(req.query.codigo);

  if (!codigo) {
    return res.status(400).json({ error: "Debe indicar ?codigo=..." });
  }

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
      return res.status(404).json({
        error: "Artículo no encontrado",
        codigo,
      });
    }

    const idArticulo = Number(art.recordset[0].id_articulo);

    const det = await pool
      .request()
      .input("idArt", sql.Int, idArticulo)
      .query(`
        SET NOCOUNT ON;

        SELECT
          s.id_deposito,
          ISNULL(d.nombre, 'SIN ALMACEN') AS almacen,
          SUM(ISNULL(s.cantidad, 0)) AS cantidad
        FROM dbo.stock s WITH (NOLOCK)
        LEFT JOIN dbo.depositos d WITH (NOLOCK)
          ON d.id_deposito = s.id_deposito
        WHERE s.id_articulo = @idArt
        GROUP BY
          s.id_deposito,
          d.nombre
        HAVING SUM(ISNULL(s.cantidad, 0)) <> 0
        ORDER BY almacen;
      `);

    return res.json(det.recordset || []);
  } catch (err) {
    console.error("Error en stock.getDetalle:", err);
    return res.status(500).json({
      error: "Error al obtener detalle de stock",
      detalle: err.message,
    });
  }
};