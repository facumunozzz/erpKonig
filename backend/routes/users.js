const express = require('express');
const router = express.Router();
const users = require('../controllers/users');
const { authRequired, adminOnly } = require('../middleware/auth');

// Solo ADMIN
router.post('/', authRequired, adminOnly, users.create);
router.get('/', authRequired, adminOnly, users.getAll);

// Editar usuario
router.put('/:id', authRequired, adminOnly, users.update);

// Borrar usuarios
router.delete('/', authRequired, adminOnly, users.removeAll);
router.delete('/:id', authRequired, adminOnly, users.removeOne);

module.exports = router;