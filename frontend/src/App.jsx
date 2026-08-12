import {
  BrowserRouter as Router,
  Routes,
  Route,
  useLocation,
  Navigate,
} from "react-router-dom";

import { useEffect } from "react";

import Navbar from "./components/Navbar";
import AlertaConsumoProduccion from "./components/AlertaConsumoProduccion";
import ProtectedRoute from "./components/ProtectedRoute";

import { AuthProvider, useAuth } from "./context/AuthContext";

import { ToastContainer } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import "./App.css";

import Articulos from "./pages/Articulos";
import Stock from "./pages/Stock";
import StockRecortes from "./pages/StockRecortes";

import Transferencias from "./pages/Transferencias";
import NuevaTransferencia from "./pages/NuevaTransferencia";
import DetalleTransferencia from "./components/TransferenciaDetalle";

import Ajustes from "./pages/Ajustes";
import NuevoAjuste from "./pages/NuevoAjuste";
import DetalleAjuste from "./components/DetalleAjuste";

import Movimientos from "./pages/Movimientos";

import Remitos from "./pages/Remitos";
import NuevoRemito from "./pages/NuevoRemito";
import DetalleRemito from "./components/DetalleRemito";

import Produccion from "./pages/Produccion";
import CrearFormula from "./pages/CrearFormula";
import EditarFormula from "./pages/EditarFormula";
import Fabrica from "./pages/Fabrica";
import Observaciones from "./pages/Observaciones";

import PlanificacionProduccion from "./pages/PlanificacionProduccion";

import EstadoObrasApp from "./estadoObras/EstadoObrasApp";

import Administracion from "./pages/Administracion";
import DefinirArticulos from "./pages/DefinirArticulos";
import CambiarUtilidades from "./pages/CambiarUtilidades";
import AdminUsuarios from "./pages/AdminUsuarios";

import Login from "./pages/Login";

function PlanificacionProduccionProtegida() {
  const { isAdmin, hasUtilidad } = useAuth();

  const puedeIngresar =
    isAdmin ||
    (typeof hasUtilidad === "function" &&
      hasUtilidad("PlanificacionProduccion"));

  if (!puedeIngresar) {
    return <Navigate to="/stock" replace />;
  }

  return <PlanificacionProduccion />;
}

function ObservacionesProtegida() {
  const { isAdmin, hasUtilidad } = useAuth();

  const puedeIngresar =
    isAdmin ||
    (typeof hasUtilidad === "function" &&
      hasUtilidad("Observaciones"));

  if (!puedeIngresar) {
    return <Navigate to="/stock" replace />;
  }

  return <Observaciones />;
}

function AppRoutes() {
  const location = useLocation();

  const showNavbar = location.pathname !== "/login";

  useEffect(() => {
    if (location.pathname !== "/" && location.pathname !== "/login") {
      localStorage.setItem("ultimaRuta", location.pathname);
    }
  }, [location.pathname]);

  return (
    <>
      {showNavbar && <Navbar />}
      {showNavbar && <AlertaConsumoProduccion />}

      <main className={showNavbar ? "app-content" : "login-content"}>
        <Routes>
          {/* ========================= */}
          {/* LOGIN */}
          {/* ========================= */}

          <Route path="/login" element={<Login />} />

          {/* ========================= */}
          {/* RUTA INICIAL */}
          {/* ========================= */}

          <Route
            path="/"
            element={
              <Navigate
                to={localStorage.getItem("ultimaRuta") || "/stock"}
                replace
              />
            }
          />

          {/* ========================= */}
          {/* USUARIOS AUTENTICADOS */}
          {/* ========================= */}

          <Route element={<ProtectedRoute />}>
            {/* ARTÍCULOS */}

            <Route path="/articulos" element={<Articulos />} />

            {/* STOCK */}

            <Route path="/stock" element={<Stock />} />

            <Route path="/stock-recortes" element={<StockRecortes />} />

            {/* TRANSFERENCIAS */}

            <Route path="/transferencias" element={<Transferencias />} />

            <Route
              path="/transferencias/nueva"
              element={<NuevaTransferencia />}
            />

            <Route
              path="/transferencias/:id"
              element={<DetalleTransferencia />}
            />

            {/* AJUSTES */}

            <Route path="/ajustes" element={<Ajustes />} />

            <Route path="/ajustes/nuevo" element={<NuevoAjuste />} />

            <Route path="/ajustes/:id" element={<DetalleAjuste />} />

            {/* MOVIMIENTOS */}

            <Route path="/movimientos" element={<Movimientos />} />

            {/* REMITOS */}

            <Route path="/remitos" element={<Remitos />} />

            <Route path="/remitos/nuevo" element={<NuevoRemito />} />

            <Route path="/remitos/:id" element={<DetalleRemito />} />

            {/* PRODUCCIÓN */}

            <Route path="/produccion" element={<Produccion />} />

            <Route path="/produccion/crear" element={<CrearFormula />} />

            <Route path="/produccion/editar" element={<EditarFormula />} />

            <Route path="/produccion/observaciones" element={<ObservacionesProtegida />}/>

            <Route
              path="/produccion/planificacion"
              element={<PlanificacionProduccionProtegida />}
            />

            {/* FÁBRICA */}

            <Route path="/fabrica" element={<Fabrica />} />

            {/* ESTADO DE OBRAS */}

            <Route path="/estado-obras/*" element={<EstadoObrasApp />} />
          </Route>

          {/* ========================= */}
          {/* SOLO ADMINISTRADORES */}
          {/* ========================= */}

          <Route element={<ProtectedRoute requireAdmin />}>
            {/* ADMINISTRACIÓN */}

            <Route path="/admin" element={<Administracion />} />

            {/* DEFINIR ARTÍCULOS */}

            <Route path="/admin/articulos" element={<DefinirArticulos />} />

            {/* UTILIDADES POR USUARIO */}

            <Route path="/admin/utilidades" element={<CambiarUtilidades />} />

            {/* ADMINISTRAR USUARIOS */}

            <Route path="/admin/usuarios" element={<AdminUsuarios />} />

            {/* CLASIFICACIONES DE ARTÍCULOS */}

            <Route
              path="/articulos/:id/clasificaciones"
              element={<DefinirArticulos />}
            />
          </Route>

          {/* ========================= */}
          {/* RUTA DESCONOCIDA */}
          {/* ========================= */}

          <Route path="*" element={<Navigate to="/stock" replace />} />
        </Routes>
      </main>

      <ToastContainer position="top-right" autoClose={3000} />
    </>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <Router>
        <AppRoutes />
      </Router>
    </AuthProvider>
  );
}