const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/articuloClasificaciones');
const { authRequired, adminOnly } = require('../middleware/auth');

router.get('/clasificaciones/activas', authRequired, ctrl.getActiveClasificaciones);
router.get('/:id/clasificaciones', authRequired, ctrl.getClasificacionesPorArticulo);
router.post('/:id/clasificaciones', authRequired, adminOnly, ctrl.saveClasificacionesPorArticulo);

module.exports = router;
