// backend/routes/remitos.js
const express = require("express");
const router = express.Router();
const controller = require("../controllers/remitos");

router.get("/", controller.getAll);

router.get("/proveedores", controller.getProveedores); // ✅ antes de /:id
router.get("/articulo", controller.getArticuloByCodigo); // ✅ antes de /:id

router.post("/importar-planilla", controller.importarPlanilla);

router.get("/:id", controller.getById);
router.post("/", controller.create);

router.put("/:id", controller.update);

module.exports = router;