const express = require("express");
const router = express.Router();

const controller = require("../controllers/movimientos");

// ========================================================
// MOVIMIENTOS
// ========================================================

// Grilla, filtros, ordenamiento y paginación
router.get("/", controller.getAll);

// Historial / sincronización
router.get("/bootstrap", controller.bootstrapHistorial);
router.get("/sync", controller.syncHistorial);
router.get("/historial-status", controller.getHistorialStatus);

// Exportación y filtros
router.get("/export", controller.exportAll);
router.get("/distinct", controller.getDistinctValues);

// Utilidades
router.get(
  "/carga-transferencia",
  controller.buscarParaCargaTransferencia,
);

router.get(
  "/referencia/:referencia",
  controller.getByReferencia,
);

router.get(
  "/transaccion/:numero",
  controller.getByNumeroTransaccion,
);

// Edición
router.put("/", controller.update);
router.put("/masivo", controller.updateMasivo);

module.exports = router;