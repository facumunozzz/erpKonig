// middleware/auth.js
const jwt = require('jsonwebtoken');
const JWT_SECRET = process.env.JWT_SECRET || 'facundo12345';

// Middleware base: requiere token válido
exports.authRequired = (req, res, next) => {
  const header = req.headers['authorization'];
  if (!header) return res.status(401).json({ error: 'Token no proporcionado' });

  const token = header.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Token mal formado' });

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    let msg = 'Token inválido o expirado';
    if (err.name === 'TokenExpiredError') msg = 'El token ha expirado';
    if (err.name === 'JsonWebTokenError') msg = 'El token es inválido o está corrupto';
    if (err.name === 'NotBeforeError') msg = 'El token aún no es válido';
    console.error('❌ Error verificando token:', err.message);
    return res.status(401).json({ error: msg });
  }
};

// Middleware adicional: requiere rol ADMIN
exports.adminOnly = (req, res, next) => {
  try {
    const roles = req.user?.roles || [];
    const isAdmin = roles.map(r => r.toUpperCase()).includes('ADMIN');
    if (!isAdmin) {
      return res.status(403).json({ error: 'Acceso restringido a administradores' });
    }
    next();
  } catch (err) {
    console.error('❌ Error en adminOnly:', err.message);
    res.status(403).json({ error: 'Error en validación de permisos' });
  }
};
