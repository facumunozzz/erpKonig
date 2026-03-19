import React, { useEffect, useMemo, useState } from "react";
import api from "../api/axiosConfig";
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

export default function ArticuloEditarModal({
  isOpen,
  onClose,
  articuloRow,
  articulos = [],
  onSaved
}) {
  const [articuloBase, setArticuloBase] = useState(null);
  const [clasificaciones, setClasificaciones] = useState([]);
  const [proveedores, setProveedores] = useState([]);
  const [folios, setFolios] = useState([]);
  const [tipos, setTipos] = useState([]);
  const [form, setForm] = useState({});
  const [errorMsg, setErrorMsg] = useState("");

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
    setArticuloBase(null);
    setClasificaciones([]);
    setProveedores([]);
    setFolios([]);
    setTipos([]);
    setForm({});

    (async () => {
      try {
        const id = articuloRow?.id_articulo;
        if (!id) {
          setErrorMsg("No se encontró id_articulo para editar");
          return;
        }

        const [resArt, resClas, resProv, resFol, resTip] = await Promise.all([
          api.get(`/articulos/${id}`),
          api.get(`/articulos/${id}/clasificaciones`),
          api.get("/catalogos/proveedores"),
          api.get("/catalogos/folios"),
          api.get("/catalogos/tipos")
        ]);

        const base = resArt.data || {};
        const clasif = resClas.data || [];

        setArticuloBase(base);
        setClasificaciones(clasif);
        setProveedores(resProv.data || []);
        setFolios(resFol.data || []);
        setTipos(resTip.data || []);

        const modelo = {
          codigo: base.codigo || "",
          descripcion: base.descripcion || "",
          tipo: base.tipo || "",
          folio: base.folio || "",
          proveedor: base.proveedor || "",
          punto_pedido:
            base.punto_pedido === null || base.punto_pedido === undefined
              ? ""
              : String(base.punto_pedido)
        };

        clasif.forEach((c) => {
          const nk = normKey(c.nombre);
          if (!CLASIF_BLOQUEADAS.has(nk)) {
            modelo[`clasif_${c.id_clasificacion}`] = c.valor ?? "";
          }
        });

        setForm(modelo);
      } catch (err) {
        console.error(err);
        setErrorMsg(
          err.response?.data?.error || "Error al cargar datos para editar"
        );
      }
    })();
  }, [isOpen, articuloRow, CLASIF_BLOQUEADAS]);

  const onChange = (campo, valor) => {
    setForm((prev) => ({ ...prev, [campo]: valor }));
  };

  const guardar = async () => {
    setErrorMsg("");

    if (!articuloBase?.id_articulo) {
      return setErrorMsg("ID de artículo inválido");
    }

    if (!String(form.descripcion || "").trim()) {
      return setErrorMsg("Debe indicar descripción");
    }

    for (const c of clasificaciones) {
      const nk = normKey(c.nombre);
      if (CLASIF_BLOQUEADAS.has(nk)) continue;

      const key = `clasif_${c.id_clasificacion}`;
      if (Number(c.es_obligatoria) === 1 && !String(form[key] || "").trim()) {
        return setErrorMsg(`El campo "${c.nombre}" es obligatorio`);
      }
    }

    const existeDesc = articulos.some(
      (a) =>
        Number(a.id_articulo) !== Number(articuloBase.id_articulo) &&
        String(a.descripcion || "").trim().toLowerCase() ===
          String(form.descripcion || "").trim().toLowerCase()
    );
    if (existeDesc) return setErrorMsg("La descripción ya existe");

    try {
      const bodyUpdate = {
        codigo: articuloBase.codigo,
        descripcion: String(form.descripcion || "").trim(),
        tipo: String(form.tipo || "").trim() || null,
        folio: String(form.folio || "").trim() || null,
        proveedor: String(form.proveedor || "").trim() || null,
        punto_pedido:
          String(form.punto_pedido || "").trim() === ""
            ? null
            : String(form.punto_pedido).trim()
      };

      await api.put(`/articulos/${articuloBase.id_articulo}`, bodyUpdate);

      const payloadClasif = clasificaciones
        .filter((c) => !CLASIF_BLOQUEADAS.has(normKey(c.nombre)))
        .map((c) => ({
          id_clasificacion: c.id_clasificacion,
          valor: String(form[`clasif_${c.id_clasificacion}`] ?? "").trim()
        }));

      await api.post(`/articulos/${articuloBase.id_articulo}/clasificaciones`, {
        clasificaciones: payloadClasif
      });

      onSaved?.();
      onClose?.();
    } catch (err) {
      console.error(err);
      setErrorMsg(
        err.response?.data?.error ||
          err.message ||
          "Error al guardar cambios"
      );
    }
  };

  if (!isOpen) return null;

  return (
    <div className="modal">
      <div className="modal-contenido">
        <div className="modal-header">
          <h3>Editar Artículo</h3>
        </div>

        <div className="modal-body">
          <div className="campo-linea">
            <label>Código</label>
            <input type="text" value={form.codigo || ""} disabled />
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
              const key = `clasif_${c.id_clasificacion}`;
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
                    value={form[key] || ""}
                    onChange={(e) => onChange(key, e.target.value)}
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
            Guardar cambios
          </button>
        </div>
      </div>
    </div>
  );
}