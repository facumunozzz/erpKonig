import React, { useCallback, useEffect, useMemo, useState } from "react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import logoSZ from "./../images/LOGO-SZCONSULTORES.png";
import logoAquatic from "./../images/logo-aquatic.png";
import "./../styles/navbar.css";

function Navbar() {
  const location = useLocation();
  const navigate = useNavigate();
  const { isAuth, isAdmin, hasUtilidad, displayName, logout } = useAuth();
  const [moduloActivo, setModuloActivo] = useState("stock");
  const [menuMovilAbierto, setMenuMovilAbierto] = useState(false);

  const linkClass = ({ isActive }) =>
    isActive ? "navbar-link active" : "navbar-link";

  const puedeVerProduccion =
    isAdmin ||
    hasUtilidad("PlanificacionProduccion") ||
    hasUtilidad("Observaciones");

  const puedeVerIndicadores =
    isAdmin ||
    hasUtilidad("Indicadores") ||
    hasUtilidad("PlanificacionProduccion");

  const obtenerOpcionesModulo = useCallback(
    (modulo) => {
      switch (modulo) {
        case "stock":
          return [
            {
              texto: "Artículos",
              ruta: "/articulos",
              visible: hasUtilidad("Artículos"),
            },
            {
              texto: "Stock",
              ruta: "/stock",
              visible: hasUtilidad("Stock") || hasUtilidad("StockRecortes"),
              submenu: true,
            },
            {
              texto: "Transferencias",
              ruta: "/transferencias",
              visible: hasUtilidad("Transferencias"),
            },
            {
              texto: "Movimientos/Ajustes",
              ruta: "/ajustes",
              visible: hasUtilidad("Ajustes"),
            },
            {
              texto: "Transacciones",
              ruta: "/movimientos",
              visible: hasUtilidad("Movimientos"),
            },
            {
              texto: "Remitos",
              ruta: "/remitos",
              visible: hasUtilidad("Remitos"),
            },
          ];

        case "obras":
          return [
            {
              texto: "Estado de Obras",
              ruta: "/estado-obras",
              visible: hasUtilidad("EstadoObras"),
            },
          ];

        case "administracion":
          return [
            {
              texto: "Administración",
              ruta: "/admin",
              visible: isAdmin,
            },
          ];

        case "produccion":
          return [
            {
              texto: "Planificación de Producción",
              ruta: "/produccion/planificacion",
              visible: isAdmin || hasUtilidad("PlanificacionProduccion"),
            },
            {
              texto: "Órdenes de Trabajo",
              ruta: "/produccion/ordenes-trabajo",
              visible: isAdmin || hasUtilidad("PlanificacionProduccion"),
            },
            {
              texto: "Datos",
              ruta: "/produccion/datos",
              visible: isAdmin || hasUtilidad("PlanificacionProduccion"),
            },
            {
              texto: "Observaciones",
              ruta: "/produccion/observaciones",
              visible: isAdmin || hasUtilidad("Observaciones"),
            },
          ];

        case "indicadores":
          return [
            {
              texto: "Eficiencia",
              ruta: "/indicadores/eficiencia",
              visible: puedeVerIndicadores,
            },
          ];

        default:
          return [];
      }
    },
    [hasUtilidad, isAdmin, puedeVerIndicadores],
  );

  const opcionesModulo = useMemo(
    () => obtenerOpcionesModulo(moduloActivo),
    [moduloActivo, obtenerOpcionesModulo],
  );

  useEffect(() => {
    const ruta = location.pathname;
    const rutasStock = [
      "/articulos",
      "/stock",
      "/stock-recortes",
      "/transferencias",
      "/ajustes",
      "/movimientos",
      "/remitos",
    ];

    if (rutasStock.some((item) => ruta.startsWith(item))) {
      setModuloActivo("stock");
      return;
    }

    if (ruta.startsWith("/estado-obras")) {
      setModuloActivo("obras");
      return;
    }

    if (ruta.startsWith("/admin")) {
      setModuloActivo("administracion");
      return;
    }

    if (ruta.startsWith("/indicadores")) {
      setModuloActivo("indicadores");
      return;
    }

    if (ruta.startsWith("/produccion") || ruta.startsWith("/fabrica")) {
      setModuloActivo("produccion");
    }
  }, [location.pathname]);

  useEffect(() => {
    setMenuMovilAbierto(false);
  }, [location.pathname]);

  useEffect(() => {
    const cerrarConEscape = (event) => {
      if (event.key === "Escape") setMenuMovilAbierto(false);
    };

    window.addEventListener("keydown", cerrarConEscape);
    return () => window.removeEventListener("keydown", cerrarConEscape);
  }, []);

  const seleccionarModulo = (modulo) => {
    setModuloActivo(modulo);
    setMenuMovilAbierto(false);

    if (modulo === "stock") {
      navigate("/stock");
      return;
    }

    const primeraOpcion = obtenerOpcionesModulo(modulo).find(
      (opcion) => opcion.visible,
    );

    if (primeraOpcion) navigate(primeraOpcion.ruta);
  };

  const cerrarSesion = () => {
    setMenuMovilAbierto(false);
    logout();
  };

  return (
    <div className="navbar-layout">
      <aside className={`navbar-sidebar ${menuMovilAbierto ? "open" : ""}`}>
        <div className="navbar-sidebar-header">
          <img src={logoSZ} alt="SZ Consultores" className="logo-sz-sidebar" />
          <button
            type="button"
            className="navbar-sidebar-close"
            onClick={() => setMenuMovilAbierto(false)}
            aria-label="Cerrar menú"
          >
            ✕
          </button>
        </div>

        <nav className="navbar-modulos" aria-label="Módulos principales">
          <button
            type="button"
            className={`navbar-modulo ${moduloActivo === "stock" ? "active" : ""}`}
            onClick={() => seleccionarModulo("stock")}
          >
            Gestión de Stock
          </button>

          {hasUtilidad("EstadoObras") && (
            <button
              type="button"
              className={`navbar-modulo ${moduloActivo === "obras" ? "active" : ""}`}
              onClick={() => seleccionarModulo("obras")}
            >
              Estado de Obras
            </button>
          )}

          {puedeVerProduccion && (
            <button
              type="button"
              className={`navbar-modulo ${
                moduloActivo === "produccion" ? "active" : ""
              }`}
              onClick={() => seleccionarModulo("produccion")}
            >
              Gestión de Producción
            </button>
          )}

          {puedeVerIndicadores && (
            <button
              type="button"
              className={`navbar-modulo ${
                moduloActivo === "indicadores" ? "active" : ""
              }`}
              onClick={() => seleccionarModulo("indicadores")}
            >
              Indicadores
            </button>
          )}

          {isAdmin && (
            <button
              type="button"
              className={`navbar-modulo ${
                moduloActivo === "administracion" ? "active" : ""
              }`}
              onClick={() => seleccionarModulo("administracion")}
            >
              Administración
            </button>
          )}
        </nav>
      </aside>

      <div className="navbar-main">
        <header className="navbar-top">
          <button
            type="button"
            className="navbar-mobile-toggle"
            onClick={() => setMenuMovilAbierto((estadoActual) => !estadoActual)}
            aria-label="Abrir menú"
            aria-expanded={menuMovilAbierto}
          >
            ☰
          </button>

          <img src={logoSZ} alt="SZ Consultores" className="logo-sz-top" />

          <nav className="navbar-options" aria-label="Opciones del módulo">
            {opcionesModulo
              .filter((opcion) => opcion.visible)
              .map((opcion) => {
                if (opcion.texto === "Stock" && opcion.submenu) {
                  const stockActivo =
                    location.pathname === "/stock" ||
                    location.pathname.startsWith("/stock-recortes");

                  return (
                    <div key={opcion.ruta} className="navbar-dropdown">
                      <NavLink
                        to="/stock"
                        className={`navbar-link navbar-dropdown-link ${
                          stockActivo ? "active" : ""
                        }`}
                      >
                        Stock
                        <span className="navbar-dropdown-arrow">▾</span>
                      </NavLink>

                      <div className="navbar-dropdown-menu">
                        {hasUtilidad("Stock") && (
                          <NavLink to="/stock" className="navbar-dropdown-item">
                            Stock
                          </NavLink>
                        )}
                        <NavLink
                          to="/stock-recortes"
                          className="navbar-dropdown-item"
                        >
                          Stock Recortes
                        </NavLink>
                      </div>
                    </div>
                  );
                }

                return (
                  <NavLink
                    key={opcion.ruta}
                    to={opcion.ruta}
                    className={linkClass}
                  >
                    {opcion.texto}
                  </NavLink>
                );
              })}
          </nav>

          <div className="navbar-user-area">
            {isAuth ? (
              <>
                <span className="navbar-user" title={displayName}>
                  {displayName}
                </span>
                <button
                  type="button"
                  className="navbar-logout"
                  onClick={cerrarSesion}
                >
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
        </header>
      </div>

      {menuMovilAbierto && (
        <button
          type="button"
          className="navbar-overlay"
          aria-label="Cerrar menú"
          onClick={() => setMenuMovilAbierto(false)}
        />
      )}
    </div>
  );
}

export default Navbar;