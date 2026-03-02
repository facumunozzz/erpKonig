// backend/routes/transferencias.js
const express = require("express");
const router = express.Router();
const controller = require("../controllers/transferencias");
const {authRequired} = require("../middleware/auth");

router.get("/ubicaciones/:depositoId", authRequired, controller.getUbicacionesByDeposito);
router.get("/articulo", authRequired, controller.getArticuloByCodigo);

router.get("/", authRequired, controller.getAll);
router.post("/", authRequired, controller.create);

router.get("/:id", authRequired, controller.getById);

module.exports = router; 