const express = require("express");
const router = express.Router();
const controller = require("../controllers/stockRecortes");

router.get("/", controller.getAll);
router.get("/:id", controller.getById);

router.post("/", controller.create);
router.post("/:id/ubicaciones", controller.agregarUbicacion);
router.post("/:id/consumir", controller.consumir);

router.put("/:id", controller.update);
router.delete("/:id", controller.remove);

module.exports = router;