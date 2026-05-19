// routes/movimientos.js
const express = require("express");
const router = express.Router();

const controller = require("../controllers/movimientos");

router.get("/", controller.getAll);
router.get("/transaccion/:numero", controller.getByNumeroTransaccion);
router.put("/masivo", controller.updateMovimientoCabeceraMasivo);
router.put("/", controller.updateMovimientoCabecera);

module.exports = router;