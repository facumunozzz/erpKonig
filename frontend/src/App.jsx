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
import OrdenesTrabajo from "./pages/OrdenesTrabajo";
import DatosProduccion from "./pages/DatosProduccion";
import IndicadoresEficiencia from "./pages/IndicadoresEficiencia";
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

function OrdenesTrabajoProtegida() {
  const { isAdmin, hasUtilidad } = useAuth();
  const puedeIngresar =
    isAdmin ||
    (typeof hasUtilidad === "function" &&
      hasUtilidad("PlanificacionProduccion"));

  if (!puedeIngresar) {
    return <Navigate to="/stock" replace />;
  }

  return <OrdenesTrabajo />;
}

function DatosProduccionProtegida() {
  const { isAdmin, hasUtilidad } = useAuth();
  const puedeIngresar =
    isAdmin ||
    (typeof hasUtilidad === "function" &&
      hasUtilidad("PlanificacionProduccion"));

  if (!puedeIngresar) {
    return <Navigate to="/stock" replace />;
  }

  return <DatosProduccion />;
}

function IndicadoresProtegida() {
  const { isAdmin, hasUtilidad } = useAuth();
  const puedeIngresar =
    isAdmin ||
    (typeof hasUtilidad === "function" &&
      (hasUtilidad("Indicadores") ||
        hasUtilidad("PlanificacionProduccion")));

  if (!puedeIngresar) {
    return <Navigate to="/stock" replace />;
  }

  return <IndicadoresEficiencia />;
}

function ObservacionesProtegida() {
  const { isAdmin, hasUtilidad } = useAuth();
  const puedeIngresar =
    isAdmin ||
    (typeof hasUtilidad === "function" && hasUtilidad("Observaciones"));

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
          <Route path="/login" element={<Login />} />

          <Route
            path="/"
            element={
              <Navigate
                to={localStorage.getItem("ultimaRuta") || "/stock"}
                replace
              />
            }
          />

          <Route element={<ProtectedRoute />}>
            <Route path="/articulos" element={<Articulos />} />

            <Route path="/stock" element={<Stock />} />
            <Route path="/stock-recortes" element={<StockRecortes />} />

            <Route path="/transferencias" element={<Transferencias />} />
            <Route
              path="/transferencias/nueva"
              element={<NuevaTransferencia />}
            />
            <Route
              path="/transferencias/:id"
              element={<DetalleTransferencia />}
            />

            <Route path="/ajustes" element={<Ajustes />} />
            <Route path="/ajustes/nuevo" element={<NuevoAjuste />} />
            <Route path="/ajustes/:id" element={<DetalleAjuste />} />

            <Route path="/movimientos" element={<Movimientos />} />

            <Route path="/remitos" element={<Remitos />} />
            <Route path="/remitos/nuevo" element={<NuevoRemito />} />
            <Route path="/remitos/:id" element={<DetalleRemito />} />

            <Route path="/produccion" element={<Produccion />} />
            <Route path="/produccion/crear" element={<CrearFormula />} />
            <Route path="/produccion/editar" element={<EditarFormula />} />
            <Route
              path="/produccion/observaciones"
              element={<ObservacionesProtegida />}
            />
            <Route
              path="/produccion/planificacion"
              element={<PlanificacionProduccionProtegida />}
            />
            <Route
              path="/produccion/ordenes-trabajo"
              element={<OrdenesTrabajoProtegida />}
            />
            <Route
              path="/produccion/datos"
              element={<DatosProduccionProtegida />}
            />

            <Route
              path="/indicadores/eficiencia"
              element={<IndicadoresProtegida />}
            />

            <Route path="/fabrica" element={<Fabrica />} />
            <Route path="/estado-obras/*" element={<EstadoObrasApp />} />
          </Route>

          <Route element={<ProtectedRoute requireAdmin />}>
            <Route path="/admin" element={<Administracion />} />
            <Route path="/admin/articulos" element={<DefinirArticulos />} />
            <Route path="/admin/utilidades" element={<CambiarUtilidades />} />
            <Route path="/admin/usuarios" element={<AdminUsuarios />} />
            <Route
              path="/articulos/:id/clasificaciones"
              element={<DefinirArticulos />}
            />
          </Route>

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