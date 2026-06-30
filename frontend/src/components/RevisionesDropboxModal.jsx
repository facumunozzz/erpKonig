import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../api/axiosConfig";
import "./../styles/transferencias.css";

export default function RevisionesDropboxModal({
  abierto,
  onClose,
  onChanged,
}) {
  const navigate = useNavigate();

  const [lineas, setLineas] = useState([]);
  const [cargando, setCargando] = useState(false);
  const [navegandoId, setNavegandoId] = useState(null);
  const [error, setError] = useState("");

  const cargarLineas = async () => {
    try {
      setCargando(true);
      setError("");

      const response = await api.get(
        "/ajustes/alertas-consumo/pendientes",
      );

      const payload = response.data;

      const lista = Array.isArray(payload)
        ? payload
        : Array.isArray(payload?.data)
          ? payload.data
          : Array.isArray(payload?.alertas)
            ? payload.alertas
            : [];

      setLineas(lista);
    } catch (err) {
      console.error(
        "Error cargando revisiones de Dropbox:",
        err,
      );

      setLineas([]);

      setError(
        err.response?.data?.error ||
          err.response?.data?.detalle ||
          "No se pudieron cargar las líneas en revisión.",
      );
    } finally {
      setCargando(false);
    }
  };

  useEffect(() => {
    if (abierto) {
      cargarLineas();
    }
  }, [abierto]);

  const construirParametros = (linea) => {
    const cantidadFaltante = Math.abs(
      Number(linea.cantidad_faltante || 0),
    );

    const parametros = new URLSearchParams();

    parametros.set("desdeAlerta", "1");

    parametros.set(
      "alertaId",
      String(linea.id_alerta || ""),
    );

    parametros.set(
      "numeroMovimiento",
      String(linea.numero_movimiento || ""),
    );

    parametros.set(
      "codigo",
      String(linea.codigo || "").trim(),
    );

    parametros.set(
      "descripcion",
      String(linea.descripcion || "").trim(),
    );

    parametros.set(
      "cantidad",
      Number.isFinite(cantidadFaltante)
        ? String(cantidadFaltante)
        : "",
    );

    parametros.set(
      "obra",
      String(linea.obra || "").trim(),
    );

    parametros.set(
      "version",
      String(linea.version || "").trim(),
    );

    parametros.set(
      "fecha",
      linea.fecha_linea
        ? String(linea.fecha_linea).slice(0, 10)
        : "",
    );

    /*
     * Se utiliza el número del movimiento original
     * como referencia del nuevo ajuste o transferencia.
     */
    parametros.set(
      "remitoReferencia",
      String(linea.numero_movimiento || ""),
    );

    parametros.set(
      "motivoAlerta",
      String(linea.motivo || "").trim(),
    );

    return parametros;
  };

  const resolverLinea = (linea) => {
    const opcion = window.prompt(
      [
        "¿Cómo querés resolver esta revisión?",
        "",
        "1 - Crear un nuevo ajuste",
        "2 - Crear una nueva transferencia",
        "",
        `Obra: ${linea.obra || "-"}`,
        `Versión: ${linea.version || "-"}`,
        `Código: ${linea.codigo || "-"}`,
        `Faltante: ${linea.cantidad_faltante ?? "-"}`,
        "",
        "Ingresá 1 o 2:",
      ].join("\n"),
    );

    if (opcion === null) {
      return;
    }

    const opcionNormalizada = String(opcion).trim();

    if (
      opcionNormalizada !== "1" &&
      opcionNormalizada !== "2"
    ) {
      window.alert(
        "Opción inválida. Ingresá 1 para crear un ajuste o 2 para crear una transferencia.",
      );

      return;
    }

    const parametros = construirParametros(linea);

    setNavegandoId(linea.id_alerta);

    /*
     * Se cierra el modal, pero NO se marca
     * la alerta como leída.
     */
    if (typeof onClose === "function") {
      onClose();
    }

    if (opcionNormalizada === "1") {
      navigate(
        `/ajustes/nuevo?${parametros.toString()}`,
      );

      return;
    }

    navigate(
      `/transferencias/nueva?${parametros.toString()}`,
    );
  };

  const cerrar = () => {
    if (navegandoId !== null) {
      return;
    }

    if (typeof onClose === "function") {
      onClose();
    }
  };

  if (!abierto) {
    return null;
  }

  return (
    <div
      className="modal-backdrop"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 999999,
        background: "rgba(0,0,0,0.45)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 20,
      }}
      onMouseDown={(event) => {
        if (
          event.target.classList.contains(
            "modal-backdrop",
          )
        ) {
          cerrar();
        }
      }}
    >
      <div
        className="modal-card"
        style={{
          position: "relative",
          width: "min(1250px, 97vw)",
          maxHeight: "92vh",
          overflowY: "auto",
        }}
      >
        <div className="modal-head">
          <div>
            <h3>Líneas de Dropbox en revisión</h3>

            <div
              style={{
                fontSize: 13,
                marginTop: 4,
              }}
            >
              Pendientes: {lineas.length}
            </div>
          </div>

          <button
            type="button"
            onClick={cerrar}
            disabled={navegandoId !== null}
          >
            ✕
          </button>
        </div>

        {error && (
          <div
            className="nt-error"
            style={{
              marginTop: 12,
              whiteSpace: "pre-line",
            }}
          >
            {error}
          </div>
        )}

        <div
          style={{
            display: "flex",
            justifyContent: "flex-end",
            marginTop: 12,
          }}
        >
          <button
            type="button"
            onClick={cargarLineas}
            disabled={
              cargando ||
              navegandoId !== null
            }
          >
            {cargando
              ? "Actualizando..."
              : "↻ Actualizar"}
          </button>
        </div>

        <div
          style={{
            overflowX: "auto",
            marginTop: 12,
          }}
        >
          <table className="tabla-transferencias">
            <thead>
              <tr>
                <th>Fecha línea</th>
                <th>Movimiento</th>
                <th>Obra</th>
                <th>Versión</th>
                <th>Código</th>
                <th>Descripción</th>
                <th>Requerido</th>
                <th>Ajustado</th>
                <th>Faltante</th>
                <th>Motivo</th>
                <th>Acción</th>
              </tr>
            </thead>

            <tbody>
              {lineas.map((linea) => (
                <tr key={linea.id_alerta}>
                  <td>
                    {formatearFecha(
                      linea.fecha_linea,
                    )}
                  </td>

                  <td>
                    {linea.numero_movimiento ?? ""}
                  </td>

                  <td>{linea.obra || ""}</td>

                  <td>{linea.version || ""}</td>

                  <td>{linea.codigo || ""}</td>

                  <td>
                    {linea.descripcion || ""}
                  </td>

                  <td
                    style={{
                      textAlign: "right",
                    }}
                  >
                    {linea.cantidad_requerida ?? ""}
                  </td>

                  <td
                    style={{
                      textAlign: "right",
                    }}
                  >
                    {linea.cantidad_ajustada ?? ""}
                  </td>

                  <td
                    style={{
                      textAlign: "right",
                      fontWeight: 700,
                    }}
                  >
                    {linea.cantidad_faltante ?? ""}
                  </td>

                  <td>{linea.motivo || ""}</td>

                  <td>
                    <button
                      type="button"
                      className="btn-primary"
                      onClick={() =>
                        resolverLinea(linea)
                      }
                      disabled={
                        navegandoId !== null
                      }
                    >
                      {navegandoId ===
                      linea.id_alerta
                        ? "Abriendo..."
                        : "Resolver"}
                    </button>
                  </td>
                </tr>
              ))}

              {!cargando &&
                lineas.length === 0 && (
                  <tr>
                    <td colSpan={11}>
                      No hay líneas pendientes de revisión.
                    </td>
                  </tr>
                )}

              {cargando && (
                <tr>
                  <td colSpan={11}>
                    Cargando líneas...
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div
          className="modal-foot"
          style={{
            marginTop: 18,
          }}
        >
          <button
            type="button"
            onClick={cerrar}
            disabled={navegandoId !== null}
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}

function formatearFecha(value) {
  if (!value) {
    return "";
  }

  const text = String(value).slice(0, 10);
  const partes = text.split("-");

  if (partes.length !== 3) {
    return text;
  }

  return `${partes[2]}/${partes[1]}/${partes[0]}`;
}