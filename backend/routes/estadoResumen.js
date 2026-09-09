const express = require("express");

const router = express.Router();
const ctrl = require("../controllers/estadoResumen");

router.get("/estados", ctrl.getEstados);
router.post("/estados", ctrl.createEstado);
router.put("/estados/:id", ctrl.updateEstado);
router.delete("/estados/:id", ctrl.deleteEstado);

router.get("/", ctrl.getAll);
router.post("/", ctrl.create);
router.put("/:id", ctrl.update);

module.exports = router;