// backend/routes/depositos.js
const express = require('express');
const router = express.Router();
const controller = require('../controllers/depositos'); // <- sin .js también sirve

// Opcional: ayuda a detectar si falta alguna función
// console.log('[depositos routes] controller keys:', Object.keys(controller));

router.get('/', controller.getAll);
router.get('/:id', controller.getById);
router.post('/', controller.create);
router.put('/:id', controller.update);     // <- acá antes fallaba por undefined
router.delete('/:id', controller.remove);

module.exports = router;
