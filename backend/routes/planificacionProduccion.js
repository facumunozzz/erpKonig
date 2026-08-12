const express = require("express");
const router = express.Router();
const controller = require("../controllers/planificacionProduccion");

router.get("/operaciones", controller.getOperaciones);
router.post("/operaciones", controller.createOperacion);
router.put("/operaciones/:id", controller.updateOperacion);
router.delete("/operaciones/:id", controller.deleteOperacion);

router.get("/tipos-articulos", controller.getTiposArticulos);
router.get("/tipos-material", controller.getTiposMaterial);
router.put("/tipos-material", controller.saveTiposMaterial);

router.get("/articulos/codigo/:codigo", controller.getArticuloPorCodigo);

router.get("/materiales-excluir", controller.getMaterialesExcluir);
router.put("/materiales-excluir", controller.saveMaterialesExcluir);

router.post("/calcular-materiales",controller.calcularMaterialesObra);

module.exports = router;
