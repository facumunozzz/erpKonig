import React, { useEffect, useState } from "react";
import api from "../api/axiosConfig";
import * as XLSX from "xlsx";
import "./../styles/transferencias.css";

function Movimientos() {
  const [rows, setRows] = useState([]);
  const [filtered, setFiltered] = useState([]);

  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [gotoPage, setGotoPage] = useState("");

  const [showEdit, setShowEdit] = useState(false);
  const [movEdit, setMovEdit] = useState(null);
  const [referentes, setReferentes] = useState([]);

  const filtrosIniciales = {
    numero_transaccion: "",
    fecha: "",
    fecha_real: "",
    codigo: "",
    descripcion: "",
    cantidad: "",
    deposito_origen: "",
    deposito_destino: "",
    tipo_transaccion: "",
    remito_referencia: "",
    obra: "",
    version: "",
    referente: "",
    proveedor: "",
    ingreso_egreso: "",
    usuario: "",
  };

  const [filtros, setFiltros] = useState(filtrosIniciales);

  const formatFecha = (value) => {
    if (!value) return "";

    const d = new Date(value);

    if (Number.isNaN(d.getTime())) return "";

    return d.toLocaleDateString("es-AR");
  };

  const limpiarFiltros = () => {
    setFiltros(filtrosIniciales);
    setFiltered(rows || []);
    setCurrentPage(1);
    setGotoPage("");
  };

  const cargarMovimientos = () => {
    api
      .get("/movimientos")
      .then((res) => {
        setRows(res.data || []);
        setFiltered(res.data || []);
      })
      .catch((err) => console.error(err));
  };

  const cargarReferentes = async () => {
    try {
      const res = await api.get("/referentes");
      setReferentes((res.data || []).filter((r) => r.activo));
    } catch (err) {
      console.error("Error cargando actuantes:", err);
      alert("No se pudieron cargar los actuantes.");
    }
  };

  useEffect(() => {
    cargarMovimientos();
    cargarReferentes();
  }, []);

  const getValueForFilter = (r, key) => {
    const values = {
      numero_transaccion: r.numero_transaccion ?? "",
      fecha: formatFecha(r.fecha),
      fecha_real: formatFecha(r.fecha_real),
      codigo: r.codigo ?? "",
      descripcion: r.descripcion ?? "",
      cantidad: String(r.cantidad ?? ""),
      deposito_origen: r.deposito_origen ?? "",
      deposito_destino: r.deposito_destino ?? "",
      tipo_transaccion: r.tipo_transaccion ?? "",
      remito_referencia: r.remito_referencia ?? "",
      obra: r.obra ?? "",
      version: r.version ?? "",
      referente: r.referente ?? "",
      proveedor: r.proveedor ?? "",
      ingreso_egreso: r.ingreso_egreso ?? "",
      usuario: r.usuario ?? "",
    };

    return String(values[key] ?? "");
  };

  const onFilterChange = (key, val) => {
    const value = String(val ?? "").toLowerCase();

    const nf = {
      ...filtros,
      [key]: value,
    };

    setFiltros(nf);

    const f = (rows || []).filter((r) =>
      Object.keys(nf).every((k) =>
        getValueForFilter(r, k).toLowerCase().includes(nf[k])
      )
    );

    setFiltered(f);
    setCurrentPage(1);
  };

  const abrirEdicion = (r) => {
    setMovEdit({
      numero_transaccion: r.numero_transaccion ?? "",
      tipo_transaccion: r.tipo_transaccion ?? "",
      remito_referencia: r.remito_referencia ?? "",
      obra: r.obra ?? "",
      version: r.version ?? "",
      referente: r.referente ?? "",
      id_referente: r.id_referente ?? "",
    });

    setShowEdit(true);
  };

  const guardarEdicion = async () => {
    if (!movEdit) return;

    try {
      await api.put("/movimientos", {
        tipo_transaccion: movEdit.tipo_transaccion,
        numero_transaccion: movEdit.numero_transaccion,
        remito_referencia: movEdit.remito_referencia || null,
        obra: movEdit.obra || null,
        version: movEdit.version || null,
        id_referente: movEdit.id_referente || null,
      });

      setShowEdit(false);
      setMovEdit(null);
      cargarMovimientos();
    } catch (err) {
      alert(
        err.response?.data?.error ||
          err.response?.data?.detalle ||
          "Error al actualizar movimiento"
      );
    }
  };

  const totalPages = Math.ceil(filtered.length / pageSize) || 1;

  const paginated = filtered.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize
  );

  const irPagina = (p) => {
    if (p < 1 || p > totalPages) return;
    setCurrentPage(p);
  };

  const from = filtered.length === 0 ? 0 : (currentPage - 1) * pageSize + 1;
  const to = Math.min(currentPage * pageSize, filtered.length);

  const exportarExcel = () => {
    const data = (filtered.length ? filtered : rows).map((r) => ({
      "Número de transacción": r.numero_transaccion ?? "",
      Fecha: formatFecha(r.fecha),
      "Fecha Real": formatFecha(r.fecha_real),
      Código: r.codigo ?? "",
      Descripción: r.descripcion ?? "",
      Cantidad: r.cantidad ?? "",
      "Depósito Origen": r.deposito_origen ?? "",
      "Depósito Destino": r.deposito_destino ?? "",
      "Tipo de transacción": r.tipo_transaccion ?? "",
      "Remito/Referencia": r.remito_referencia ?? "",
      Obra: r.obra ?? "",
      Versión: r.version ?? "",
      Actuante: r.referente ?? "",
      Proveedor: r.proveedor ?? "",
      "E/I": r.ingreso_egreso ?? "",
      Usuario: r.usuario ?? "",
    }));

    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();

    XLSX.utils.book_append_sheet(wb, ws, "Movimientos");
    XLSX.writeFile(wb, "movimientos.xlsx");
  };

  return (
    <div className="transferencias-page">
      <h2 className="module-title">Movimientos</h2>

      <div
        className="acciones"
        style={{
          marginBottom: 12,
          display: "flex",
          gap: 8,
          flexWrap: "wrap",
        }}
      >
        <button onClick={exportarExcel}>Exportar a Excel</button>
        <button onClick={limpiarFiltros}>Limpiar filtros</button>
        <button onClick={cargarMovimientos}>↻ Actualizar</button>
      </div>

      <div className="tabla-articulos-container">
        <table className="tabla-movimientos">
          <thead>
            <tr>
              <th>
                Número de transacción
                <br />
                <input
                  value={filtros.numero_transaccion}
                  onChange={(e) =>
                    onFilterChange("numero_transaccion", e.target.value)
                  }
                />
              </th>

              <th>
                Fecha
                <br />
                <input
                  value={filtros.fecha}
                  onChange={(e) => onFilterChange("fecha", e.target.value)}
                />
              </th>

              <th>
                Fecha Real
                <br />
                <input
                  value={filtros.fecha_real}
                  onChange={(e) =>
                    onFilterChange("fecha_real", e.target.value)
                  }
                />
              </th>

              <th>
                Código
                <br />
                <input
                  value={filtros.codigo}
                  onChange={(e) => onFilterChange("codigo", e.target.value)}
                />
              </th>

              <th>
                Descripción
                <br />
                <input
                  value={filtros.descripcion}
                  onChange={(e) =>
                    onFilterChange("descripcion", e.target.value)
                  }
                />
              </th>

              <th style={{ textAlign: "right" }}>
                Cantidad
                <br />
                <input
                  value={filtros.cantidad}
                  onChange={(e) => onFilterChange("cantidad", e.target.value)}
                />
              </th>

              <th>
                Depósito Origen
                <br />
                <input
                  value={filtros.deposito_origen}
                  onChange={(e) =>
                    onFilterChange("deposito_origen", e.target.value)
                  }
                />
              </th>

              <th>
                Depósito Destino
                <br />
                <input
                  value={filtros.deposito_destino}
                  onChange={(e) =>
                    onFilterChange("deposito_destino", e.target.value)
                  }
                />
              </th>

              <th>
                Tipo de transacción
                <br />
                <input
                  value={filtros.tipo_transaccion}
                  onChange={(e) =>
                    onFilterChange("tipo_transaccion", e.target.value)
                  }
                />
              </th>

              <th>
                Remito/Referencia
                <br />
                <input
                  value={filtros.remito_referencia}
                  onChange={(e) =>
                    onFilterChange("remito_referencia", e.target.value)
                  }
                />
              </th>

              <th>
                Obra
                <br />
                <input
                  value={filtros.obra}
                  onChange={(e) => onFilterChange("obra", e.target.value)}
                />
              </th>

              <th>
                Versión
                <br />
                <input
                  value={filtros.version}
                  onChange={(e) => onFilterChange("version", e.target.value)}
                />
              </th>

              <th>
                Actuante
                <br />
                <input
                  value={filtros.referente}
                  onChange={(e) => onFilterChange("referente", e.target.value)}
                />
              </th>

              <th>
                Proveedor
                <br />
                <input
                  value={filtros.proveedor}
                  onChange={(e) => onFilterChange("proveedor", e.target.value)}
                />
              </th>

              <th>
                E/I
                <br />
                <input
                  value={filtros.ingreso_egreso}
                  onChange={(e) =>
                    onFilterChange("ingreso_egreso", e.target.value)
                  }
                />
              </th>

              <th>
                Usuario
                <br />
                <input
                  value={filtros.usuario}
                  onChange={(e) => onFilterChange("usuario", e.target.value)}
                />
              </th>

              <th>Acción</th>
            </tr>
          </thead>

          <tbody>
            {paginated.length === 0 ? (
              <tr>
                <td colSpan={17}>Sin movimientos.</td>
              </tr>
            ) : (
              paginated.map((r, i) => {
                const editable =
                  r.tipo_transaccion === "AJUSTE" ||
                  r.tipo_transaccion === "TRANSFERENCIA";

                return (
                  <tr key={i}>
                    <td>{r.numero_transaccion ?? ""}</td>
                    <td>{formatFecha(r.fecha)}</td>
                    <td>{formatFecha(r.fecha_real)}</td>
                    <td>{r.codigo ?? ""}</td>
                    <td>{r.descripcion ?? ""}</td>
                    <td style={{ textAlign: "right" }}>{r.cantidad ?? ""}</td>
                    <td>{r.deposito_origen ?? ""}</td>
                    <td>{r.deposito_destino ?? ""}</td>
                    <td>{r.tipo_transaccion ?? ""}</td>
                    <td>{r.remito_referencia ?? ""}</td>
                    <td>{r.obra ?? ""}</td>
                    <td>{r.version ?? ""}</td>
                    <td>{r.referente ?? ""}</td>
                    <td>{r.proveedor ?? ""}</td>
                    <td>{r.ingreso_egreso ?? ""}</td>
                    <td>{r.usuario ?? ""}</td>
                    <td>
                      {editable ? (
                        <button
                          className="btn-light"
                          onClick={() => abrirEdicion(r)}
                        >
                          Editar
                        </button>
                      ) : (
                        ""
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <div className="paginado-pro">
        <div className="paginado-info">
          Mostrando {from}-{to} de {filtered.length}
        </div>

        <div className="paginado-size">
          <select
            value={pageSize}
            onChange={(e) => {
              setPageSize(Number(e.target.value));
              setCurrentPage(1);
            }}
          >
            <option value={10}>10</option>
            <option value={25}>25</option>
            <option value={50}>50</option>
            <option value={100}>100</option>
          </select>
        </div>

        <div className="paginado-goto">
          Ir a:
          <input
            type="number"
            min="1"
            max={totalPages}
            value={gotoPage}
            onChange={(e) => setGotoPage(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                irPagina(Number(gotoPage));
                setGotoPage("");
              }
            }}
          />
        </div>

        <div className="paginado-botones">
          <button
            className="pg-btn"
            onClick={() => irPagina(1)}
            disabled={currentPage === 1}
          >
            ⏮
          </button>

          <button
            className="pg-btn"
            onClick={() => irPagina(currentPage - 1)}
            disabled={currentPage === 1}
          >
            ◀
          </button>

          {Array.from({ length: totalPages }, (_, i) => i + 1)
            .filter(
              (p) =>
                p === 1 ||
                p === totalPages ||
                Math.abs(p - currentPage) <= 1
            )
            .map((p, i, arr) => (
              <React.Fragment key={p}>
                {i > 0 && p - arr[i - 1] > 1 && (
                  <span className="pg-dots">…</span>
                )}

                <button
                  className={`pg-btn ${currentPage === p ? "activo" : ""}`}
                  onClick={() => irPagina(p)}
                >
                  {p}
                </button>
              </React.Fragment>
            ))}

          <button
            className="pg-btn"
            onClick={() => irPagina(currentPage + 1)}
            disabled={currentPage === totalPages}
          >
            ▶
          </button>

          <button
            className="pg-btn"
            onClick={() => irPagina(totalPages)}
            disabled={currentPage === totalPages}
          >
            ⏭
          </button>
        </div>
      </div>

      {showEdit && movEdit && (
        <div
          className="modal-backdrop"
          style={{ position: "fixed", inset: 0, zIndex: 999999 }}
          onMouseDown={(e) => {
            if (e.target.classList.contains("modal-backdrop")) {
              setShowEdit(false);
            }
          }}
        >
          <div className="modal-card" style={{ position: "relative", zIndex: 999999 }}>
            <div className="modal-head">
              <h3>Editar movimiento</h3>
              <button onClick={() => setShowEdit(false)}>✕</button>
            </div>

            <div
              className="modal-row"
              style={{
                flexDirection: "column",
                alignItems: "stretch",
                gap: 8,
              }}
            >
              <label>Número de transacción</label>
              <input value={movEdit.numero_transaccion} readOnly />

              <label>Tipo</label>
              <input value={movEdit.tipo_transaccion} readOnly />

              <label>Remito / Referencia</label>
              <input
                value={movEdit.remito_referencia}
                onChange={(e) =>
                  setMovEdit((prev) => ({
                    ...prev,
                    remito_referencia: e.target.value,
                  }))
                }
              />

              {movEdit.tipo_transaccion === "AJUSTE" && (
                <>
                  <label>Obra</label>
                  <input
                    type="number"
                    value={movEdit.obra}
                    onChange={(e) =>
                      setMovEdit((prev) => ({
                        ...prev,
                        obra: e.target.value.replace(/[^0-9]/g, ""),
                      }))
                    }
                  />

                  <label>Versión</label>
                  <input
                    type="number"
                    value={movEdit.version}
                    onChange={(e) =>
                      setMovEdit((prev) => ({
                        ...prev,
                        version: e.target.value.replace(/[^0-9]/g, ""),
                      }))
                    }
                  />
                </>
              )}

              <label>Actuante</label>
              <select
                value={movEdit.id_referente || ""}
                onChange={(e) =>
                  setMovEdit((prev) => ({
                    ...prev,
                    id_referente: e.target.value,
                  }))
                }
              >
                <option value="">-- Sin actuante --</option>

                {referentes.map((r) => (
                  <option key={r.id_referente} value={r.id_referente}>
                    {r.nombre}
                  </option>
                ))}
              </select>
            </div>

            <div className="modal-foot">
              <button onClick={() => setShowEdit(false)}>Cancelar</button>

              <button className="btn-primary" onClick={guardarEdicion}>
                Guardar cambios
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default Movimientos;