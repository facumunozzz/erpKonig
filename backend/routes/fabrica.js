const express = require('express');
const router = express.Router();
const fabrica = require('../controllers/fabrica');

// Crear orden de producción
router.post('/ordenes', fabrica.create);

// (Opcional) listar y ver detalle
router.get('/ordenes', fabrica.getAll);
router.get('/ordenes/:id', fabrica.getById);

module.exports = router;
