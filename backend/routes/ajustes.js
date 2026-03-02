const express = require("express");
const router = express.Router();
const multer = require("multer");
const upload = multer();

const controller = require("../controllers/ajustes");
const { authRequired } = require("../middleware/auth");

// plantilla + import
router.get("/plantilla", authRequired, controller.downloadTemplate);
router.post("/importar", authRequired, upload.single("file"), controller.importarDesdeExcel);
router.post("/consumir-produccion", authRequired, controller.consumirProduccionDropbox);

// listados
router.get("/", authRequired, controller.getAll);
router.get("/:id", authRequired, controller.getById);
router.post("/", authRequired, controller.create);

module.exports = router;

