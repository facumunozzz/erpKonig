// routes/produccion.js
const express = require('express');
const router = express.Router();
const produccion = require('../controllers/produccion');

// ---------- Fórmulas ----------

// Crear fórmula (falla si ya existe)
router.post('/formulas', produccion.createFormula);

// Reemplazar/crear fórmula (idempotente para edición) — body { codigo, items }
router.put('/formulas', produccion.replaceFormula);

// Actualizar/reemplazar fórmula usando el código en la URL (lo usa EditarFormula.jsx)
router.put('/formulas/:codigo', produccion.updateFormula);

// Listar todas las fórmulas (opcional; poner ANTES de la paramétrica)
router.get('/formulas', produccion.getAllFormulas);

// Obtener fórmula por código de producto
router.get('/formulas/:codigo', produccion.getFormulaByCodigo);

// Borrar fórmula por código (opcional)
router.delete('/formulas/:codigo', produccion.deleteFormulaByCodigo);

// ---------- Auxiliares para el flujo del front ----------

// Verificar si existe el producto por código
router.get('/check/:codigo', produccion.checkProducto);

// Validar lista de materiales por código
router.post('/validar-materiales', produccion.validateMateriales);

module.exports = router;






