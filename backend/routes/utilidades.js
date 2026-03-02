const express = require('express');
const router = express.Router();
const { authRequired, adminOnly } = require('../middleware/auth');
const ctrl = require('../controllers/utilidades');

// Solo administradores
router.get('/', authRequired, adminOnly, ctrl.getAllUsersWithUtilidades);
router.get('/:id', authRequired, adminOnly, ctrl.getUtilidadesByUser);
router.post('/:id', authRequired, adminOnly, ctrl.updateUtilidadesForUser);

module.exports = router;
