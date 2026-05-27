import React, { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import * as XLSX from "xlsx";
import api from "../api/axiosConfig";
import { useAuth } from "../context/AuthContext";
import "./../styles/transferencias.css";

export default function Remitos() {
  const navigate = useNavigate();
  const fileInputRef = useRef(null);
  const { displayName } = useAuth();

  const [remitos, setRemitos] = useState([]);
  const [filtro, setFiltro] = useState("");
  const [importando, setImportando] = useState(false);

  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [gotoPage, setGotoPage] = useState("");

  const fetchRemitos = () => {
    api
      .get("/remitos")
      .then((res) => setRemitos(res.data || []))
      .catch((err) => console.error(err));
  };

  useEffect(() => {
    fetchRemitos();
  }, []);

  const handleClickImportar = () => {
    fileInputRef.current?.click();
  };

  const handleImportarArchivo = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";

    if (!file) return;

    try {
      setImportando(true);

      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: "array" });
      const sheetName = workbook.SheetNames[0];

      if (!sheetName) {
        alert("El archivo no tiene hojas.");
        return;
      }

      const sheet = workbook.Sheets[sheetName];

      const rows = XLSX.utils.sheet_to_json(sheet, {
        defval: "",
      });

      if (!rows.length) {
        alert("La planilla no tiene datos para importar.");
        return;
      }

      const confirmar = window.confirm(
        `Se van a importar ${rows.length} filas desde la hoja "${sheetName}".\n\n` +
          "Si algún artículo o proveedor no existe, no se importará nada.\n\n" +
          "¿Continuar?"
      );

      if (!confirmar) return;

      await api.post("/remitos/importar-planilla", {
        rows,
        usuario: displayName || null,
      });

      alert("Planilla importada correctamente.");
      fetchRemitos();
      setCurrentPage(1);
    } catch (err) {
      console.error(err);

      const data = err.response?.data;
      let msg = data?.error || data?.detalle || "Error al importar la planilla.";

      if (Array.isArray(data?.detalle)) {
        msg += "\n\n" + data.detalle.join("\n");
      } else if (data?.detalle) {
        msg += "\n\n" + String(data.detalle);
      }

      alert(msg);
    } finally {
      setImportando(false);
    }
  };

  const filtrados = remitos.filter((r) =>
    Object.values(r).some((v) =>
      String(v ?? "").toLowerCase().includes(filtro.toLowerCase())
    )
  );

  const totalPages = Math.ceil(filtrados.length / pageSize) || 1;

  const paginated = filtrados.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize
  );

  const irPagina = (p) => {
    if (p < 1 || p > totalPages) return;
    setCurrentPage(p);
  };

  const from = filtrados.length ? (currentPage - 1) * pageSize + 1 : 0;
  const to = Math.min(currentPage * pageSize, filtrados.length);

  return (
    <div className="transferencias-page">
      <h2 className="module-title">Remitos</h2>

      <div className="acciones">
        <button onClick={() => navigate("/remitos/nuevo")}>
          Ingreso manual
        </button>

        <button onClick={handleClickImportar} disabled={importando}>
          {importando ? "Importando..." : "Importar planilla"}
        </button>

        <input
          ref={fileInputRef}
          type="file"
          accept=".xlsx,.xls"
          style={{ display: "none" }}
          onChange={handleImportarArchivo}
        />

        <button disabled title="Se habilita más adelante">
          Descargar planilla
        </button>

        <input
          type="text"
          placeholder="Filtrar remitos"
          value={filtro}
          onChange={(e) => {
            setFiltro(e.target.value);
            setCurrentPage(1);
          }}
        />
      </div>

      <table className="tabla-transferencias">
        <thead>
          <tr>
            <th>Fecha</th>
            <th>Depósito</th>
            <th>Tipo</th>
            <th>Nro remito</th>
            <th>N° Entrega</th>
            <th>Pedido</th>
            <th>Proveedor</th>
            <th>Usuario</th>
          </tr>
        </thead>

        <tbody>
          {paginated.map((r) => {
            const id = r.numero_remito ?? r.id;

            return (
              <tr
                key={id}
                style={{ cursor: "pointer" }}
                onClick={() => navigate(`/remitos/${id}`)}
                title="Ver detalle"
              >
                <td>
                  {r.fecha ? new Date(r.fecha).toLocaleString("es-AR") : ""}
                </td>
                <td>{r.deposito}</td>
                <td>{r.tipo}</td>
                <td>{id}</td>
                <td>{r.nro_entrega ?? ""}</td>
                <td>{r.pedido ?? ""}</td>
                <td>{r.proveedor ?? ""}</td>
                <td>{r.usuario ?? ""}</td>
              </tr>
            );
          })}

          {paginated.length === 0 && (
            <tr>
              <td colSpan="8">Sin remitos para mostrar</td>
            </tr>
          )}
        </tbody>
      </table>

      <div className="paginado-pro">
        <div className="paginado-info">
          Mostrando {from}-{to} de {filtrados.length}
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
                p === 1 || p === totalPages || Math.abs(p - currentPage) <= 1
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
    </div>
  );
}