import React from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext'; // 👈 Importamos el contexto
import logoSZ from './../images/LOGO-SZCONSULTORES.png';
import logoAquatic from './../images/logo-aquatic.png';
import './../styles/navbar.css';

function Navbar() {
  const navigate = useNavigate();
  const { user, isAuth, isAdmin, hasUtilidad, displayName, logout } = useAuth(); // 👈 Traemos todo desde el contexto

  const linkClass = ({ isActive }) => (isActive ? 'active' : undefined);

  return (
    <nav className="navbar">
      <img src={logoSZ} alt="SZ Consultores" className="logo-sz" />

      <ul className="navbar-menu">
        {hasUtilidad('EstadoObras') && (
          <li><NavLink to="/estado-obras" className={linkClass}>Estado de Obras</NavLink></li>
        )}
        {hasUtilidad('Artículos') && (
          <li><NavLink to="/articulos" className={linkClass}>Artículos</NavLink></li>
        )}
        {hasUtilidad('Stock') && (
          <li><NavLink to="/stock" className={linkClass}>Stock</NavLink></li>
        )}
        {hasUtilidad('Transferencias') && (
          <li><NavLink to="/transferencias" className={linkClass}>Transferencias</NavLink></li>
        )}
        {hasUtilidad('Ajustes') && (
          <li><NavLink to="/ajustes" className={linkClass}>Ajustes/Movimientos varios</NavLink></li>
        )}
        {hasUtilidad('Movimientos') && (
          <li><NavLink to="/movimientos" className={linkClass}>Movimientos</NavLink></li>
        )}
        {hasUtilidad('Remitos') && (
        <li><NavLink to="/remitos" className={linkClass}>Remitos</NavLink></li>
        )}
        {isAdmin && (
          <li><NavLink to="/admin" className={linkClass}>Administración</NavLink></li>
        )}
      </ul>

      <div className="navbar-right">
        {isAuth ? (
          <>
            <span className="navbar-user">{displayName}</span>
            <button className="navbar-logout" onClick={logout}>
              Salir
            </button>
          </>
        ) : (
          <NavLink to="/login" className="navbar-login">
            Iniciar sesión
          </NavLink>
        )}
        <img src={logoAquatic} alt="Aquatic" className="logo-aquatic" />
      </div>
    </nav>
  );
}

export default Navbar;
