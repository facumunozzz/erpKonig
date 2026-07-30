const cron = require("node-cron");
const {_runConsumoRecortesDropbox,} = require("../controllers/dropboxRecortes");

let ejecutando = false;

async function ejecutarConsumoRecortes() {
    if (ejecutando) {
        console.log(
            "[JOB] consumoRecortes omitido: ya existe una ejecución activa",
        );
    return;
    }

    ejecutando = true;

    try {
        const resultado = await _runConsumoRecortesDropbox();

    console.log("[JOB] consumoRecortes finalizado:", {
        procesados: resultado.procesados || 0,
        alertas: resultado.alertas || 0,
        numero_ajuste: resultado.numero_ajuste || null,
    });
    } catch (error) {
        console.error("[JOB] consumoRecortes ERROR:", error.message);
    } finally {
        ejecutando = false;
    }
}

function startConsumoRecortesJobs() {
  /*
   * Ejemplo: todos los días a las 21:15,
   * hora local del servidor.
   */
  cron.schedule("15 21 * * *", ejecutarConsumoRecortes);

  console.log("[JOB] consumoRecortes schedule ON: 21:15");
}

module.exports = {
  startConsumoRecortesJobs,
};
