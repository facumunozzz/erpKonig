import React, { useEffect, useState } from "react";
import api from "../api/axiosConfig";
import "./../styles/articulos.css";

export default function CatalogoModal({
  isOpen,
  onClose,
  tipo,          // "proveedores" | "folios" | "tipos"
  titulo,        // "Proveedores", "Folios", "Tipos"
  singular,      // "Proveedor", "Folio", "Tipo"
  onSaved
}) {
  const [items, setItems] = useState([]);
  const [nuevo, setNuevo] = useState("");
  const [editId, setEditId] = useState(null);
  const [editNombre, setEditNombre] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const [loading, setLoading] = useState(false);

  const cargar = async () => {
    try {
      setLoading(true);
      setErrorMsg("");
      const res = await api.get(`/catalogos/${tipo}`);
      setItems(res.data || []);
    } catch (err) {
      console.error(err);
      setErrorMsg(`Error al cargar ${titulo.toLowerCase()}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      setNuevo("");
      setEditId(null);
      setEditNombre("");
      setErrorMsg("");
      cargar();
    }
  }, [isOpen, tipo]);

  const crear = async () => {
    try {
      setErrorMsg("");
      await api.post(`/catalogos/${tipo}`, { nombre: nuevo });
      setNuevo("");
      await cargar();
      onSaved?.();
    } catch (err) {
      console.error(err);
      setErrorMsg(err.response?.data?.error || `Error al crear ${singular.toLowerCase()}`);
    }
  };

  const guardarEdicion = async () => {
    try {
      setErrorMsg("");
      await api.put(`/catalogos/${tipo}/${editId}`, { nombre: editNombre });
      setEditId(null);
      setEditNombre("");
      await cargar();
      onSaved?.();
    } catch (err) {
      console.error(err);
      setErrorMsg(err.response?.data?.error || `Error al actualizar ${singular.toLowerCase()}`);
    }
  };

  const eliminar = async (id) => {
    try {
      setErrorMsg("");
      await api.delete(`/catalogos/${tipo}/${id}`);
      await cargar();
      onSaved?.();
    } catch (err) {
      console.error(err);
      setErrorMsg(err.response?.data?.error || `Error al eliminar ${singular.toLowerCase()}`);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="modal">
      <div className="modal-contenido" style={{ width: 600, maxWidth: "95%" }}>
        <div className="modal-header">
          <h3>Administrar {titulo}</h3>
        </div>

        <div className="modal-body">
          <div className="campo-linea">
            <label>Nuevo {singular}</label>
            <div style={{ display: "flex", gap: 8 }}>
              <input
                type="text"
                value={nuevo}
                onChange={(e) => setNuevo(e.target.value)}
                placeholder={`Ingrese ${singular.toLowerCase()}`}
              />
              <button className="btn-primario" onClick={crear}>
                Agregar
              </button>
            </div>
          </div>

          <hr />

          {loading ? (
            <div>Cargando...</div>
          ) : (
            <div style={{ maxHeight: 320, overflowY: "auto" }}>
              {items.length === 0 ? (
                <div>No hay datos cargados.</div>
              ) : (
                items.map((it) => (
                  <div
                    key={it.id}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      marginBottom: 8,
                    }}
                  >
                    {editId === it.id ? (
                      <>
                        <input
                          value={editNombre}
                          onChange={(e) => setEditNombre(e.target.value)}
                        />
                        <button className="btn-editar" onClick={guardarEdicion}>
                          Guardar
                        </button>
                        <button
                          className="btn-secundario"
                          onClick={() => {
                            setEditId(null);
                            setEditNombre("");
                          }}
                        >
                          Cancelar
                        </button>
                      </>
                    ) : (
                      <>
                        <input value={it.nombre} disabled />
                        <button
                          className="btn-editar"
                          onClick={() => {
                            setEditId(it.id);
                            setEditNombre(it.nombre);
                          }}
                        >
                          Editar
                        </button>
                        <button
                          className="btn-eliminar"
                          onClick={() => eliminar(it.id)}
                        >
                          Eliminar
                        </button>
                      </>
                    )}
                  </div>
                ))
              )}
            </div>
          )}

          {errorMsg && (
            <div style={{ color: "red", marginTop: 10 }}>{errorMsg}</div>
          )}
        </div>

        <div className="modal-footer">
          <button className="btn-secundario" onClick={onClose}>
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}