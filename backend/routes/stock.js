const express = require('express');
const router = express.Router();
const controller = require('../controllers/stock');

router.get('/detalle', controller.getDetalle);
router.get('/', controller.getAll);

module.exports = router;
