// backend/routes/remitos.js
const express = require("express");
const router = express.Router();

const controller = require("../controllers/remitos");
const { authRequired } = require("../middleware/auth");

router.get("/proveedores", authRequired, controller.getProveedores);
router.get("/articulo", authRequired, controller.getArticuloByCodigo);
router.get("/distinct", authRequired, controller.getDistinctValues);

router.get("/", authRequired, controller.getAll);
router.get("/:id", authRequired, controller.getById);

router.post("/", authRequired, controller.create);
router.post("/importar-planilla", authRequired, controller.importarPlanilla);

router.put("/:id", authRequired, controller.update);

module.exports = router;