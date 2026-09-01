const express = require("express");

const router = express.Router();
const controller = require("../controllers/ordenesTrabajo");
const indicadoresController = require("../controllers/indicadoresProduccion");

router.get("/", controller.getAll);
router.get("/operadores", controller.getOperadores);
router.get("/datos", indicadoresController.getDatos);
router.get("/indicadores/opciones", indicadoresController.getOpciones);
router.post("/exportar", controller.exportarPlanificacion);

router.get(
  "/materiales/buscar-articulo/:codigo",
  controller.buscarArticuloMaterial,
);

router.post(
  "/:id/materiales",
  controller.agregarMaterial,
);

router.get(
  "/:id/materiales/:idMaterial/recortes",
  controller.getRecortesMaterial,
);

router.post(
  "/:id/materiales/:idMaterial/consumir-recorte",
  controller.consumirRecorteMaterial,
);

router.post(
  "/:id/materiales/:idMaterial/confirmar-consumo",
  controller.confirmarConsumoMaterial,
);

router.get("/:id", controller.getById);
router.put("/:id", controller.update);
router.post("/:id/iniciar", controller.iniciar);
router.post("/:id/pausar", controller.pausar);
router.post("/:id/reanudar", controller.reanudar);
router.post("/:id/finalizar", controller.finalizar);
router.delete("/:id", controller.remove);

module.exports = router;