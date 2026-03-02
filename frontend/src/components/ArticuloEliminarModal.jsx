import React, { useEffect, useState } from "react";
import api from "../api/axiosConfig";
import "./../styles/articulos.css";

export default function ArticuloEliminarModal({
  isOpen,
  onClose,
  articuloRow,
  onDeleted
}) {
  const [errorMsg, setErrorMsg] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setErrorMsg("");
    setLoading(false);
  }, [isOpen]);

  const eliminar = async () => {
    setErrorMsg("");

    if (!articuloRow?.id_articulo) return setErrorMsg("ID inválido");

    try {
      setLoading(true);

      await api.delete(`/articulos/${articuloRow.id_articulo}/full`);

      onDeleted?.();
      onClose?.();
    } catch (err) {
      console.error(err);
      setErrorMsg(
        err.response?.data?.error ||
        err.response?.data?.detalle ||
        "Error al eliminar"
      );
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="modal">
      <div className="modal-contenido">
        <div className="modal-header">
          <h3>Eliminar Artículo</h3>
        </div>

        <div className="modal-body">
          <div style={{ marginBottom: 10 }}>
            <div><b>Código:</b> {articuloRow?.codigo ?? ""}</div>
            <div><b>Descripción:</b> {articuloRow?.descripcion ?? ""}</div>

            <div style={{ color: "#b91c1c", marginTop: 10 }}>
              ⚠️ Esta acción elimina el artículo y todas sus clasificaciones asociadas.
            </div>
          </div>

          {errorMsg && (
            <div style={{ color: "red", marginTop: 8 }}>
              {errorMsg}
            </div>
          )}
        </div>

        <div className="modal-footer">
          <button className="btn-secundario" onClick={onClose} disabled={loading}>
            Cancelar
          </button>

          <button className="btn-primario" onClick={eliminar} disabled={loading}>
            {loading ? "Eliminando..." : "Confirmar eliminación"}
          </button>
        </div>
      </div>
    </div>
  );
}
