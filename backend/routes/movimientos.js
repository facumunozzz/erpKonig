// routes/movimientos.js
const express = require("express");
const router = express.Router();

const controller = require("../controllers/movimientos");

// Si querés proteger esta ruta, podés importar authRequired y usarlo.
// const { authRequired } = require("../middleware/auth");

router.get("/", controller.getAll);
router.put("/", controller.updateMovimientoCabecera);

module.exports = router;