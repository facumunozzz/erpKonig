import { Routes, Route, NavLink } from "react-router-dom";
import DashboardPage from "./pages/DashboardPage";
import VerRegistroPage from "./pages/VerRegistroPage";
import TablaSeguimientoPage from "./pages/TablaSeguimientoPage";
import CaratulasPage from "./pages/CaratulasPage";
import Footer from "./components/Footer";
import "../estadoObras/components/styles/EstadoObrasApp.css";

export default function EstadoObrasApp() {
  const linkClass = ({ isActive }) => (isActive ? "active" : undefined);

  return (
    <div className="estado-obras-container">
      <nav className="estado-obras-navbar">
        <NavLink to="/estado-obras" end className={linkClass}>
          🏗️ Dashboard
        </NavLink>

        <NavLink to="/estado-obras/ver-registro" className={linkClass}>
          📋 Ver Registro
        </NavLink>

        <NavLink to="/estado-obras/tabla-seguimiento" className={linkClass}>
          📊 Tabla seguimiento
        </NavLink>

        <NavLink to="/estado-obras/caratulas" className={linkClass}>
          📑 Carátulas
        </NavLink>
      </nav>

      <div className="estado-obras-content">
        <Routes>
          <Route path="/" element={<DashboardPage />} />
          <Route path="/ver-registro" element={<VerRegistroPage />} />
          <Route path="/tabla-seguimiento" element={<TablaSeguimientoPage />} />
          <Route path="/caratulas" element={<CaratulasPage />} />
        </Routes>
      </div>

      <Footer />
    </div>
  );
}