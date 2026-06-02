import { useEffect, useRef } from "react";
import api from "../api/axiosConfig";

export default function AlertaConsumoProduccion() {
  const yaConsultoRef = useRef(false);

  useEffect(() => {
    if (yaConsultoRef.current) return;
    yaConsultoRef.current = true;

    const consultarAlertas = async () => {
      try {
        const res = await api.get("/ajustes/alertas-consumo/pendientes");
        const alertas = Array.isArray(res.data) ? res.data : [];

        if (!alertas.length) return;

        const lineas = alertas.map((a) => {
          return [
            `Movimiento: ${a.numero_movimiento ?? "-"}`,
            `Obra: ${a.obra ?? "-"}`,
            `Versión: ${a.version ?? "-"}`,
            `Código: ${a.codigo ?? "-"}`,
            `Descripción: ${a.descripcion ?? "-"}`,
            `Requerido: ${a.cantidad_requerida ?? "-"}`,
            `Ajustado: ${a.cantidad_ajustada ?? 0}`,
            `Faltante: ${a.cantidad_faltante ?? "-"}`,
            `Motivo: ${a.motivo ?? "-"}`,
          ].join(" | ");
        });

        const mensaje =
          "ATENCIÓN: hubo artículos que no se pudieron consumir automáticamente.\n\n" +
          lineas.join("\n\n");

        window.alert(mensaje);

        await api.put("/ajustes/alertas-consumo/marcar-leidas", {
          ids: alertas.map((a) => a.id_alerta),
        });
      } catch (err) {
        console.error("Error consultando alertas de consumo automático:", err);
      }
    };

    consultarAlertas();
  }, []);

  return null;
}