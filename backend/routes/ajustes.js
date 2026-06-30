const express = require("express");
const router = express.Router();
const multer = require("multer");
const upload = multer();

const controller = require("../controllers/ajustes");
const { authRequired } = require("../middleware/auth");

// Plantilla e importación
router.get("/plantilla", authRequired, controller.downloadTemplate);
router.post("/importar", authRequired, upload.single("file"), controller.importarDesdeExcel);
router.post("/consumir-produccion", authRequired, controller.consumirProduccionDropbox);

// Motivos
router.get("/motivos", authRequired, controller.getMotivos);
router.post("/motivos", authRequired, controller.createMotivo);
router.put("/motivos/:id", authRequired, controller.updateMotivo);
router.delete("/motivos/:id", authRequired, controller.deleteMotivo);

// Alertas
router.get("/alertas-consumo/pendientes", authRequired, controller.getAlertasConsumoPendientes);
router.put( "/alertas-consumo/marcar-leidas", authRequired, controller.marcarAlertasConsumoLeidas);

// Reversión de movimientos
router.get("/reversiones/buscar", authRequired, controller.buscarMovimientosParaReversion);
router.post("/reversiones/revertir", authRequired, controller.revertirReferencia);

// Borradores
router.post("/borradores", authRequired, controller.saveDraft);
router.get("/borradores/:id", authRequired, controller.getDraftById);
router.delete("/borradores/:id", authRequired, controller.deleteDraft);
router.post("/borradores/:id/confirmar", authRequired, controller.confirmDraft);

// Ajustes
router.get("/", authRequired, controller.getAll);
router.post("/", authRequired, controller.create);
router.get("/:id", authRequired, controller.getById);

module.exports = router;
