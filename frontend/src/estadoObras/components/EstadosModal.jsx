import { useEffect, useState } from "react";
import "../styles/caratulas.css";

async function solicitarJson(url, options = {}) {
  const response = await fetch(url, {
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
    ...options,
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(
      data?.error ||
        data?.detalle ||
        `Error ${response.status} al comunicarse con el servidor`,
    );
  }

  return data;
}

export default function EstadosModal({
  abierto,
  onClose,
  onChanged,
}) {
  const [estados, setEstados] = useState([]);
  const [nuevoEstado, setNuevoEstado] = useState("");
  const [editandoId, setEditandoId] = useState(null);
  const [editandoNombre, setEditandoNombre] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const cargarEstados = async () => {
    try {
      setLoading(true);
      setError("");

      const data = await solicitarJson("/api/estado-resumen/estados");

      setEstados(Array.isArray(data?.rows) ? data.rows : []);
    } catch (err) {
      setError(err.message || "No se pudieron cargar los estados.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (abierto) {
      setNuevoEstado("");
      setEditandoId(null);
      setEditandoNombre("");
      cargarEstados();
    }
  }, [abierto]);

  if (!abierto) {
    return null;
  }

  const crearEstado = async () => {
    const nombre = String(nuevoEstado || "").trim();

    if (!nombre) {
      setError("Escribí el nombre del nuevo estado.");
      return;
    }

    try {
      setLoading(true);
      setError("");

      await solicitarJson("/api/estado-resumen/estados", {
        method: "POST",
        body: JSON.stringify({ nombre }),
      });

      setNuevoEstado("");
      await cargarEstados();
      await onChanged?.();
    } catch (err) {
      setError(err.message || "No se pudo crear el estado.");
    } finally {
      setLoading(false);
    }
  };

  const comenzarEdicion = (estado) => {
    setEditandoId(estado.id_estado);
    setEditandoNombre(estado.nombre || "");
    setError("");
  };

  const cancelarEdicion = () => {
    setEditandoId(null);
    setEditandoNombre("");
  };

  const guardarEdicion = async () => {
    const nombre = String(editandoNombre || "").trim();

    if (!nombre) {
      setError("El nombre del estado no puede quedar vacío.");
      return;
    }

    try {
      setLoading(true);
      setError("");

      await solicitarJson(
        `/api/estado-resumen/estados/${editandoId}`,
        {
          method: "PUT",
          body: JSON.stringify({ nombre }),
        },
      );

      cancelarEdicion();
      await cargarEstados();
      await onChanged?.();
    } catch (err) {
      setError(err.message || "No se pudo editar el estado.");
    } finally {
      setLoading(false);
    }
  };

  const eliminarEstado = async (estado) => {
    const confirmar = window.confirm(
      `¿Eliminar el estado "${estado.nombre}"?`,
    );

    if (!confirmar) {
      return;
    }

    try {
      setLoading(true);
      setError("");

      await solicitarJson(
        `/api/estado-resumen/estados/${estado.id_estado}`,
        {
          method: "DELETE",
        },
      );

      await cargarEstados();
      await onChanged?.();
    } catch (err) {
      setError(err.message || "No se pudo eliminar el estado.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="estados-modal-overlay"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !loading) {
          onClose?.();
        }
      }}
    >
      <div className="estados-modal">
        <div className="estados-modal-header">
          <div>
            <h2>Definir Estados</h2>
            <p>
              Estos estados aparecerán como opciones seleccionables dentro de
              la tabla de Carátulas.
            </p>
          </div>

          <button type="button" onClick={onClose} disabled={loading}>
            ×
          </button>
        </div>

        <div className="estados-crear-row">
          <input
            type="text"
            value={nuevoEstado}
            placeholder="Nuevo estado"
            onChange={(event) => setNuevoEstado(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                crearEstado();
              }
            }}
          />

          <button
            type="button"
            onClick={crearEstado}
            disabled={loading}
          >
            Agregar estado
          </button>
        </div>

        {error && <div className="estados-modal-error">{error}</div>}

        <div className="estados-lista">
          {loading && estados.length === 0 ? (
            <div className="estados-vacio">Cargando...</div>
          ) : estados.length === 0 ? (
            <div className="estados-vacio">
              No hay estados definidos.
            </div>
          ) : (
            estados.map((estado) => (
              <div className="estado-item" key={estado.id_estado}>
                {editandoId === estado.id_estado ? (
                  <>
                    <input
                      type="text"
                      value={editandoNombre}
                      onChange={(event) =>
                        setEditandoNombre(event.target.value)
                      }
                      autoFocus
                    />

                    <button
                      type="button"
                      onClick={guardarEdicion}
                      disabled={loading}
                    >
                      Guardar
                    </button>

                    <button
                      type="button"
                      className="btn-secundario"
                      onClick={cancelarEdicion}
                      disabled={loading}
                    >
                      Cancelar
                    </button>
                  </>
                ) : (
                  <>
                    <span>{estado.nombre}</span>

                    <button
                      type="button"
                      onClick={() => comenzarEdicion(estado)}
                      disabled={loading}
                    >
                      Editar
                    </button>

                    <button
                      type="button"
                      className="btn-peligro"
                      onClick={() => eliminarEstado(estado)}
                      disabled={loading}
                    >
                      Eliminar
                    </button>
                  </>
                )}
              </div>
            ))
          )}
        </div>

        <div className="estados-modal-footer">
          <button type="button" onClick={onClose} disabled={loading}>
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}