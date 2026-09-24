const { sql, poolConnect, getPool } = require("../db");

/* ============================================================
   FUNCIÓN AUXILIAR
   Verifica si una tabla realmente tiene una columna determinada
============================================================ */

async function existeColumna(pool, tabla, columna) {
  const resultado = await pool
    .request()
    .input("tabla", sql.NVarChar(128), tabla)
    .input("columna", sql.NVarChar(128), columna).query(`
      SELECT TOP 1 1 AS existe
      FROM sys.columns c
      INNER JOIN sys.tables t
        ON c.object_id = t.object_id
      INNER JOIN sys.schemas s
        ON t.schema_id = s.schema_id
      WHERE s.name = 'dbo'
        AND t.name = @tabla
        AND c.name = @columna;
    `);

  return resultado.recordset.length > 0;
}

/* ============================================================
   GET - LISTAR REFERENTES
============================================================ */

exports.getAll = async (_req, res) => {
  try {
    await poolConnect;

    const pool = await getPool();

    const r = await pool.request().query(`
      SELECT
        id_referente,
        nombre,
        activo
      FROM dbo.referentes
      ORDER BY
        activo DESC,
        nombre ASC;
    `);

    res.json(r.recordset || []);
  } catch (err) {
    console.error("referentes.getAll:", err);

    res.status(500).json({
      error: "Error al listar referentes",
      detalle: err.message,
    });
  }
};

/* ============================================================
   POST - CREAR REFERENTE
============================================================ */

exports.create = async (req, res) => {
  try {
    const nombre = String(req.body?.nombre ?? "").trim();

    if (!nombre) {
      return res.status(400).json({
        error: "Nombre obligatorio",
      });
    }

    await poolConnect;

    const pool = await getPool();

    const r = await pool.request().input("nombre", sql.VarChar(255), nombre)
      .query(`
        INSERT INTO dbo.referentes
        (
          nombre,
          activo
        )
        OUTPUT
          INSERTED.id_referente,
          INSERTED.nombre,
          INSERTED.activo
        VALUES
        (
          @nombre,
          1
        );
      `);

    const referente = r.recordset[0];

    res.status(201).json({
      ok: true,
      referente,
      id_referente: referente.id_referente,
    });
  } catch (err) {
    console.error("referentes.create:", err);

    // Nombre duplicado
    if (err.number === 2601 || err.number === 2627) {
      return res.status(409).json({
        error: "Ya existe un referente con ese nombre.",
        detalle: err.message,
      });
    }

    res.status(500).json({
      error: "Error al crear referente",
      detalle: err.message,
      numero: err.number,
    });
  }
};

/* ============================================================
   PUT - EDITAR / ACTIVAR / DESACTIVAR REFERENTE
============================================================ */

exports.update = async (req, res) => {
  try {
    const id = Number(req.params.id);

    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({
        error: "ID inválido",
      });
    }

    const body = req.body || {};

    const vieneNombre = Object.prototype.hasOwnProperty.call(body, "nombre");

    const vieneActivo = Object.prototype.hasOwnProperty.call(body, "activo");

    if (!vieneNombre && !vieneActivo) {
      return res.status(400).json({
        error: "No se recibió ningún dato para modificar.",
      });
    }

    let nombre = null;
    let activo = null;

    if (vieneNombre) {
      nombre = String(body.nombre ?? "").trim();

      if (!nombre) {
        return res.status(400).json({
          error: "Nombre inválido",
        });
      }
    }

    if (vieneActivo) {
      if (
        body.activo === true ||
        body.activo === 1 ||
        body.activo === "1" ||
        String(body.activo).toLowerCase() === "true"
      ) {
        activo = true;
      } else {
        activo = false;
      }
    }

    await poolConnect;

    const pool = await getPool();

    /*
      IMPORTANTE:

      SIEMPRE creamos @nombre y @activo.

      Antes vos solamente creabas el parámetro que venía,
      pero el SQL utilizaba ambos.

      Eso producía:
      "Must declare the scalar variable @a"
      o
      "Must declare the scalar variable @n"
    */

    const r = await pool
      .request()
      .input("id", sql.Int, id)
      .input("nombre", sql.VarChar(255), vieneNombre ? nombre : null)
      .input("activo", sql.Bit, vieneActivo ? activo : null).query(`
        UPDATE dbo.referentes
        SET
          nombre =
            CASE
              WHEN @nombre IS NOT NULL
                THEN @nombre
              ELSE nombre
            END,

          activo =
            CASE
              WHEN @activo IS NOT NULL
                THEN @activo
              ELSE activo
            END

        OUTPUT
          INSERTED.id_referente,
          INSERTED.nombre,
          INSERTED.activo

        WHERE id_referente = @id;
      `);

    if (!r.recordset || r.recordset.length === 0) {
      return res.status(404).json({
        error: "Referente no encontrado",
      });
    }

    res.json({
      ok: true,
      referente: r.recordset[0],
    });
  } catch (err) {
    console.error("referentes.update:", err);

    if (err.number === 2601 || err.number === 2627) {
      return res.status(409).json({
        error: "Ya existe un referente con ese nombre.",
        detalle: err.message,
      });
    }

    res.status(500).json({
      error: "Error al actualizar referente",
      detalle: err.message,
      numero: err.number,
    });
  }
};

