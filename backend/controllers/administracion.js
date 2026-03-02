// controllers/administracion.js
exports.dashboard = (req, res) => {
  res.json({
    message: 'Bienvenido al panel de Administración',
    user: req.user,
    opciones: [
      'Gestión de usuarios',
      'Parámetros del sistema',
      'Estadísticas generales'
    ]
  });
};
