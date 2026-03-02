// backend/routes/dropboxMeta.js
const express = require("express");
const router = express.Router();
const ctrl = require("../controllers/dropboxMeta");

router.post("/resolve-id", ctrl.resolveFileId);

module.exports = router;