/* ============================================================
   DELETE - BORRAR REFERENTE
============================================================ */

exports.delete = async (req, res) => {
  try {
    const id = Number(req.params.id);

    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({
        error: "ID inválido",
      });
    }

    await poolConnect;

    const pool = await getPool();

    /* --------------------------------------------------------
       Primero confirmamos que el referente exista
    -------------------------------------------------------- */

    const existe = await pool.request().input("id", sql.Int, id).query(`
        SELECT TOP 1
          id_referente,
          nombre,
          activo
        FROM dbo.referentes
        WHERE id_referente = @id;
      `);

    if (!existe.recordset.length) {
      return res.status(404).json({
        error: "Referente no encontrado",
      });
    }

    /* --------------------------------------------------------
       AJUSTES

       Solamente consultamos id_referente si la columna existe.
    -------------------------------------------------------- */

    const ajustesTieneReferente = await existeColumna(
      pool,
      "ajustes",
      "id_referente",
    );

    if (ajustesTieneReferente) {
      const usadoAjustes = await pool.request().input("id", sql.Int, id).query(`
          SELECT TOP 1 1 AS usado
          FROM dbo.ajustes
          WHERE id_referente = @id;
        `);

      if (usadoAjustes.recordset.length > 0) {
        return res.status(400).json({
          error:
            "No se puede eliminar porque el referente ya fue utilizado en ajustes. Podés desactivarlo.",
        });
      }
    }

    /* --------------------------------------------------------
       TRANSFERENCIAS
    -------------------------------------------------------- */

    const transferenciasTieneReferente = await existeColumna(
      pool,
      "transferencias",
      "id_referente",
    );

    if (transferenciasTieneReferente) {
      const usadoTransferencias = await pool.request().input("id", sql.Int, id)
        .query(`
          SELECT TOP 1 1 AS usado
          FROM dbo.transferencias
          WHERE id_referente = @id;
        `);

      if (usadoTransferencias.recordset.length > 0) {
        return res.status(400).json({
          error:
            "No se puede eliminar porque el referente ya fue utilizado en transferencias. Podés desactivarlo.",
        });
      }
    }

    /* --------------------------------------------------------
       BORRADO
    -------------------------------------------------------- */

    const r = await pool.request().input("id", sql.Int, id).query(`
        DELETE FROM dbo.referentes
        OUTPUT
          DELETED.id_referente,
          DELETED.nombre
        WHERE id_referente = @id;
      `);

    if (!r.recordset || r.recordset.length === 0) {
      return res.status(404).json({
        error: "Referente no encontrado",
      });
    }

    res.json({
      ok: true,
      eliminado: r.recordset[0],
    });
  } catch (err) {
    console.error("referentes.delete:", err);

    /*
      SQL Server error 547:
      existe una FK que está impidiendo borrar el registro.
    */

    if (err.number === 547) {
      return res.status(400).json({
        error:
          "No se puede eliminar este referente porque ya está siendo utilizado. Podés desactivarlo.",
        detalle: err.message,
      });
    }

    res.status(500).json({
      error: "Error al borrar referente",
      detalle: err.message,
      numero: err.number,
    });
  }
};
