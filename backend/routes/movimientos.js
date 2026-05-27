const express = require("express");
const router = express.Router();
const controller = require("../controllers/movimientos");

router.get("/", controller.getAll);
router.get("/export", controller.exportAll);
router.get("/distinct", controller.getDistinctValues);
router.get("/transaccion/:numero", controller.getByTransaccion);

router.put("/", controller.update);
router.put("/masivo", controller.updateMasivo);

module.exports = router;