const express = require("express");

const router = express.Router();

const controller = require("../controllers/planificacionProduccion");

// Planificación mensual compartida entre todos los usuarios.
router.get("/planificacion", controller.getPlanificacionCompartida);
router.put("/planificacion", controller.savePlanificacionCompartida);

router.get("/operaciones", controller.getOperaciones);
router.post("/operaciones", controller.createOperacion);
router.put("/operaciones/:id", controller.updateOperacion);
router.delete("/operaciones/:id", controller.deleteOperacion);

router.get("/tiempos-obra", controller.getTiemposStdObra);
router.put("/tiempos-obra", controller.saveTiempoStdObra);

router.get("/tipos-articulos", controller.getTiposArticulos);

router.get("/tipos-material", controller.getTiposMaterial);
router.put("/tipos-material", controller.saveTiposMaterial);

router.get("/articulos/codigo/:codigo", controller.getArticuloPorCodigo);

router.get("/materiales-excluir", controller.getMaterialesExcluir);
router.put("/materiales-excluir", controller.saveMaterialesExcluir);

router.get("/articulos-pendientes", controller.getArticulosPendientes);
router.delete("/articulos-pendientes/:id", controller.deleteArticuloPendiente);

router.post("/calcular-materiales", controller.calcularMaterialesObra);

module.exports = router;
