import React, { createContext, useContext, useState, useEffect } from "react";

const AuthContext = createContext();

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(null);

  // 🔹 Al montar: leer datos guardados en localStorage
  useEffect(() => {
    const storedUser = localStorage.getItem("user");
    const storedToken = localStorage.getItem("token");
    if (storedUser && storedToken) {
      try {
        setUser(JSON.parse(storedUser));
        setToken(storedToken);
      } catch {
        localStorage.removeItem("user");
        localStorage.removeItem("token");
      }
    }
  }, []);

  // 🔹 Sincronizar con localStorage cuando cambian user o token
  useEffect(() => {
    if (user && token) {
      localStorage.setItem("user", JSON.stringify(user));
      localStorage.setItem("token", token);
    } else {
      localStorage.removeItem("user");
      localStorage.removeItem("token");
    }
  }, [user, token]);

  // ======================================================
  //  FUNCIONES PRINCIPALES
  // ======================================================

  const login = (userData, jwt) => {
    setUser(userData);
    setToken(jwt);
  };

  const logout = () => {
    setUser(null);
    setToken(null);
    localStorage.clear();
  };

  // ======================================================
  //  HELPERS DE ACCESO Y PERMISOS
  // ======================================================

  const isAdmin = user?.roles?.map(r => r.toUpperCase()).includes("ADMIN");

  // 👉 Devuelve true si el usuario tiene la utilidad activa o si es admin
  const hasUtilidad = (nombre) => {
    if (isAdmin) return true;
    if (!user?.utilidades || !Array.isArray(user.utilidades)) return false;
    return user.utilidades.some(u => u.toLowerCase() === nombre.toLowerCase());
  };

  // 👉 Nombre para mostrar (nombre o username)
  const displayName = user?.nombre || user?.username || "";

  // 👉 Saber si hay sesión activa
  const isAuth = !!token;

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        login,
        logout,
        isAdmin,
        hasUtilidad,
        displayName,
        isAuth,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
