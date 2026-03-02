// routes/auth.js
const express = require('express');
const router = express.Router();
const auth = require('../controllers/auth');
const { authRequired } = require('../middleware/auth');

/**
 * Rutas de autenticación
 *
 * /auth/login      -> Login de usuario (público)
 * /auth/bootstrap  -> Crear primer usuario ADMIN (solo si no existen)
 * /auth/me         -> Ver perfil del usuario autenticado
 */

// Login (público)
router.post('/login', auth.login);

// Crear primer usuario ADMIN (solo para inicialización del sistema)
router.post('/bootstrap', auth.bootstrapAdmin);

// Obtener datos del usuario autenticado (requiere token JWT)
router.get('/me', authRequired, auth.me);

// Exportar el router correctamente
module.exports = router;
