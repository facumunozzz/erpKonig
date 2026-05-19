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

  const [totalRows, setTotalRows] = useState(0);
  const [serverTotalPages, setServerTotalPages] = useState(1);

  const [showEdit, setShowEdit] = useState(false);
  const [movEdit, setMovEdit] = useState(null);
  const [referentes, setReferentes] = useState([]);

  const [showMasivo, setShowMasivo] = useState(false);
  const [numeroMasivo, setNumeroMasivo] = useState("");
  const [movsMasivo, setMovsMasivo] = useState([]);
  const [masivoEdit, setMasivoEdit] = useState(null);
  const [buscandoMasivo, setBuscandoMasivo] = useState(false);

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
    motivo: "",
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

  const cargarMovimientos = () => {
    api
      .get("/movimientos", {
        params: {
          page: currentPage,
          pageSize,
        },
      })
      .then((res) => {
        const payload = res.data || {};

        const data = Array.isArray(payload.data)
          ? payload.data
          : Array.isArray(payload)
          ? payload
          : [];

        setRows(data);
        setFiltered(data);

        setTotalRows(Number(payload.total || data.length || 0));
        setServerTotalPages(Number(payload.totalPages || 1));
      })
      .catch((err) => {
        console.error("Error cargando movimientos:", err);
        setRows([]);
        setFiltered([]);
        setTotalRows(0);
        setServerTotalPages(1);
      });
  };

  const cargarReferentes = async () => {
    try {
      const res = await api.get("/referentes");

      const data = Array.isArray(res.data) ? res.data : [];

      if (!Array.isArray(res.data)) {
        console.error("La respuesta de /referentes no es un array:", res.data);
      }

      setReferentes(data.filter((r) => r.activo));
    } catch (err) {
      console.error("Error cargando actuantes:", err);
      setReferentes([]);
      alert("No se pudieron cargar los actuantes.");
    }
  };

  useEffect(() => {
    cargarReferentes();
  }, []);

  useEffect(() => {
    cargarMovimientos();
  }, [currentPage, pageSize]);

  const limpiarFiltros = () => {
    setFiltros(filtrosIniciales);
    setFiltered(rows || []);
    setCurrentPage(1);
    setGotoPage("");
  };

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
      motivo: r.motivo ?? "",
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

  const abrirMasivo = () => {
    setNumeroMasivo("");
    setMovsMasivo([]);
    setMasivoEdit(null);
    setShowMasivo(true);
  };

  const buscarTransaccionMasiva = async () => {
    const numero = String(numeroMasivo || "").trim();

    if (!numero) {
      alert("Ingresá un número de transacción.");
      return;
    }

    try {
      setBuscandoMasivo(true);

      const res = await api.get(
        `/movimientos/transaccion/${encodeURIComponent(numero)}`
      );

      const data = Array.isArray(res.data) ? res.data : [];

      if (!Array.isArray(res.data)) {
        console.error("La respuesta no es un array:", res.data);
      }

      if (!data.length) {
        setMovsMasivo([]);
        setMasivoEdit(null);
        alert("No se encontraron movimientos editables para esa transacción.");
        return;
      }

      setMovsMasivo(data);

      const primero = data[0];

      setMasivoEdit({
        numero_transaccion: primero.numero_transaccion ?? numero,
        tipo_transaccion: primero.tipo_transaccion ?? "",
        remito_referencia: primero.remito_referencia ?? "",
        obra: primero.obra ?? "",
        version: primero.version ?? "",
        id_referente: primero.id_referente ?? "",
      });
    } catch (err) {
      console.error("Error buscando transacción:", err);

      alert(
        err.response?.data?.error ||
          err.response?.data?.detalle ||
          "Error al buscar la transacción"
      );
    } finally {
      setBuscandoMasivo(false);
    }
  };

  const guardarEdicionMasiva = async () => {
    if (!masivoEdit) return;

    const confirmar = window.confirm(
      `Vas a modificar la transacción ${masivoEdit.numero_transaccion} completa. ` +
        `Esto afectará a todos los artículos involucrados. ¿Confirmás?`
    );

    if (!confirmar) return;

    try {
      await api.put("/movimientos/masivo", {
        tipo_transaccion: masivoEdit.tipo_transaccion,
        numero_transaccion: masivoEdit.numero_transaccion,
        remito_referencia: masivoEdit.remito_referencia || null,
        obra: masivoEdit.obra || null,
        version: masivoEdit.version || null,
        id_referente: masivoEdit.id_referente || null,
      });

      setShowMasivo(false);
      setNumeroMasivo("");
      setMovsMasivo([]);
      setMasivoEdit(null);

      cargarMovimientos();

      alert("Transacción actualizada correctamente.");
    } catch (err) {
      alert(
        err.response?.data?.error ||
          err.response?.data?.detalle ||
          "Error al actualizar la transacción"
      );
    }
  };

  const totalPages = serverTotalPages || 1;
  const paginated = filtered;

  const irPagina = (p) => {
    if (p < 1 || p > totalPages) return;
    setCurrentPage(p);
  };

  const from = totalRows === 0 ? 0 : (currentPage - 1) * pageSize + 1;
  const to = Math.min(currentPage * pageSize, totalRows);

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
      Motivo: r.motivo ?? "",
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
    XLSX.writeFile(wb, "movimientos_pagina_actual.xlsx");
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
        <button onClick={exportarExcel}>Exportar página a Excel</button>
        <button onClick={limpiarFiltros}>Limpiar filtros</button>
        <button onClick={cargarMovimientos}>↻ Actualizar</button>

        <button className="btn-primary" onClick={abrirMasivo}>
          Editar transacción completa
        </button>
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
                Motivo
                <br />
                <input
                  value={filtros.motivo}
                  onChange={(e) => onFilterChange("motivo", e.target.value)}
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
                <td colSpan={18}>Sin movimientos.</td>
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
                    <td>{r.motivo ?? ""}</td>
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
          Mostrando {from}-{to} de {totalRows}
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
          <div
            className="modal-card"
            style={{ position: "relative", zIndex: 999999 }}
          >
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

                {(Array.isArray(referentes) ? referentes : []).map((r) => (
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

      {showMasivo && (
        <div
          className="modal-backdrop"
          style={{ position: "fixed", inset: 0, zIndex: 999999 }}
          onMouseDown={(e) => {
            if (e.target.classList.contains("modal-backdrop")) {
              setShowMasivo(false);
            }
          }}
        >
          <div
            className="modal-card"
            style={{
              position: "relative",
              zIndex: 999999,
              maxWidth: 950,
              width: "95%",
            }}
          >
            <div className="modal-head">
              <h3>Editar transacción completa</h3>
              <button onClick={() => setShowMasivo(false)}>✕</button>
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

              <div style={{ display: "flex", gap: 8 }}>
                <input
                  value={numeroMasivo}
                  onChange={(e) => setNumeroMasivo(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") buscarTransaccionMasiva();
                  }}
                  placeholder="Ej: 1234"
                />

                <button
                  onClick={buscarTransaccionMasiva}
                  disabled={buscandoMasivo}
                >
                  {buscandoMasivo ? "Buscando..." : "Buscar"}
                </button>
              </div>

              {movsMasivo.length > 0 && masivoEdit && (
                <>
                  <div
                    style={{
                      marginTop: 12,
                      padding: 10,
                      border: "1px solid #ddd",
                      borderRadius: 8,
                      background: "#f8fafc",
                    }}
                  >
                    <strong>Movimientos encontrados:</strong>{" "}
                    {movsMasivo.length} artículo/s involucrado/s.
                    <br />
                    <strong>Tipo:</strong> {masivoEdit.tipo_transaccion}
                  </div>

                  <label>Tipo de transacción</label>
                  <input value={masivoEdit.tipo_transaccion} readOnly />

                  <label>Remito / Referencia</label>
                  <input
                    value={masivoEdit.remito_referencia}
                    onChange={(e) =>
                      setMasivoEdit((prev) => ({
                        ...prev,
                        remito_referencia: e.target.value,
                      }))
                    }
                    placeholder="Dato que se aplicará a toda la transacción"
                  />

                  {masivoEdit.tipo_transaccion === "AJUSTE" && (
                    <>
                      <label>Obra</label>
                      <input
                        type="number"
                        value={masivoEdit.obra}
                        onChange={(e) =>
                          setMasivoEdit((prev) => ({
                            ...prev,
                            obra: e.target.value.replace(/[^0-9]/g, ""),
                          }))
                        }
                        placeholder="Se aplicará a todos los artículos del ajuste"
                      />

                      <label>Versión</label>
                      <input
                        type="number"
                        value={masivoEdit.version}
                        onChange={(e) =>
                          setMasivoEdit((prev) => ({
                            ...prev,
                            version: e.target.value.replace(/[^0-9]/g, ""),
                          }))
                        }
                        placeholder="Se aplicará a todos los artículos del ajuste"
                      />
                    </>
                  )}

                  <label>Actuante</label>
                  <select
                    value={masivoEdit.id_referente || ""}
                    onChange={(e) =>
                      setMasivoEdit((prev) => ({
                        ...prev,
                        id_referente: e.target.value,
                      }))
                    }
                  >
                    <option value="">-- Sin actuante --</option>

                    {(Array.isArray(referentes) ? referentes : []).map((r) => (
                      <option key={r.id_referente} value={r.id_referente}>
                        {r.nombre}
                      </option>
                    ))}
                  </select>

                  <div style={{ marginTop: 14 }}>
                    <h4>Artículos involucrados</h4>

                    <div style={{ maxHeight: 260, overflow: "auto" }}>
                      <table className="tabla-movimientos">
                        <thead>
                          <tr>
                            <th>Código</th>
                            <th>Descripción</th>
                            <th>Cantidad</th>
                            <th>Origen</th>
                            <th>Destino</th>
                            <th>E/I</th>
                          </tr>
                        </thead>

                        <tbody>
                          {(Array.isArray(movsMasivo) ? movsMasivo : []).map(
                            (m, idx) => (
                              <tr key={idx}>
                                <td>{m.codigo ?? ""}</td>
                                <td>{m.descripcion ?? ""}</td>
                                <td style={{ textAlign: "right" }}>
                                  {m.cantidad ?? ""}
                                </td>
                                <td>{m.deposito_origen ?? ""}</td>
                                <td>{m.deposito_destino ?? ""}</td>
                                <td>{m.ingreso_egreso ?? ""}</td>
                              </tr>
                            )
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </>
              )}
            </div>

            <div className="modal-foot">
              <button onClick={() => setShowMasivo(false)}>Cancelar</button>

              <button
                className="btn-primary"
                onClick={guardarEdicionMasiva}
                disabled={!masivoEdit || movsMasivo.length === 0}
              >
                Aplicar cambios a toda la transacción
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default Movimientos;