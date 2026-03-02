// routes/movimientos.js
const express = require('express');
const router = express.Router();
const controller = require('../controllers/movimientos');

router.get('/', controller.getAll);

module.exports = router;

