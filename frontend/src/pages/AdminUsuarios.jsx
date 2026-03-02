import React, { useState, useEffect } from "react";
import api from "../api/axiosConfig";
import { toast } from "react-toastify";
import "../styles/transferencias.css";
import { useAuth } from "../context/AuthContext";

export default function AdminUsuarios() {
  const { token, user } = useAuth();

  const [form, setForm] = useState({
    username: "",
    nombre: "",
    email: "",
    password: "",
    confirmPassword: "",
    role: "USER",
  });

  const [usuarios, setUsuarios] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loadingUsuarios, setLoadingUsuarios] = useState(false);

  // ================================
  // Cargar usuarios
  // ================================
  const loadUsuarios = async () => {
    setLoadingUsuarios(true);
    try {
      const res = await api.get("/utilidades", {
        headers: { Authorization: `Bearer ${token}` },
      });
      setUsuarios(res.data);
    } catch {
      toast.error("Error al cargar usuarios");
    } finally {
      setLoadingUsuarios(false);
    }
  };

  useEffect(() => {
    loadUsuarios();
  }, []);

  // ================================
  // Manejo del formulario
  // ================================
  const handleChange = (e) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!form.username || !form.password) {
      toast.error("El usuario y la contraseña son obligatorios");
      return;
    }

    if (form.password.length < 6) {
      toast.error("La contraseña debe tener al menos 6 caracteres");
      return;
    }

    if (form.password !== form.confirmPassword) {
      toast.error("Las contraseñas no coinciden");
      return;
    }

    setLoading(true);
    try {
      await api.post(
        "/users",
        {
          username: form.username,
          nombre: form.nombre || null,
          email: form.email || null,
          password: form.password,
          roles: [form.role],
        },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      toast.success("Usuario creado correctamente");
      setForm({
        username: "",
        nombre: "",
        email: "",
        password: "",
        confirmPassword: "",
        role: "USER",
      });

      loadUsuarios(); // 🔹 refresca la lista sin recargar
    } catch (err) {
      const msg = err?.response?.data?.error || "Error al crear usuario";
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  // ================================
  // Eliminar usuario
  // ================================
  const handleDelete = async (id, username) => {
    if (user?.username === username) {
      toast.warn("No podés eliminar tu propio usuario activo");
      return;
    }

    if (!window.confirm(`¿Eliminar definitivamente el usuario "${username}"?`)) return;

    try {
      await api.delete(`/users/${id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      toast.success(`Usuario "${username}" eliminado`);
      setUsuarios((prev) => prev.filter((u) => u.id_usuario !== id));
    } catch (err) {
      console.error(err);
      toast.error("Error al eliminar usuario");
    }
  };

  // ================================
  // Render
  // ================================
  return (
    <div className="articulos-container">
      <h2 className="module-title">Administrar Usuarios</h2>

      {/* --- Crear usuario --- */}
      <div className="nt-card" style={{ maxWidth: 500, margin: "0 auto" }}>
        <form className="nt-form" onSubmit={handleSubmit}>
          <div className="nt-field">
            <label>Usuario *</label>
            <input
              type="text"
              name="username"
              value={form.username}
              onChange={handleChange}
              placeholder="Ej: juanperez"
              required
            />
          </div>

          <div className="nt-field">
            <label>Nombre completo</label>
            <input
              type="text"
              name="nombre"
              value={form.nombre}
              onChange={handleChange}
              placeholder="Ej: Juan Pérez"
            />
          </div>

          <div className="nt-field">
            <label>Email</label>
            <input
              type="email"
              name="email"
              value={form.email}
              onChange={handleChange}
              placeholder="Ej: juan@empresa.com"
            />
          </div>

          <div className="nt-field">
            <label>Contraseña *</label>
            <input
              type="password"
              name="password"
              value={form.password}
              onChange={handleChange}
              placeholder="••••••••"
              required
            />
          </div>

          <div className="nt-field">
            <label>Confirmar contraseña *</label>
            <input
              type="password"
              name="confirmPassword"
              value={form.confirmPassword}
              onChange={handleChange}
              placeholder="Repetir contraseña"
              required
            />
          </div>

          <div className="nt-field">
            <label>Rol</label>
            <select name="role" value={form.role} onChange={handleChange}>
              <option value="USER">Usuario</option>
              <option value="ADMIN">Administrador</option>
            </select>
          </div>

          <div className="nt-actions" style={{ marginTop: 20 }}>
            <button className="btn-primario" type="submit" disabled={loading}>
              {loading ? "Creando…" : "Crear usuario"}
            </button>
          </div>
        </form>
      </div>

      {/* --- Lista de usuarios --- */}
      <div className="nt-card" style={{ marginTop: 40 }}>
        <h3>Usuarios registrados</h3>
        {loadingUsuarios && <p>Cargando usuarios...</p>}
        {!loadingUsuarios && usuarios.length === 0 && <p>No hay usuarios registrados.</p>}

        {!loadingUsuarios && usuarios.length > 0 && (
          <table className="tabla-basica" style={{ width: "100%", marginTop: 10 }}>
            <thead>
              <tr>
                <th>Usuario</th>
                <th>Nombre</th>
                <th>Email</th>
                <th>Utilidades</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {usuarios.map((u) => (
                <tr key={u.id_usuario}>
                  <td>{u.username}</td>
                  <td>{u.nombre || "-"}</td>
                  <td>{u.email || "-"}</td>
                  <td>{u.utilidades}</td>
                  <td>
                    <button
                      className="btn-secundario"
                      onClick={() => handleDelete(u.id_usuario, u.username)}
                    >
                      Eliminar
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
