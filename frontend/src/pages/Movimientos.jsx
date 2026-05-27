import React, { useEffect, useMemo, useState } from "react";
import api from "../api/axiosConfig";
import * as XLSX from "xlsx";
import "./../styles/transferencias.css";
import ServerExcelFilterButton from "../components/ServerExcelFilterButton";

function Movimientos() {
  const [rows, setRows] = useState([]);

  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(100);
  const [gotoPage, setGotoPage] = useState("");

  const [totalRows, setTotalRows] = useState(0);
  const [serverTotalPages, setServerTotalPages] = useState(1);
  const [loading, setLoading] = useState(false);

  const [showEdit, setShowEdit] = useState(false);
  const [movEdit, setMovEdit] = useState(null);
  const [referentes, setReferentes] = useState([]);

  const [showMasivo, setShowMasivo] = useState(false);
  const [numeroMasivo, setNumeroMasivo] = useState("");
  const [movsMasivo, setMovsMasivo] = useState([]);
  const [masivoEdit, setMasivoEdit] = useState(null);
  const [buscandoMasivo, setBuscandoMasivo] = useState(false);

  const [serverFilters, setServerFilters] = useState({});
  const [sortState, setSortState] = useState({
    key: "",
    dir: "",
  });

  const formatFecha = (value) => {
    if (!value) return "";

    const d = new Date(value);

    if (Number.isNaN(d.getTime())) return "";

    return d.toLocaleDateString("es-AR");
  };

  const columnas = useMemo(
    () => [
      {
        key: "numero_transaccion",
        label: "Número de transacción",
      },
      {
        key: "fecha",
        label: "Fecha",
      },
      {
        key: "fecha_real",
        label: "Fecha Real",
      },
      {
        key: "codigo",
        label: "Código",
      },
      {
        key: "descripcion",
        label: "Descripción",
      },
      {
        key: "cantidad",
        label: "Cantidad",
      },
      {
        key: "deposito_origen",
        label: "Depósito Origen",
      },
      {
        key: "deposito_destino",
        label: "Depósito Destino",
      },
      {
        key: "tipo_transaccion",
        label: "Tipo de transacción",
      },
      {
        key: "motivo",
        label: "Motivo",
      },
      {
        key: "remito_referencia",
        label: "Remito/Referencia",
      },
      {
        key: "obra",
        label: "Obra",
      },
      {
        key: "version",
        label: "Versión",
      },
      {
        key: "referente",
        label: "Actuante",
      },
      {
        key: "proveedor",
        label: "Proveedor",
      },
      {
        key: "ingreso_egreso",
        label: "E/I",
      },
      {
        key: "usuario",
        label: "Usuario",
      },
    ],
    []
  );

  const cargarMovimientos = async () => {
    try {
      setLoading(true);

      const res = await api.get("/movimientos", {
        params: {
          page: currentPage,
          pageSize,
          filters: JSON.stringify(serverFilters),
          sortKey: sortState.key || "",
          sortDir: sortState.dir || "",
        },
        timeout: 120000,
      });

      const payload = res.data || {};

      const data = Array.isArray(payload.data)
        ? payload.data
        : Array.isArray(payload)
          ? payload
          : [];

      setRows(data);
      setTotalRows(Number(payload.total || data.length || 0));
      setServerTotalPages(Number(payload.totalPages || 1));
    } catch (err) {
      console.error("Error cargando movimientos:", err);

      setRows([]);
      setTotalRows(0);
      setServerTotalPages(1);

      alert(
        err.response?.data?.error ||
          err.response?.data?.detalle ||
          "Error cargando movimientos."
      );
    } finally {
      setLoading(false);
    }
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
  }, [currentPage, pageSize, serverFilters, sortState]);

  const limpiarFiltros = () => {
    setServerFilters({});
    setSortState({
      key: "",
      dir: "",
    });
    setCurrentPage(1);
    setGotoPage("");
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
  const paginated = rows;

  const irPagina = (p) => {
    const n = Number(p);
    if (!Number.isFinite(n)) return;
    if (n < 1 || n > totalPages) return;

    setCurrentPage(n);
  };

  const from = totalRows === 0 ? 0 : (currentPage - 1) * pageSize + 1;
  const to = Math.min(currentPage * pageSize, totalRows);

  const exportarExcel = async () => {
    try {
      const res = await api.get("/movimientos/export", {
        params: {
          filters: JSON.stringify(serverFilters),
          sortKey: sortState.key || "",
          sortDir: sortState.dir || "",
        },
        timeout: 180000,
      });

      const dataBase = Array.isArray(res.data) ? res.data : [];

      const data = dataBase.map((r) => ({
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
      XLSX.writeFile(wb, "movimientos_filtrados.xlsx");
    } catch (err) {
      console.error("Error exportando movimientos:", err);

      alert(
        err.response?.data?.error ||
          err.response?.data?.detalle ||
          "No se pudo exportar movimientos."
      );
    }
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

        <button className="btn-primary" onClick={abrirMasivo}>
          Editar transacción completa
        </button>

        {loading && <span style={{ padding: "6px 10px" }}>Cargando...</span>}
      </div>

      <div className="tabla-articulos-container">
        <table className="tabla-movimientos">
          <thead>
            <tr>
              {columnas.map((col) => (
                <th key={col.key}>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: 6,
                    }}
                  >
                    <span>{col.label}</span>

                    <ServerExcelFilterButton
                      columnKey={col.key}
                      label={col.label}
                      filters={serverFilters}
                      setFilters={setServerFilters}
                      sortState={sortState}
                      setSortState={setSortState}
                      onApply={() => {
                        setCurrentPage(1);
                      }}
                    />
                  </div>
                </th>
              ))}

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
                  <tr
                    key={`${r.tipo_transaccion}-${r.numero_transaccion}-${r.codigo}-${i}`}
                  >
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
            <option value={25}>25</option>
            <option value={50}>50</option>
            <option value={100}>100</option>
            <option value={200}>200</option>
            <option value={500}>500</option>
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
        <div className="modal">
          <div className="modal-content modal-wide">
            <h3>Editar movimiento</h3>

            <div className="form-grid">
              <label>
                Tipo
                <input value={movEdit.tipo_transaccion} disabled />
              </label>

              <label>
                Nro transacción
                <input value={movEdit.numero_transaccion} disabled />
              </label>

              <label>
                Remito / Referencia
                <input
                  value={movEdit.remito_referencia}
                  onChange={(e) =>
                    setMovEdit((prev) => ({
                      ...prev,
                      remito_referencia: e.target.value,
                    }))
                  }
                />
              </label>

              <label>
                Obra
                <input
                  value={movEdit.obra}
                  onChange={(e) =>
                    setMovEdit((prev) => ({
                      ...prev,
                      obra: e.target.value,
                    }))
                  }
                  disabled={movEdit.tipo_transaccion !== "AJUSTE"}
                />
              </label>

              <label>
                Versión
                <input
                  value={movEdit.version}
                  onChange={(e) =>
                    setMovEdit((prev) => ({
                      ...prev,
                      version: e.target.value,
                    }))
                  }
                  disabled={movEdit.tipo_transaccion !== "AJUSTE"}
                />
              </label>

              <label>
                Actuante
                <select
                  value={movEdit.id_referente || ""}
                  onChange={(e) =>
                    setMovEdit((prev) => ({
                      ...prev,
                      id_referente: e.target.value,
                    }))
                  }
                >
                  <option value="">Sin actuante</option>
                  {referentes.map((r) => (
                    <option key={r.id_referente} value={r.id_referente}>
                      {r.nombre}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className="modal-botones">
              <button className="btn-primary" onClick={guardarEdicion}>
                Guardar
              </button>

              <button
                className="btn-light"
                onClick={() => {
                  setShowEdit(false);
                  setMovEdit(null);
                }}
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {showMasivo && (
        <div className="modal">
          <div className="modal-content modal-wide">
            <h3>Editar transacción completa</h3>

            <div className="form-grid">
              <label>
                Número de transacción
                <input
                  value={numeroMasivo}
                  onChange={(e) => setNumeroMasivo(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") buscarTransaccionMasiva();
                  }}
                />
              </label>

              <div style={{ display: "flex", alignItems: "end", gap: 8 }}>
                <button
                  className="btn-primary"
                  onClick={buscarTransaccionMasiva}
                  disabled={buscandoMasivo}
                >
                  {buscandoMasivo ? "Buscando..." : "Buscar"}
                </button>
              </div>
            </div>

            {movsMasivo.length > 0 && masivoEdit && (
              <>
                <hr />

                <p>
                  Se encontraron <b>{movsMasivo.length}</b> movimientos para la
                  transacción <b>{masivoEdit.numero_transaccion}</b>.
                </p>

                <div className="form-grid">
                  <label>
                    Tipo
                    <input value={masivoEdit.tipo_transaccion} disabled />
                  </label>

                  <label>
                    Remito / Referencia
                    <input
                      value={masivoEdit.remito_referencia}
                      onChange={(e) =>
                        setMasivoEdit((prev) => ({
                          ...prev,
                          remito_referencia: e.target.value,
                        }))
                      }
                    />
                  </label>

                  <label>
                    Obra
                    <input
                      value={masivoEdit.obra}
                      onChange={(e) =>
                        setMasivoEdit((prev) => ({
                          ...prev,
                          obra: e.target.value,
                        }))
                      }
                      disabled={masivoEdit.tipo_transaccion !== "AJUSTE"}
                    />
                  </label>

                  <label>
                    Versión
                    <input
                      value={masivoEdit.version}
                      onChange={(e) =>
                        setMasivoEdit((prev) => ({
                          ...prev,
                          version: e.target.value,
                        }))
                      }
                      disabled={masivoEdit.tipo_transaccion !== "AJUSTE"}
                    />
                  </label>

                  <label>
                    Actuante
                    <select
                      value={masivoEdit.id_referente || ""}
                      onChange={(e) =>
                        setMasivoEdit((prev) => ({
                          ...prev,
                          id_referente: e.target.value,
                        }))
                      }
                    >
                      <option value="">Sin actuante</option>
                      {referentes.map((r) => (
                        <option key={r.id_referente} value={r.id_referente}>
                          {r.nombre}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
              </>
            )}

            <div className="modal-botones">
              {movsMasivo.length > 0 && (
                <button className="btn-primary" onClick={guardarEdicionMasiva}>
                  Guardar transacción completa
                </button>
              )}

              <button
                className="btn-light"
                onClick={() => {
                  setShowMasivo(false);
                  setNumeroMasivo("");
                  setMovsMasivo([]);
                  setMasivoEdit(null);
                }}
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default Movimientos;