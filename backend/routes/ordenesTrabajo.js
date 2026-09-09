const express = require("express");
const router = express.Router();
const controller = require("../controllers/ordenesTrabajo");
const indicadoresController = require("../controllers/indicadoresProduccion");
const { authRequired } = require("../middleware/auth");
const soloOperacionUsuario = require("../middleware/soloOperacionUsuario");

router.use(authRequired);
router.get("/", controller.getAll);
router.get("/operadores", controller.getOperadores);
router.get("/datos", indicadoresController.getDatos);

router.put("/datos/:id/:tipoRegistro", soloOperacionUsuario, indicadoresController.guardarAjusteDato);
router.delete("/datos/:id/:tipoRegistro", soloOperacionUsuario, indicadoresController.restaurarDatoOriginal);

router.get("/indicadores/opciones", indicadoresController.getOpciones);
router.post("/exportar", controller.exportarPlanificacion);
router.post("/indirectos", controller.crearIndirectoIndependiente);
router.post(
  "/ocultar-finalizadas-completas",
  controller.ocultarFinalizadasCompletas,
);

router.get(
  "/materiales/buscar-articulo/:codigo",
  controller.buscarArticuloMaterial,
);

router.post(
  "/:id/materiales",
  soloOperacionUsuario,
  controller.agregarMaterial,
);

router.get(
  "/:id/materiales/:idMaterial/recortes",
  soloOperacionUsuario,
  controller.getRecortesMaterial,
);

router.post(
  "/:id/materiales/:idMaterial/consumir-recorte",
  soloOperacionUsuario,
  controller.consumirRecorteMaterial,
);

router.post(
  "/:id/materiales/:idMaterial/confirmar-consumo",
  soloOperacionUsuario,
  controller.confirmarConsumoMaterial,
);

router.get("/:id", soloOperacionUsuario, controller.getById);

router.put("/:id", soloOperacionUsuario, controller.update);

router.post("/:id/iniciar", soloOperacionUsuario, controller.iniciar);

router.post("/:id/pausar", soloOperacionUsuario, controller.pausar);

router.post("/:id/reanudar", soloOperacionUsuario, controller.reanudar);

router.post("/:id/finalizar", soloOperacionUsuario, controller.finalizar);

router.delete("/:id", soloOperacionUsuario, controller.remove);

module.exports = router;
