const express = require("express");
const router = express.Router();
const ctrl = require("../controllers/clasificaciones");
const { authRequired, adminOnly } = require("../middleware/auth");

router.get("/", authRequired, ctrl.getAll);
router.get("/obligatorias", authRequired, ctrl.getObligatorias);
router.post("/", authRequired, adminOnly, ctrl.create);
router.patch("/:id", authRequired, adminOnly, ctrl.updateFlag);
router.delete("/:id", authRequired, adminOnly, ctrl.remove);
router.get("/activas", authRequired, ctrl.getActivas);
router.post("/sync", authRequired, adminOnly, ctrl.syncFromArticulos);

router.post(
  "/sync-schema",
  authRequired,
  adminOnly,
  ctrl.syncFromArticulosSchema
);


module.exports = router;

