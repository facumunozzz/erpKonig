const { sql } = require("../db");

/**
 * Oculta las cards de cadenas productivas completamente terminadas.
 *
 * Una cadena se considera COMPLETA cuando:
 * 1) todas sus OTs PRODUCTIVAS están FINALIZADAS; y
 * 2) su última OT productiva (la hoja de la cadena) fabricó toda la cantidad pedida.
 *
 * Esto evita ocultar una OT finalizada parcialmente mientras exista una
 * continuación pendiente por faltante.
 *
 * Cuando una cadena queda completa también se ocultan los INDIRECTOS
 * vinculados a esas OTs que ya estén FINALIZADOS.
 *
 * Los indirectos independientes (id_ot_origen IS NULL) NO se tocan aquí.
 */
async function ocultarOrdenesFinalizadasCompletas(pool) {
  let transaction;

  try {
    transaction = new sql.Transaction(pool);
    await transaction.begin();

    const result = await new sql.Request(transaction).query(`
      SET NOCOUNT ON;

      DECLARE @Productivas TABLE
      (
        id_ot INT NOT NULL PRIMARY KEY,
        id_ot_raiz INT NOT NULL,
        id_ot_origen INT NULL,
        estado VARCHAR(20) NOT NULL,
        cantidad_pedida DECIMAL(18,4) NOT NULL,
        cantidad_fabricada DECIMAL(18,4) NOT NULL,
        mostrar BIT NOT NULL
      );

      INSERT INTO @Productivas
      (
        id_ot,
        id_ot_raiz,
        id_ot_origen,
        estado,
        cantidad_pedida,
        cantidad_fabricada,
        mostrar
      )
      SELECT
        ot.id_ot,
        COALESCE(ot.id_ot_raiz, ot.id_ot) AS id_ot_raiz,
        ot.id_ot_origen,
        UPPER(LTRIM(RTRIM(ISNULL(ot.estado, '')))) AS estado,
        CONVERT(DECIMAL(18,4), ISNULL(ot.cantidad_pedida, 0)),
        CONVERT(DECIMAL(18,4), ISNULL(ot.cantidad_fabricada, 0)),
        CONVERT(BIT, ISNULL(ot.mostrar, 1))
      FROM dbo.ordenes_trabajo ot WITH (UPDLOCK, HOLDLOCK)
      WHERE UPPER(LTRIM(RTRIM(ISNULL(ot.tipo_ot, 'PRODUCTIVA')))) = 'PRODUCTIVA';

      DECLARE @CadenasCompletas TABLE
      (
        id_ot_raiz INT NOT NULL PRIMARY KEY
      );

      INSERT INTO @CadenasCompletas (id_ot_raiz)
      SELECT DISTINCT
        base.id_ot_raiz
      FROM @Productivas base
      WHERE
        -- Ningún tramo productivo puede seguir pendiente, en proceso o pausado.
        NOT EXISTS
        (
          SELECT 1
          FROM @Productivas pendiente
          WHERE pendiente.id_ot_raiz = base.id_ot_raiz
            AND pendiente.estado <> 'FINALIZADA'
        )
        AND
        -- La hoja final de la cadena tiene que estar realmente completa.
        EXISTS
        (
          SELECT 1
          FROM @Productivas hoja
          WHERE hoja.id_ot_raiz = base.id_ot_raiz
            AND hoja.estado = 'FINALIZADA'
            AND hoja.cantidad_fabricada + 0.0001 >= hoja.cantidad_pedida
            AND NOT EXISTS
            (
              SELECT 1
              FROM @Productivas hijo
              WHERE hijo.id_ot_origen = hoja.id_ot
            )
        );

      DECLARE @Objetivos TABLE
      (
        id_ot INT NOT NULL PRIMARY KEY,
        tipo_ot VARCHAR(20) NOT NULL,
        id_ot_raiz INT NULL
      );

      -- Todas las productivas visibles de una cadena ya completamente terminada.
      INSERT INTO @Objetivos (id_ot, tipo_ot, id_ot_raiz)
      SELECT
        p.id_ot,
        'PRODUCTIVA',
        p.id_ot_raiz
      FROM @Productivas p
      INNER JOIN @CadenasCompletas c
        ON c.id_ot_raiz = p.id_ot_raiz
      WHERE p.mostrar = 1;

      -- También limpiamos las cards indirectas generadas por pausas de esas cadenas,
      -- pero únicamente si ya están FINALIZADAS.
      INSERT INTO @Objetivos (id_ot, tipo_ot, id_ot_raiz)
      SELECT
        ind.id_ot,
        'INDIRECTO',
        p.id_ot_raiz
      FROM dbo.ordenes_trabajo ind WITH (UPDLOCK, HOLDLOCK)
      INNER JOIN @Productivas p
        ON p.id_ot = ind.id_ot_origen
      INNER JOIN @CadenasCompletas c
        ON c.id_ot_raiz = p.id_ot_raiz
      WHERE UPPER(LTRIM(RTRIM(ISNULL(ind.tipo_ot, '')))) = 'INDIRECTO'
        AND UPPER(LTRIM(RTRIM(ISNULL(ind.estado, '')))) = 'FINALIZADA'
        AND ISNULL(ind.mostrar, 1) = 1
        AND NOT EXISTS
        (
          SELECT 1
          FROM @Objetivos existente
          WHERE existente.id_ot = ind.id_ot
        );

      DECLARE @CadenasOcultadas INT = 0;
      DECLARE @ProductivasOcultadas INT = 0;
      DECLARE @IndirectosOcultados INT = 0;
      DECLARE @TotalOcultadas INT = 0;

      SELECT
        @CadenasOcultadas = COUNT(DISTINCT id_ot_raiz),
        @ProductivasOcultadas = SUM(CASE WHEN tipo_ot = 'PRODUCTIVA' THEN 1 ELSE 0 END),
        @IndirectosOcultados = SUM(CASE WHEN tipo_ot = 'INDIRECTO' THEN 1 ELSE 0 END),
        @TotalOcultadas = COUNT(*)
      FROM @Objetivos;

      UPDATE ot
      SET
        mostrar = 0,
        fecha_modificacion = SYSDATETIME()
      FROM dbo.ordenes_trabajo ot
      INNER JOIN @Objetivos objetivo
        ON objetivo.id_ot = ot.id_ot
      WHERE ISNULL(ot.mostrar, 1) = 1;

      SELECT
        ISNULL(@CadenasOcultadas, 0) AS cadenas_ocultadas,
        ISNULL(@ProductivasOcultadas, 0) AS productivas_ocultadas,
        ISNULL(@IndirectosOcultados, 0) AS indirectos_vinculados_ocultados,
        ISNULL(@TotalOcultadas, 0) AS total_cards_ocultadas;
    `);

    await transaction.commit();
    transaction = null;

    const fila = result.recordset?.[0] || {};

    return {
      cadenas_ocultadas: Number(fila.cadenas_ocultadas || 0),
      productivas_ocultadas: Number(fila.productivas_ocultadas || 0),
      indirectos_vinculados_ocultados: Number(
        fila.indirectos_vinculados_ocultados || 0,
      ),
      total_cards_ocultadas: Number(fila.total_cards_ocultadas || 0),
    };
  } catch (error) {
    if (transaction) {
      try {
        await transaction.rollback();
      } catch {}
    }

    throw error;
  }
}

module.exports = {
  ocultarOrdenesFinalizadasCompletas,
};
