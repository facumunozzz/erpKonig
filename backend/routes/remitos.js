// backend/routes/remitos.js
const express = require("express");
const router = express.Router();
const controller = require("../controllers/remitos");

router.get("/", controller.getAll);
router.get("/articulo", controller.getArticuloByCodigo); // ✅ antes de /:id
router.get("/:id", controller.getById);
router.post("/", controller.create);

module.exports = router;


