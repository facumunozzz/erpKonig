// backend/routes/ubicaciones.js
const express = require("express");
const router = express.Router();
const controller = require("../controllers/ubicaciones");

// GET /ubicaciones  (opcional ?deposito_id=...)
router.get("/", controller.getAll);

// si querés el endpoint “legacy” explícito:
router.get("/by-deposito", controller.getByDeposito);

router.post("/", controller.create);
router.get("/:id", controller.getById);
router.put("/:id", controller.update);
router.delete("/:id", controller.remove);

module.exports = router;
