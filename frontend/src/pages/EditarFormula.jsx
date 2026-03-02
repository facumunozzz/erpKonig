// frontend/src/pages/EditarFormula.jsx
import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../api/axiosConfig";
import "./../styles/transferencias.css";

export default function EditarFormula() {
  const navigate = useNavigate();

  // Cabecera (producto cuya fórmula editamos)
  const [codigo, setCodigo] = useState("");
  const [descripcion, setDescripcion] = useState("");

  // Estado general
  const [cargando, setCargando] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  // Detalle actual (se edita en memoria)
  // items = [{ cod_articulo, descripcion, cantidad }]
  const [items, setItems] = useState([]);

  // Línea para AGREGAR materiales (Cargar y continuar)
  const [matCodigo, setMatCodigo] = useState("");
  const [matDescripcion, setMatDescripcion] = useState("");
  const [matCantidad, setMatCantidad] = useState("");

  // -------- util: debounce simple --------
  function useDebounce(value, delay = 300) {
    const [debounced, setDebounced] = useState(value);
    useEffect(() => {
      const t = setTimeout(() => setDebounced(value), delay);
      return () => clearTimeout(t);
    }, [value, delay]);
    return debounced;
  }
  const debouncedMatCodigo = useDebounce(matCodigo, 250);

  // Autocompletar descripción del MATERIAL a agregar
  useEffect(() => {
    const c = (debouncedMatCodigo || "").trim();
    if (!c) {
      setMatDescripcion("");
      return;
    }
    let cancel = false;
    (async () => {
      try {
        const res = await api.get(`/articulos/codigo/${encodeURIComponent(c)}`);
        if (!cancel) setMatDescripcion(res.data?.descripcion || "");
      } catch {
        if (!cancel) setMatDescripcion("");
      }
    })();
    return () => {
      cancel = true;
    };
  }, [debouncedMatCodigo]);

  // Buscar fórmula existente por código de PRODUCTO
  const buscarFormula = async () => {
    setErrorMsg("");
    setItems([]);
    setDescripcion("");
    const c = (codigo || "").trim().toUpperCase();
    if (!c) return setErrorMsg("Ingresá un código de producto.");

    try {
      setCargando(true);
      const res = await api.get(`/produccion/formulas/${encodeURIComponent(c)}`);

      // Backend puede responder { producto, detalle } (nuestro controller),
      // o { codigo, descripcion, componentes } (fallback de alguna versión)
      const prodDesc =
        res.data?.producto?.descripcion ??
        res.data?.descripcion ??
        "";
      const detalle = res.data?.detalle ?? res.data?.componentes ?? [];

      setDescripcion(prodDesc || "");
      setItems(
        (detalle || []).map((d) => ({
          cod_articulo: d.cod_articulo,
          descripcion: d.descripcion ?? "",
          cantidad: Number(d.cantidad) || 0,
        }))
      );

      if ((detalle || []).length === 0) {
        setErrorMsg("No existe fórmula para este código");
      }
    } catch (err) {
      const msg =
        err?.response?.data?.error ||
        err.message ||
        "Error al obtener la fórmula";
      setErrorMsg(msg);
    } finally {
      setCargando(false);
    }
  };

  // Agregar material (Cargar y continuar)
  const cargarYContinuar = () => {
    setErrorMsg("");
    const cod = (matCodigo || "").trim().toUpperCase();
    const cant = Number(matCantidad);

    if (!cod) return setErrorMsg("Ingresá el código del material.");
    if (!cant || cant <= 0) return setErrorMsg("La cantidad debe ser > 0.");

    setItems((prev) => {
      const ix = prev.findIndex((it) => it.cod_articulo === cod);
      if (ix === -1) {
        return [
          ...prev,
          { cod_articulo: cod, descripcion: matDescripcion || "", cantidad: cant },
        ];
      }
      const copy = [...prev];
      copy[ix] = { ...copy[ix], cantidad: Number(copy[ix].cantidad) + cant };
      return copy;
    });

    // limpiar línea
    setMatCodigo("");
    setMatDescripcion("");
    setMatCantidad("");
  };

  // Quitar material de la fórmula (botón “Quitar” en la tabla)
  const quitarItem = (idx) => {
    setItems((prev) => prev.filter((_, i) => i !== idx));
  };

  // Editar cantidad directamente en la tabla
  const editarCantidad = (idx, value) => {
    const val = value.replace(/[^0-9]/g, "");
    setItems((prev) => {
      const copy = [...prev];
      copy[idx] = { ...copy[idx], cantidad: Number(val || 0) };
      return copy;
    });
  };

  // Confirmar/Guardar: reemplaza la fórmula completa en backend
  const guardarCambios = async () => {
    try {
      setErrorMsg("");
      const c = (codigo || "").trim().toUpperCase();
      if (!c) return setErrorMsg("Ingresá un código de producto.");
      if (items.length === 0)
        return setErrorMsg('Agregá materiales con "Cargar y continuar".');

      const body = {
        items: items.map((it) => ({
          cod_articulo: it.cod_articulo,
          cantidad: Number(it.cantidad),
        })),
      };

      // Usamos la ruta que espera EditarFormula: PUT /produccion/formulas/:codigo
      await api.put(`/produccion/formulas/${encodeURIComponent(c)}`, body);
      alert("Fórmula actualizada correctamente.");
      navigate("/produccion");
    } catch (err) {
      const msg =
        err?.response?.data?.error ||
        err?.response?.data?.detalle ||
        err.message ||
        "Error al actualizar la fórmula";
      setErrorMsg(msg);
    }
  };

  const puedeGuardar = useMemo(
    () =>
      (codigo || "").trim() &&
      items.length > 0 &&
      items.every((i) => Number(i.cantidad) > 0),
    [codigo, items]
  );

  return (
    <div className="nueva-transferencia-page">
      <div className="nt-header">
        <h2 className="module-title">Editar fórmula</h2>
        <button className="nt-volver" onClick={() => navigate("/produccion")}>
          ← Volver
        </button>
      </div>

      {errorMsg && <div className="nt-error">{errorMsg}</div>}

      {/* Buscador de fórmula por código de producto */}
      <div className="nt-card">
        <div className="nt-row">
          <div className="nt-field">
            <label>Código producto</label>
            <input
              type="text"
              placeholder="Código de producto…"
              value={codigo}
              onChange={(e) => {
                setCodigo(e.target.value);
                setDescripcion("");
                setItems([]);
                setErrorMsg("");
              }}
            />
          </div>

          <div className="nt-field">
            <label>Descripción</label>
            <input
              type="text"
              value={descripcion}
              readOnly
              placeholder="Se completa al buscar fórmula"
            />
          </div>

          <div className="nt-actions">
            <button className="btn-light" onClick={buscarFormula} disabled={cargando}>
              {cargando ? "Buscando…" : "Buscar fórmula"}
            </button>
          </div>
        </div>
      </div>

      {/* Línea para AGREGAR materiales */}
      <div className="nt-card">
        <h4>Materiales</h4>
        <div className="nt-row">
          <div className="nt-field">
            <label>Ingrese un material (código)</label>
            <input
              type="text"
              placeholder="Código material…"
              value={matCodigo}
              onChange={(e) => setMatCodigo(e.target.value)}
              disabled={!descripcion} // hasta no cargar fórmula
            />
          </div>

          <div className="nt-field">
            <label>Descripción</label>
            <input
              type="text"
              value={matDescripcion}
              readOnly
              placeholder="Se completa desde el código"
            />
          </div>

          <div className="nt-field small">
            <label>Cantidad</label>
            <input
              type="number"
              min="1"
              step="1"
              value={matCantidad}
              onChange={(e) => setMatCantidad(e.target.value.replace(/[^0-9]/g, ""))}
            />
          </div>

          <div className="nt-actions">
            <button className="btn-light" onClick={cargarYContinuar} disabled={!descripcion}>
              Cargar y continuar
            </button>
            <button
              className="btn-primary"
              onClick={guardarCambios}
              disabled={!puedeGuardar}
            >
              Confirmar
            </button>
          </div>
        </div>
      </div>

      {/* Tabla editable de materiales (eliminar / editar cantidad) */}
      <div className="nt-card">
        <div className="tabla-articulos-container">
          <table className="tabla-articulos">
            <thead>
              <tr>
                <th>Código</th>
                <th>Descripción</th>
                <th style={{ textAlign: "right", width: 120 }}>Cantidad</th>
                <th style={{ width: 100 }}>Acción</th>
              </tr>
            </thead>
            <tbody>
              {items.length === 0 ? (
                <tr>
                  <td colSpan={4}>
                    No hay materiales. Cargá con “Cargar y continuar”.
                  </td>
                </tr>
              ) : (
                items.map((it, idx) => (
                  <tr key={idx}>
                    <td>{it.cod_articulo}</td>
                    <td>{it.descripcion}</td>
                    <td style={{ textAlign: "right" }}>
                      <input
                        type="number"
                        min="0"
                        step="1"
                        value={it.cantidad}
                        onChange={(e) => editarCantidad(idx, e.target.value)}
                        style={{ width: 90, textAlign: "right" }}
                      />
                    </td>
                    <td>
                      <button className="borrar-btn" onClick={() => quitarItem(idx)}>
                        Quitar
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}


