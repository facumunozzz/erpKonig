import React, { useState, useEffect } from "react";
import api from "../api/axiosConfig";
import { toast } from "react-toastify";
import "../styles/transferencias.css";
import { useAuth } from "../context/AuthContext";

export default function AdminUsuarios() {
  const { token, user } = useAuth();

  const formInicial = {
    username: "",
    nombre: "",
    email: "",
    password: "",
    confirmPassword: "",
    role: "USER",
  };

  const [form, setForm] = useState(formInicial);
  const [usuarios, setUsuarios] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loadingUsuarios, setLoadingUsuarios] = useState(false);
  const [editandoId, setEditandoId] = useState(null);

  // ================================
  // Cargar usuarios
  // ================================
  const loadUsuarios = async () => {
    setLoadingUsuarios(true);

    try {
      const res = await api.get("/users", {
        headers: { Authorization: `Bearer ${token}` },
      });

      setUsuarios(res.data || []);
    } catch (err) {
      console.error(err);
      toast.error("Error al cargar usuarios");
    } finally {
      setLoadingUsuarios(false);
    }
  };

  useEffect(() => {
    loadUsuarios();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ================================
  // Manejo del formulario
  // ================================
  const handleChange = (e) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  // ================================
  // Editar usuario
  // ================================
  const handleEdit = (u) => {
    setEditandoId(u.id_usuario);

    setForm({
      username: u.username || "",
      nombre: u.nombre || "",
      email: u.email || "",
      password: "",
      confirmPassword: "",
      role: u.roles?.[0] || "USER",
    });

    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  // ================================
  // Cancelar edición
  // ================================
  const cancelarEdicion = () => {
    setEditandoId(null);
    setForm(formInicial);
  };

  // ================================
  // Crear o actualizar usuario
  // ================================
  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!form.username) {
      toast.error("El usuario es obligatorio");
      return;
    }

    // Al crear, la contraseña es obligatoria.
    // Al editar, puede quedar vacía para no modificarla.
    if (!editandoId && !form.password) {
      toast.error("La contraseña es obligatoria al crear un usuario");
      return;
    }

    if (form.password && form.password.length < 6) {
      toast.error("La contraseña debe tener al menos 6 caracteres");
      return;
    }

    if (form.password !== form.confirmPassword) {
      toast.error("Las contraseñas no coinciden");
      return;
    }

    setLoading(true);

    try {
      const payload = {
        username: form.username,
        nombre: form.nombre || null,
        email: form.email || null,
        roles: [form.role],
      };

      // Solo enviamos password si el administrador escribió una nueva.
      if (form.password) {
        payload.password = form.password;
      }

      if (editandoId) {
        await api.put(`/users/${editandoId}`, payload, {
          headers: { Authorization: `Bearer ${token}` },
        });

        toast.success(
          form.password
            ? "Usuario y contraseña actualizados correctamente"
            : "Usuario actualizado correctamente"
        );
      } else {
        await api.post("/users", payload, {
          headers: { Authorization: `Bearer ${token}` },
        });

        toast.success("Usuario creado correctamente");
      }

      setForm(formInicial);
      setEditandoId(null);
      loadUsuarios();

    } catch (err) {
      console.error(err);
      const msg = err?.response?.data?.error || "Error al guardar usuario";
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

      <div className="nt-card" style={{ maxWidth: 500, margin: "0 auto" }}>
        <h3 style={{ marginBottom: 16 }}>
          {editandoId ? "Editar usuario" : "Crear usuario"}
        </h3>

        {editandoId && (
          <p style={{ marginBottom: 16, fontSize: 14, color: "#555" }}>
            Si dejás la contraseña vacía, no se modifica. Si escribís una nueva,
            se reemplaza la contraseña actual del usuario.
          </p>
        )}

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
            <label>
              {editandoId ? "Nueva contraseña" : "Contraseña *"}
            </label>
            <input
              type="password"
              name="password"
              value={form.password}
              onChange={handleChange}
              placeholder={
                editandoId
                  ? "Dejar vacío para no cambiar"
                  : "••••••••"
              }
              required={!editandoId}
            />
          </div>

          <div className="nt-field">
            <label>
              {editandoId ? "Confirmar nueva contraseña" : "Confirmar contraseña *"}
            </label>
            <input
              type="password"
              name="confirmPassword"
              value={form.confirmPassword}
              onChange={handleChange}
              placeholder={
                editandoId
                  ? "Repetir solo si cambiás contraseña"
                  : "Repetir contraseña"
              }
              required={!editandoId}
            />
          </div>

          <div className="nt-field">
            <label>Rol</label>
            <select name="role" value={form.role} onChange={handleChange}>
              <option value="USER">Usuario</option>
              <option value="ADMIN">Administrador</option>
            </select>
          </div>

          <div className="nt-actions" style={{ marginTop: 20, gap: 10 }}>
            <button className="btn-primario" type="submit" disabled={loading}>
              {loading
                ? "Guardando…"
                : editandoId
                  ? "Guardar cambios"
                  : "Crear usuario"}
            </button>

            {editandoId && (
              <button
                className="btn-secundario"
                type="button"
                onClick={cancelarEdicion}
                disabled={loading}
              >
                Cancelar
              </button>
            )}
          </div>
        </form>
      </div>

      <div className="nt-card" style={{ marginTop: 40 }}>
        <h3>Usuarios registrados</h3>

        {loadingUsuarios && <p>Cargando usuarios...</p>}

        {!loadingUsuarios && usuarios.length === 0 && (
          <p>No hay usuarios registrados.</p>
        )}

        {!loadingUsuarios && usuarios.length > 0 && (
          <table className="tabla-basica" style={{ width: "100%", marginTop: 10 }}>
            <thead>
              <tr>
                <th>Usuario</th>
                <th>Nombre</th>
                <th>Email</th>
                <th>Rol</th>
                <th>Activo</th>
                <th>Acciones</th>
              </tr>
            </thead>

            <tbody>
              {usuarios.map((u) => (
                <tr key={u.id_usuario}>
                  <td>{u.username}</td>
                  <td>{u.nombre || "-"}</td>
                  <td>{u.email || "-"}</td>
                  <td>{u.roles?.join(", ") || "-"}</td>
                  <td>{u.is_active ? "Sí" : "No"}</td>
                  <td>
                    <button
                      className="btn-primario"
                      onClick={() => handleEdit(u)}
                      style={{ marginRight: 8 }}
                    >
                      Editar
                    </button>

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