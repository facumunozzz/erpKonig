// app.js
require("dotenv").config();
const express = require("express");
const cors = require("cors");
const path = require("path"); // ✅ NUEVO

const app = express();

// Middlewares base
app.use(cors());
app.use(express.json());

// Debug: ver qué archivo de rutas se está usando para artículos
const listEndpoints = require("express-list-endpoints");

// Routers
const articulosRouter = require("./routes/articulos");
const depositosRouter = require("./routes/depositos");
const stockRouter = require("./routes/stock");
const transferenciasRouter = require("./routes/transferencias");
const movimientosRouter = require("./routes/movimientos");
const produccionRouter = require("./routes/produccion");
const ajustesRouter = require("./routes/ajustes");
const fabricaRouter = require("./routes/fabrica");
const adminRouter = require("./routes/administracion");
const authRouter = require("./routes/auth");
const usersRouter = require("./routes/users.js");
const utilidadesRouter = require("./routes/utilidades");
const articuloClasifRouter = require("./routes/articuloClasificaciones");
const clasificacionesRouter = require("./routes/clasificaciones");
const remitosRouter = require("./routes/remitos");
const ubicacionesRouter = require("./routes/ubicaciones");
const dropboxMetaUsers = require("./routes/dropboxMeta");

// =====================
// 1) BACKEND ROUTES (igual que hoy)
// =====================
app.use("/dropbox", dropboxMetaUsers);
app.use("/articulos", articulosRouter);
app.use("/depositos", depositosRouter);
app.use("/stock", stockRouter);
app.use("/transferencias", transferenciasRouter);
app.use("/movimientos", movimientosRouter);
app.use("/produccion", produccionRouter);
app.use("/ajustes", ajustesRouter);
app.use("/fabrica", fabricaRouter);
app.use("/auth", authRouter);
app.use("/users", usersRouter);
app.use("/admin", adminRouter);
app.use("/utilidades", utilidadesRouter);
app.use("/articulo-clasificaciones", articuloClasifRouter);
app.use("/clasificaciones", clasificacionesRouter);
app.use("/remitos", remitosRouter);
app.use("/ubicaciones", ubicacionesRouter);

// Endpoint para listar rutas instaladas (útil para debug; podés borrarlo luego)
app.get("/__routes", (req, res) => {
  res.json(listEndpoints(app));
});

// Bypass directo (sin pasar por el router) para aislar si el 404 es del router
app.get("/articulos/codigo/direct/:cod?", (req, res) => {
  res.json({ direct: true, cod: req.params.cod ?? null });
});

// Healthcheck sencillo (opcional)
app.get("/health", (_req, res) => res.json({ ok: true }));

// =====================
// 2) SERVIR FRONT (Vite dist)  ✅ NUEVO
// =====================
const distPath = path.join(__dirname, "..", "frontend", "dist");
app.use(express.static(distPath));

// Lista de prefijos del backend (para que el fallback NO se los coma) ✅ NUEVO
const API_PREFIXES = [
  "/dropbox",
  "/articulos",
  "/depositos",
  "/stock",
  "/transferencias",
  "/movimientos",
  "/produccion",
  "/ajustes",
  "/fabrica",
  "/auth",
  "/users",
  "/admin",
  "/utilidades",
  "/articulo-clasificaciones",
  "/clasificaciones",
  "/remitos",
  "/ubicaciones",
  "/__routes",
  "/health",
];

// SPA fallback: si NO es una ruta del backend, devolvemos index.html ✅ NUEVO
app.get("*", (req, res, next) => {
  const p = req.path || "/";

  if (API_PREFIXES.some((pref) => p === pref || p.startsWith(pref + "/"))) {
    return next(); // deja 404 backend si no existe
  }

  return res.sendFile(path.join(distPath, "index.html"));
});

const PORT = process.env.PORT || 3000;

// ✅ escuchá en 0.0.0.0 para que te entre desde otra PC
app.listen(PORT, "0.0.0.0", () => {
  console.log(`Servidor corriendo en http://0.0.0.0:${PORT}`);

  // ✅ Scheduler: corre a las 12:00 y 15:30
  try {
    const { startConsumoProduccionJobs } = require("./jobs/consumoProduccion.job");
    startConsumoProduccionJobs();
  } catch (e) {
    console.error("[JOB] No se pudo iniciar consumoProduccion:", e.message);
  }
});