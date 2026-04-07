const express = require("express");
const router = express.Router();
const ctrl = require("../controllers/dashboardObras");

router.get("/", ctrl.getDashboardObras);

module.exports = router;