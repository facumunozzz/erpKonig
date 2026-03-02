// backend/jobs/consumoProduccion.job.js
const cron = require("node-cron");
const { _runConsumoProduccion } = require("../controllers/ajustes");

function startConsumoProduccionJobs() {
  // 12:00 (hora local del server)
  cron.schedule("00 12 * * *", async () => {
    try {
      const r = await _runConsumoProduccion();
      console.log("[JOB] consumoProduccion 12:00 ->", r);
    } catch (e) {
      console.error("[JOB] consumoProduccion 12:00 ERROR:", e.message);
    }
  });

  // 15:30
  cron.schedule("30 15 * * *", async () => {
    try {
      const r = await _runConsumoProduccion();
      console.log("[JOB] consumoProduccion 15:30 ->", r);
    } catch (e) {
      console.error("[JOB] consumoProduccion 15:30 ERROR:", e.message);
    }
  });

  console.log("[JOB] consumoProduccion schedules ON: 12:00 y 15:30");
}

module.exports = { startConsumoProduccionJobs };