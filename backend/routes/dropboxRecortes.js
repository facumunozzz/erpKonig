const express = require("express");
const router = express.Router();
const controller = require("../controllers/dropboxRecortes");
const {authRequired} = require("../middleware/auth");

router.post("/consumir", authRequired, controller.consumirRecortesDropbox);

module.exports = router;