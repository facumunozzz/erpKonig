import { Routes, Route, NavLink } from "react-router-dom";
import DashboardPage from "./pages/DashboardPage";
import VerRegistroPage from "./pages/VerRegistroPage";
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
      </nav>

      <div className="estado-obras-content">
        <Routes>
          <Route path="/" element={<DashboardPage />} />
          <Route path="/ver-registro" element={<VerRegistroPage />} />
        </Routes>
      </div>

      <Footer />
    </div>
  );
}