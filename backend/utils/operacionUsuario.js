const { sql } = require("../db");

function normalizarTexto(valor) {
  return String(valor ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
}

function obtenerIdentidadesUsuario(req) {
  const email = String(req.user?.email || "").trim();
  const emailSinDominio = email.includes("@") ? email.split("@")[0] : email;

  return [
    req.user?.nombre,
    req.user?.displayName,
    req.user?.name,
    req.user?.username,
    req.user?.usuario,
    emailSinDominio,
  ]
    .map((valor) => String(valor ?? "").trim())
    .filter(Boolean)
    .filter((valor, indice, arreglo) => arreglo.indexOf(valor) === indice);
}

function obtenerNombreUsuario(req) {
  return obtenerIdentidadesUsuario(req)[0] || "";
}

async function resolverOperacionUsuario(pool, req) {
  // El JWT actual contiene principalmente sub + username.
  // Para poder comparar también contra usuarios.nombre y usuarios.email,
  // recuperamos esos datos desde la tabla usuarios usando req.user.sub.
  const identidades = [...obtenerIdentidadesUsuario(req)];

  const idUsuario = Number(req.user?.sub);

  if (Number.isInteger(idUsuario) && idUsuario > 0) {
    const usuarioResult = await pool
      .request()
      .input("idUsuario", sql.Int, idUsuario).query(`
        SELECT TOP 1
          username,
          nombre,
          email
        FROM dbo.usuarios WITH (NOLOCK)
        WHERE id_usuario = @idUsuario;
      `);

    const usuarioDb = usuarioResult.recordset?.[0];

    if (usuarioDb) {
      const emailDb = String(usuarioDb.email || "").trim();
      const emailDbSinDominio = emailDb.includes("@")
        ? emailDb.split("@")[0]
        : emailDb;

      identidades.push(usuarioDb.nombre, usuarioDb.username, emailDbSinDominio);
    }
  }

  const identidadesNormalizadas = [
    ...new Set(identidades.map(normalizarTexto).filter(Boolean)),
  ];

  if (!identidadesNormalizadas.length) {
    return null;
  }

  const result = await pool.request().query(`
    SELECT operacion
    FROM
    (
      SELECT
        LTRIM(RTRIM(nombre)) AS operacion
      FROM dbo.planificacion_operaciones WITH (NOLOCK)
      WHERE activa = 1
        AND nombre IS NOT NULL
        AND LTRIM(RTRIM(nombre)) <> ''

      UNION

      SELECT DISTINCT
        LTRIM(RTRIM(operacion)) AS operacion
      FROM dbo.ordenes_trabajo WITH (NOLOCK)
      WHERE tipo_ot <> 'INDIRECTO'
        AND operacion IS NOT NULL
        AND LTRIM(RTRIM(operacion)) <> ''
    ) operaciones
    ORDER BY operacion;
  `);

  const coincidencia = (result.recordset || []).find((fila) =>
    identidadesNormalizadas.includes(normalizarTexto(fila.operacion)),
  );

  return coincidencia
    ? String(coincidencia.operacion || "").trim() || null
    : null;
}

module.exports = {
  normalizarTexto,
  obtenerIdentidadesUsuario,
  obtenerNombreUsuario,
  resolverOperacionUsuario,
};
