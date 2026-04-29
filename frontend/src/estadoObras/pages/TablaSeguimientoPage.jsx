import { useEffect, useMemo, useState } from "react";
import "../components/styles/TablaSeguimientoPage.css";

function splitObra(obra) {
  const texto = String(obra || "").trim();

  if (!texto) {
    return { caratula: "", version: "" };
  }

  // toma como separador . o ,
  const match = texto.match(/^([^.,]+)[.,]?(.*)$/);

  if (!match) {
    return { caratula: texto, version: "" };
  }

  return {
    caratula: String(match[1] || "").trim(),
    version: String(match[2] || "").trim(),
  };
}

function getEstadoOperacion(op) {
  const pedido = Number(op?.pedido || 0);
  const fabricado = Number(op?.fabricado || 0);

  if (pedido > 0 && fabricado >= pedido) return "OK";
  if (pedido > 0 && fabricado > 0 && fabricado < pedido) return "Fabricando";
  if (pedido > 0 && fabricado === 0) return "Comenzar";
  return "";
}

function buildRowFromObra(obra) {
  const { caratula, version } = splitObra(obra?.obra);

  const operaciones = Array.isArray(obra?.operaciones) ? obra.operaciones : [];

  const findEstado = (nombreOperacion) => {
    const op = operaciones.find((x) => x?.nombre === nombreOperacion);
    return getEstadoOperacion(op);
  };

  const preparacion = findEstado("PREPARACIÓN PERFIL");
  const corteRefuerzo = findEstado("CORTE REFUERZO");
  const cortePerfil = findEstado("CORTE PERFIL");
  const mecanizado = findEstado("MECANIZADO");
  const soldado = findEstado("SOLDADURA AUTO");
  const armado = findEstado("ARMADO");
  const acristalado = findEstado("ACRISTALADO");
  const mosquiteros = findEstado("MOSQUITERO");

  const pedidoPrincipal = operaciones.reduce((max, op) => {
  const pedido = Number(op?.pedido || 0);
    return pedido > max ? pedido : max;
  }, 0);

  const estadosOperaciones = [
    preparacion,
    corteRefuerzo,
    cortePerfil,
    mecanizado,
    soldado,
    armado,
    acristalado,
    mosquiteros,
  ];

  const terminado =
    estadosOperaciones.length > 0 &&
    estadosOperaciones.every((estado) => estado === "OK")
      ? "OK"
      : "";

  return {
    id: obra?.id || obra?.obra,
    caratula,
    version,
    etapa: "",
    comercial: "",
    aProducir: pedidoPrincipal,
    color: "",
    vidrio: "",
    estVid: "",
    fechaEntrega: "",
    preparacion,
    corteRefuerzo,
    cortePerfil,
    mecanizado,
    soldado,
    armado,
    acristalado,
    mosquiteros,
    terminado,
  };
}

export default function TablaSeguimientoPage() {
  const [obras, setObras] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");

  useEffect(() => {
    cargarDatos();
  }, []);

  async function cargarDatos() {
    try {
      setLoading(true);
      setError("");

      const res = await fetch("/api/dashboard-obras");
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data?.error || "No se pudo cargar la tabla de seguimiento");
      }

      setObras(Array.isArray(data?.rows) ? data.rows : []);
    } catch (err) {
      setError(err.message || "Error inesperado");
    } finally {
      setLoading(false);
    }
  }

  const rows = useMemo(() => {
    const base = obras.map(buildRowFromObra);

    const filtro = search.trim().toLowerCase();
    if (!filtro) return base;

    return base.filter((row) => {
      return (
        String(row.caratula).toLowerCase().includes(filtro) ||
        String(row.version).toLowerCase().includes(filtro)
      );
    });
  }, [obras, search]);

  return (
    <div className="tabla-seguimiento-page">
      <div className="tabla-seguimiento-header">
        <h2>Tabla de seguimiento</h2>

        <div className="tabla-seguimiento-actions">
          <input
            type="text"
            placeholder="Buscar por carátula o versión..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />

          <button onClick={cargarDatos}>Actualizar</button>
        </div>
      </div>

      {loading && <p>Cargando tabla de seguimiento...</p>}
      {error && <p className="tabla-error">{error}</p>}

      {!loading && !error && (
        <div className="tabla-seguimiento-wrapper">
          <table className="tabla-seguimiento">
            <thead>
              <tr>
                <th>Caratula</th>
                <th>Version</th>
                <th>Etapa</th>
                <th>Comercial</th>
                <th>A producir</th>
                <th>Color</th>
                <th>Vidrio</th>
                <th>Est.Vid</th>
                <th>Fecha de Entrega</th>
                <th>Preparación</th>
                <th>Corte Refuerzo</th>
                <th>Corte Perfil</th>
                <th>Mecanizado</th>
                <th>Soldado</th>
                <th>Armado</th>
                <th>Acristalado</th>
                <th>Mosquiteros</th>
                <th>Terminado</th>
              </tr>
            </thead>

            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={18} style={{ textAlign: "center" }}>
                    No hay datos para mostrar
                  </td>
                </tr>
              ) : (
                rows.map((row) => (
                  <tr key={row.id}>
                    <td>{row.caratula}</td>
                    <td>{row.version}</td>
                    <td>{row.etapa}</td>
                    <td>{row.comercial}</td>
                    <td>{row.aProducir}</td>
                    <td>{row.color}</td>
                    <td>{row.vidrio}</td>
                    <td>{row.estVid}</td>
                    <td>{row.fechaEntrega}</td>
                    <td className={`estado-cell ${row.preparacion?.toLowerCase() || ""}`}>
                      {row.preparacion}
                    </td>
                    <td className={`estado-cell ${row.corteRefuerzo?.toLowerCase() || ""}`}>
                      {row.corteRefuerzo}
                    </td>
                    <td className={`estado-cell ${row.cortePerfil?.toLowerCase() || ""}`}>
                      {row.cortePerfil}
                    </td>
                    <td className={`estado-cell ${row.mecanizado?.toLowerCase() || ""}`}>
                      {row.mecanizado}
                    </td>
                    <td className={`estado-cell ${row.soldado?.toLowerCase() || ""}`}>
                      {row.soldado}
                    </td>
                    <td className={`estado-cell ${row.armado?.toLowerCase() || ""}`}>
                      {row.armado}
                    </td>
                    <td className={`estado-cell ${row.acristalado?.toLowerCase() || ""}`}>
                      {row.acristalado}
                    </td>
                    <td className={`estado-cell ${row.mosquiteros?.toLowerCase() || ""}`}>
                      {row.mosquiteros}
                    </td>
                    <td className={`estado-cell ${row.terminado?.toLowerCase() || ""}`}>
                      {row.terminado}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}