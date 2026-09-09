const cron = require("node-cron");

const { poolConnect, getPool } = require("../db");

const {
  ocultarOrdenesFinalizadasCompletas,
} = require("../services/ordenesTrabajoLimpieza");

async function runOcultarOrdenesFinalizadas() {
  await poolConnect;

  const pool = await getPool();

  return ocultarOrdenesFinalizadasCompletas(pool);
}

function startOrdenesTrabajoLimpiezaJob() {
  // VIERNES 15:30 - hora Argentina
  cron.schedule(
    "30 15 * * 5",
    async () => {
      try {
        console.log(
          "[JOB] Iniciando ocultamiento de OTs finalizadas completas...",
        );

        const resultado = await runOcultarOrdenesFinalizadas();

        console.log("[JOB] OTs finalizadas completas 15:30 ->", resultado);
      } catch (error) {
        console.error("[JOB] OTs finalizadas completas ERROR:", error.message);
      }
    },
    {
      timezone: "America/Argentina/Buenos_Aires",
    },
  );

  console.log("[JOB] ocultar OTs finalizadas ON: viernes 15:30 Argentina");
}

module.exports = {
  startOrdenesTrabajoLimpiezaJob,
  runOcultarOrdenesFinalizadas,
};
