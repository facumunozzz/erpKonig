const express = require("express");
const router = express.Router();

const controller = require("../controllers/referentes");
const { authRequired } = require("../middleware/auth");

router.get("/", authRequired, controller.getAll);
router.post("/", authRequired, controller.create);
router.put("/:id", authRequired, controller.update);
router.delete("/:id", authRequired, controller.delete);

module.exports = router;