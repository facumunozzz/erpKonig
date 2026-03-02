// src/App.jsx
import { BrowserRouter as Router, Routes, Route, useLocation, Navigate } from 'react-router-dom';
import { useEffect } from 'react';
import Navbar from './components/Navbar';
import { ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import './App.css';

import Articulos from './pages/Articulos';
import Stock from './pages/Stock';
import Transferencias from './pages/Transferencias';
import Produccion from './pages/Produccion';
import Ajustes from './pages/Ajustes';
import Movimientos from './pages/Movimientos';
import NuevaTransferencia from './pages/NuevaTransferencia';
import NuevoAjuste from './pages/NuevoAjuste';
import DetalleAjuste from './components/DetalleAjuste';
import DetalleTransferencia from './components/TransferenciaDetalle';
import CrearFormula from './pages/CrearFormula';
import EditarFormula from './pages/EditarFormula';
import Fabrica from './pages/Fabrica';
import ArticuloClasificaciones from './pages/DefinirArticulos';

// 👇 nuevas páginas de administración
import Administracion from './pages/Administracion';
import DefinirArticulos from './pages/DefinirArticulos';
import CambiarUtilidades from './pages/CambiarUtilidades';
import AdminUsuarios from './pages/AdminUsuarios';
import Remitos from './pages/Remitos';
import NuevoRemito from './pages/NuevoRemito';
import DetalleRemito from './components/DetalleRemito';


// 👇 login y rutas protegidas
import Login from './pages/Login';
import ProtectedRoute from './components/ProtectedRoute';
import { AuthProvider } from './context/AuthContext'; // 👈 importamos el Provider

function AppRoutes() {
  const location = useLocation();

  useEffect(() => {
    if (location.pathname !== '/') {
      localStorage.setItem('ultimaRuta', location.pathname);
    }
  }, [location]);

  const showNavbar = location.pathname !== '/login';

  return (
    <>
      {showNavbar && <Navbar />}
      <div className="container">
        <Routes>
          {/* Pública */}
          <Route path="/login" element={<Login />} />
          <Route
            path="/"
            element={<Navigate to={localStorage.getItem('ultimaRuta') || '/stock'} />}
          />

          {/* Protegidas (requieren token) */}
          <Route element={<ProtectedRoute />}>
            <Route path="/articulos" element={<Articulos />} />
            <Route path="/stock" element={<Stock />} />
            <Route path="/transferencias" element={<Transferencias />} />
            <Route path="/transferencias/nueva" element={<NuevaTransferencia />} />
            <Route path="/produccion" element={<Produccion />} />
            <Route path="/ajustes" element={<Ajustes />} />
            <Route path="/ajustes/nuevo" element={<NuevoAjuste />} />
            <Route path="/movimientos" element={<Movimientos />} />
            <Route path="/ajustes/:id" element={<DetalleAjuste />} />
            <Route path="/transferencias/:id" element={<DetalleTransferencia />} />
            <Route path="/produccion/crear" element={<CrearFormula />} />
            <Route path="/produccion/editar" element={<EditarFormula />} />
            <Route path="/fabrica" element={<Fabrica />} />
            <Route path="/remitos" element={<Remitos />} />
            <Route path="/remitos/nuevo" element={<NuevoRemito />} />
            <Route path="/remitos/:id" element={<DetalleRemito />} />
          </Route>

          {/* Solo administradores */}
          <Route element={<ProtectedRoute requireAdmin />}>
            <Route path="/admin" element={<Administracion />} />
            <Route path="/admin/articulos" element={<DefinirArticulos />} />
            <Route path="/admin/utilidades" element={<CambiarUtilidades />} />
            <Route path="/admin/usuarios" element={<AdminUsuarios />} />
            <Route path="/articulos/:id/clasificaciones" element={<ArticuloClasificaciones />} />
          </Route>
        </Routes>
      </div>
      <ToastContainer position="top-right" autoClose={3000} />
    </>
  );
}

export default function App() {
  return (
    <AuthProvider> {/* 👈 envolvemos la app entera */}
      <Router>
        <AppRoutes />
      </Router>
    </AuthProvider>
  );
}
