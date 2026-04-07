const express = require("express");
const router = express.Router();
const ctrl = require("../controllers/dropboxRegistro");

router.get("/registro-ot", ctrl.getRegistroOT);

module.exports = router;