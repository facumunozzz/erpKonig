import { useState } from "react";
import EstadoCargaModal from "./EstadoCargaModal";
import "./styles/EstadoResumenTable.css";

const ESTADOS = [
  "Obras finalizadas con faltantes de INSTALACIÓN",
  "Producción en proceso",
  "En espera por faltantes",
  "Reprocesos y especiales",
  "Para producción",
  "En planificación",
  "Revisión y análisis",
  "Enviado a producir comercial",
  "Acopios",
  "Obras cerradas",
  "Acopios especiales - Obras no cerradas",
];

export default function EstadoResumenTable() {
  const [estadoSeleccionado, setEstadoSeleccionado] = useState(null);

  return (
    <div className="estado-resumen-wrap">
      <table className="estado-resumen-table">
        <thead>
          <tr>
            <th>Acción</th>
            <th>Estado</th>
            <th>Carátula</th>
            <th>Versión</th>
            <th>Fase</th>
            <th>MRP</th>
            <th>Fecha MRP</th>
            <th>Prioridad</th>
            <th>Etapa</th>
            <th>Estado</th>
            <th>Referencia</th>
            <th>Color</th>
            <th>Carpintería</th>
            <th>Vidrio</th>
            <th>Recepción</th>
            <th>Premarcos</th>
            <th>Mosquitero</th>
            <th>Complejidad</th>
            <th>Inicio Prod.</th>
            <th>Disponibilidad</th>
            <th>Comentario</th>
          </tr>
        </thead>
        <tbody>
          {ESTADOS.map((estado) => (
            <tr key={estado}>
              <td>
                <button
                  type="button"
                  className="btn-add"
                  onClick={() => setEstadoSeleccionado(estado)}
                >
                  +
                </button>
              </td>
              <td>{estado}</td>
              <td colSpan={19}></td>
            </tr>
          ))}
        </tbody>
      </table>

      {estadoSeleccionado && (
        <EstadoCargaModal
          estado={estadoSeleccionado}
          onClose={() => setEstadoSeleccionado(null)}
          onSaved={() => {
            setEstadoSeleccionado(null);
          }}
        />
      )}
    </div>
  );
}