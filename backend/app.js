// app.js

require("dotenv").config();

const express = require("express");
const cors = require("cors");
const path = require("path");
const listEndpoints = require("express-list-endpoints");

const app = express();

// =====================
// MIDDLEWARES BASE
// =====================

app.use(cors());
app.use(express.json());

// =====================
// FRONTEND DIST PATH
// =====================

const distPath = path.join(__dirname, "..", "frontend", "dist");

// Servir archivos estáticos del frontend
app.use(express.static(distPath));

// ======================================================
// IMPORTANTE:
// Si el navegador pide una página HTML, devolvemos React.
// Esto evita que al actualizar /stock, /admin, /articulos,
// etc. Express responda JSON del backend.
// ======================================================

app.get("*", (req, res, next) => {
  const accept = req.headers.accept || "";

  const esNavegacionHtml =
    req.method === "GET" &&
    accept.includes("text/html");

  const esArchivo =
    path.extname(req.path) !== "";

  const esRutaTecnica =
    req.path === "/health" ||
    req.path === "/__routes" ||
    req.path === "/__test500";

  // Si es navegación normal del navegador, entregar React
  if (esNavegacionHtml && !esArchivo && !esRutaTecnica) {
    return res.sendFile(path.join(distPath, "index.html"));
  }

  // Si no es navegación HTML, dejar que siga a las APIs
  return next();
});

// =====================
// ROUTERS BACKEND
// =====================

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
const dropboxRegistroRoutes = require("./routes/dropboxRegistro");
const dashboardObrasRoutes = require("./routes/dashboardObras");
const estadoResumenRoutes = require("./routes/estadoResumen");
const referentesRoutes = require("./routes/referentes");
const stockRecortesRoutes = require("./routes/stockRecortes");
const dropboxRecortesRoutes = require("./routes/dropboxRecortes");
const planificacionProduccionRoutes = require("./routes/planificacionProduccion");
const observacionesRouter = require("./routes/observaciones");
const ordenesTrabajoRoutes = require("./routes/ordenesTrabajo");

// =====================
// BACKEND ROUTES
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

app.use("/catalogos", require("./routes/catalogos"));

app.use("/api/dropbox", dropboxRegistroRoutes);
app.use("/api/dashboard-obras", dashboardObrasRoutes);
app.use("/api/estado-resumen", estadoResumenRoutes);

app.use("/referentes", referentesRoutes);

app.use("/api/stock-recortes", stockRecortesRoutes);
app.use("/dropbox-recortes", dropboxRecortesRoutes);

app.use(
  "/api/planificacion-produccion",
  planificacionProduccionRoutes,
);

app.use("/observaciones", observacionesRouter);

app.use(
  "/api/ordenes-trabajo",
  ordenesTrabajoRoutes,
);

// =====================
// RUTAS TÉCNICAS
// =====================

app.get("/__routes", (req, res) => {
  res.json(listEndpoints(app));
});

app.get("/articulos/codigo/direct/:cod?", (req, res) => {
  res.json({
    direct: true,
    cod: req.params.cod ?? null,
  });
});

app.get("/health", (_req, res) => {
  res.json({
    ok: true,
  });
});

app.get("/__test500", (_req, res) => {
  res.status(500).json({
    ok: false,
    detalle: "funciona",
  });
});

// =====================
// FALLBACK FINAL PARA REACT
// =====================

// Este queda como segunda protección.
// Si no encontró API y no es archivo, devuelve React.

app.get("*", (req, res) => {
  const esArchivo =
    path.extname(req.path) !== "";

  if (!esArchivo) {
    return res.sendFile(
      path.join(distPath, "index.html"),
    );
  }

  return res.status(404).json({
    error: "Archivo o ruta no encontrada",
    path: req.path,
  });
});

// =====================
// MANEJO GLOBAL DE ERRORES
// =====================

app.use((err, req, res, _next) => {
  console.log(
    "[GLOBAL ERROR]",
    err?.message || err,
  );

  return res.status(500).json({
    error: "Error interno",
    detalle: err.message,
  });
});

// =====================
// SERVER
// =====================

const PORT =
  process.env.PORT || 3000;

app.listen(PORT, "0.0.0.0", () => {
  console.log(
    `Servidor corriendo en http://0.0.0.0:${PORT}`,
  );

  // ==========================================
  // JOB: CONSUMO DE PRODUCCIÓN
  // ==========================================

  try {
    const {
      startConsumoProduccionJobs,
    } = require("./jobs/consumoProduccion.job");

    startConsumoProduccionJobs();
  } catch (e) {
    console.error(
      "[JOB] No se pudo iniciar consumoProduccion:",
      e.message,
    );
  }

  // ==========================================
  // JOB: CONSUMO DE RECORTES
  // ==========================================

  try {
    const {
      startConsumoRecortesJobs,
    } = require("./jobs/consumoRecortes.job");

    startConsumoRecortesJobs();
  } catch (e) {
    console.error(
      "[JOB] No se pudo iniciar consumoRecortes:",
      e.message,
    );
  }

  // ==========================================
  // JOB: OCULTAR OTs COMPLETAMENTE FINALIZADAS
  // VIERNES 15:30 - HORA ARGENTINA
  // ==========================================

  try {
    const {
      startOrdenesTrabajoLimpiezaJob,
    } = require(
      "./jobs/ordenesTrabajoLimpieza.job"
    );

    startOrdenesTrabajoLimpiezaJob();
  } catch (e) {
    console.error(
      "[JOB] No se pudo iniciar limpieza de OTs:",
      e.message,
    );
  }
});