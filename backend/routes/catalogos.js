const express = require("express");
const router = express.Router();
const controller = require("../controllers/catalogos");

router.get("/:tipo", controller.listar);
router.post("/:tipo", controller.crear);
router.put("/:tipo/:id", controller.actualizar);
router.delete("/:tipo/:id", controller.eliminar);

module.exports = router;