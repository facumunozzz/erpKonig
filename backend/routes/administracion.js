// routes/administracion.js
const express = require('express');
const router = express.Router();
const { authRequired, adminOnly } = require('../middleware/auth');

// Controlador inline: podés luego moverlo a controllers/administracion.js
router.get('/', authRequired, adminOnly, (req, res) => {
  res.json({
    message: 'Bienvenido al panel de administración',
    user: req.user,
  });
});

module.exports = router;

