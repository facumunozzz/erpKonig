const express = require("express");
const router = express.Router();
const controller = require("../controllers/stockRecortes");
const { authRequired } = require("../middleware/auth");

router.get("/ubicaciones", controller.getUbicaciones);
router.post("/ubicaciones", controller.crearUbicacion);

router.get("/buscar/codigo/:codigo", authRequired, controller.getRecorteByCodigo);
router.get("/stock", authRequired, controller.getStockByCodigoUbicacion);

router.put("/ubicaciones/:id", controller.actualizarUbicacion);
router.delete("/ubicaciones/:id", controller.eliminarUbicacion);

router.get("/", controller.getAll);
router.get("/articulo/:codigo", controller.getArticuloByCodigo);
router.get("/:id", controller.getById);

router.post("/", controller.create);
router.post("/:id/ubicaciones", controller.agregarUbicacion);
router.post("/:id/consumir", controller.consumir);

router.put("/:id", controller.update);
router.delete("/:id", controller.remove);

module.exports = router;