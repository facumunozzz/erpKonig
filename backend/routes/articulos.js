const express = require('express');
const router = express.Router();
const articulos = require('../controllers/articulos');
const articulosController = require("../controllers/articulos");

router.get('/codigo/:cod?', articulos.getArticuloByCodigo);
router.get('/', articulos.getAllArticulos);
router.get('/:id', articulos.getArticuloById);
router.delete("/:id/full", articulosController.deleteArticuloFull);

// nuevas rutas
router.get('/:id/clasificaciones', articulos.getClasificacionesArticulo);
router.post('/:id/clasificaciones', articulos.setClasificacionesArticulo);

router.post('/', articulos.createArticulo);
router.put('/:id', articulos.updateArticulo);
router.delete('/:id', articulos.deleteArticulo);

module.exports = router;
