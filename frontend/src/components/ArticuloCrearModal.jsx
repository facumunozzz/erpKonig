import React, { useEffect, useMemo, useRef, useState } from "react";
import api from "../api/axiosConfig.js";
import "./../styles/articulos.css";

function normKey(nombre) {
  return String(nombre || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, "_")
    .replace(/_+/g, "_");
}

export default function ArticuloCrearModal({
  isOpen,
  onClose,
  articulos = [],
  onSaved
}) {
  const [clasificaciones, setClasificaciones] = useState([]);
  const [proveedores, setProveedores] = useState([]);
  const [folios, setFolios] = useState([]);
  const [tipos, setTipos] = useState([]);

  const [form, setForm] = useState({
    codigo: "",
    descripcion: "",
    tipo: "",
    proveedor: "",
    folio: "",
    punto_pedido: ""
  });

  const [errorMsg, setErrorMsg] = useState("");

  const inputCodigoRef = useRef(null);

  const CLASIF_BLOQUEADAS = useMemo(
    () =>
      new Set([
        "codigo",
        "descripcion",
        "tipo",
        "proveedor",
        "folio",
        "punto_pedido",
        "traspasa",
        "almacen",
        "cantidad",
        "ubicacion"
      ]),
    []
  );

  useEffect(() => {
    if (!isOpen) return;

    setErrorMsg("");
    setClasificaciones([]);
    setProveedores([]);
    setFolios([]);
    setTipos([]);

    (async () => {
      try {
        const [resClasif, resProv, resFol, resTip] = await Promise.all([
          api.get("/clasificaciones"),
          api.get("/catalogos/proveedores"),
          api.get("/catalogos/folios"),
          api.get("/catalogos/tipos")
        ]);

        const activas = (resClasif.data || []).filter(
          (c) => Number(c.activa) === 1
        );

        const modelo = {
          codigo: "",
          descripcion: "",
          tipo: "",
          proveedor: "",
          folio: "",
          punto_pedido: ""
        };

        activas.forEach((c) => {
          const k = normKey(c.nombre);
          if (!(k in modelo)) modelo[k] = "";
        });

        setClasificaciones(activas);
        setProveedores(resProv.data || []);
        setFolios(resFol.data || []);
        setTipos(resTip.data || []);
        setForm(modelo);
      } catch (err) {
        console.error(err);
        setErrorMsg("Error al cargar datos del modal");
      }
    })();
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;

    const timer = setTimeout(() => {
      if (inputCodigoRef.current) {
        inputCodigoRef.current.focus();
        inputCodigoRef.current.select?.();
      }
    }, 0);

    return () => clearTimeout(timer);
  }, [isOpen]);

  const onChange = (campo, valor) => {
    setForm((prev) => ({ ...prev, [campo]: valor }));
  };

  const guardar = async () => {
    setErrorMsg("");

    if (!String(form.codigo || "").trim() || !String(form.descripcion || "").trim()) {
      setErrorMsg("Debe indicar código y descripción");
      return;
    }

    const existeCod = articulos.some(
      (a) =>
        String(a.codigo || "").trim().toLowerCase() ===
        String(form.codigo || "").trim().toLowerCase()
    );
    if (existeCod) {
      setErrorMsg("El código ya existe");
      return;
    }

    const existeDesc = articulos.some(
      (a) =>
        String(a.descripcion || "").trim().toLowerCase() ===
        String(form.descripcion || "").trim().toLowerCase()
    );
    if (existeDesc) {
      setErrorMsg("La descripción ya existe");
      return;
    }

    for (const c of clasificaciones) {
      const k = normKey(c.nombre);
      if (CLASIF_BLOQUEADAS.has(k)) continue;

      if (Number(c.es_obligatoria) === 1 && !String(form[k] || "").trim()) {
        setErrorMsg(`El campo "${c.nombre}" es obligatorio`);
        return;
      }
    }

    try {
      const articuloBase = {
        codigo: String(form.codigo || "").trim(),
        descripcion: String(form.descripcion || "").trim(),
        tipo: String(form.tipo || "").trim() || null,
        proveedor: String(form.proveedor || "").trim() || null,
        folio: String(form.folio || "").trim() || null,
        punto_pedido:
          String(form.punto_pedido || "").trim() === ""
            ? null
            : String(form.punto_pedido).trim(),
        ubicacion: null,
        cantidad: 0
      };

      const resArticulo = await api.post("/articulos", articuloBase);
      const idArticulo = resArticulo.data?.id_articulo;

      if (!idArticulo) {
        throw new Error("El backend no devolvió id_articulo");
      }

      const payloadClasif = clasificaciones
        .filter((c) => !CLASIF_BLOQUEADAS.has(normKey(c.nombre)))
        .map((c) => ({
          id_clasificacion: c.id_clasificacion,
          valor: String(form[normKey(c.nombre)] ?? "").trim()
        }));

      await api.post(`/articulos/${idArticulo}/clasificaciones`, {
        clasificaciones: payloadClasif
      });

      onSaved?.();
      onClose?.();
    } catch (err) {
      console.error(err);
      setErrorMsg(
        err.response?.data?.error ||
          err.message ||
          "Error al guardar el artículo"
      );
    }
  };

  if (!isOpen) return null;

  return (
    <div className="modal">
      <div className="modal-contenido">
        <div className="modal-header">
          <h3>Nuevo Artículo</h3>
        </div>

        <div className="modal-body">
          <div className="campo-linea">
            <label>Código</label>
            <input
              ref={inputCodigoRef}
              type="text"
              value={form.codigo || ""}
              onChange={(e) => onChange("codigo", e.target.value)}
            />
          </div>

          <div className="campo-linea">
            <label>Descripción</label>
            <input
              type="text"
              value={form.descripcion || ""}
              onChange={(e) => onChange("descripcion", e.target.value)}
            />
          </div>

          <div className="campo-linea">
            <label>Proveedor</label>
            <select
              value={form.proveedor || ""}
              onChange={(e) => onChange("proveedor", e.target.value)}
            >
              <option value="">Seleccione...</option>
              {proveedores.map((p) => (
                <option key={p.id} value={p.nombre}>
                  {p.nombre}
                </option>
              ))}
            </select>
          </div>

          <div className="campo-linea">
            <label>Folio</label>
            <select
              value={form.folio || ""}
              onChange={(e) => onChange("folio", e.target.value)}
            >
              <option value="">Seleccione...</option>
              {folios.map((f) => (
                <option key={f.id} value={f.nombre}>
                  {f.nombre}
                </option>
              ))}
            </select>
          </div>

          <div className="campo-linea">
            <label>Tipo</label>
            <select
              value={form.tipo || ""}
              onChange={(e) => onChange("tipo", e.target.value)}
            >
              <option value="">Seleccione...</option>
              {tipos.map((t) => (
                <option key={t.id} value={t.nombre}>
                  {t.nombre}
                </option>
              ))}
            </select>
          </div>

          <div className="campo-linea">
            <label>Punto de pedido</label>
            <input
              type="number"
              value={form.punto_pedido || ""}
              onChange={(e) => onChange("punto_pedido", e.target.value)}
            />
          </div>

          <hr />

          {clasificaciones
            .filter((c) => !CLASIF_BLOQUEADAS.has(normKey(c.nombre)))
            .map((c) => {
              const k = normKey(c.nombre);
              return (
                <div className="campo-linea" key={c.id_clasificacion}>
                  <label>
                    {c.nombre}
                    {Number(c.es_obligatoria) === 1 && (
                      <span style={{ color: "red" }}> *</span>
                    )}
                  </label>
                  <input
                    type="text"
                    value={form[k] || ""}
                    onChange={(e) => onChange(k, e.target.value)}
                  />
                </div>
              );
            })}

          {errorMsg && (
            <div style={{ color: "red", marginTop: "8px" }}>{errorMsg}</div>
          )}
        </div>

        <div className="modal-footer">
          <button className="btn-secundario" onClick={onClose}>
            Cancelar
          </button>
          <button className="btn-primario" onClick={guardar}>
            Confirmar
          </button>
        </div>
      </div>
    </div>
  );
}