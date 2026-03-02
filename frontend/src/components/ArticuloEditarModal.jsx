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
  const [form, setForm] = useState({});
  const [errorMsg, setErrorMsg] = useState("");

  // Clasificaciones que NUNCA se renderizan (porque son base/ocultas/no existen)
  const CLASIF_BLOQUEADAS = useMemo(
    () =>
      new Set([
        "codigo",
        "descripcion",
        "tipo",
        "traspasa", // <- NO debe aparecer
        "almacen",
        "cantidad",
        "ubicacion"
      ]),
    []
  );

  // Si tenés duplicados Folio/Proveedor/Punto_pedido como clasif:
  // oculto la clasificación SOLO si está vacía (así te queda el base con info).
  const DUP_BASE = useMemo(() => new Set(["folio", "proveedor", "punto_pedido"]), []);

  useEffect(() => {
    if (!isOpen) return;

    setErrorMsg("");
    setArticuloBase(null);
    setClasificaciones([]);
    setForm({});

    (async () => {
      try {
        const id = articuloRow?.id_articulo;
        if (!id) {
          setErrorMsg("No se encontró id_articulo para editar");
          return;
        }

        const resArt = await api.get(`/articulos/${id}`);
        const base = resArt.data || {};
        setArticuloBase(base);

        const resClas = await api.get(`/articulos/${id}/clasificaciones`);
        const clasif = resClas.data || [];
        setClasificaciones(clasif);

        const modelo = {
          codigo: base.codigo || "",
          descripcion: base.descripcion || "",
          tipo: base.tipo || "",

          // mantengo estos campos como base (si los usás)
          folio: base.folio || "",
          proveedor: base.proveedor || "",
          punto_pedido: base.punto_pedido || ""
        };

        clasif.forEach((c) => {
          modelo[`clasif_${c.id_clasificacion}`] = c.valor ?? "";
        });

        setForm(modelo);
      } catch (err) {
        console.error(err);
        setErrorMsg(err.response?.data?.error || "Error al cargar datos para editar");
      }
    })();
  }, [isOpen, articuloRow]);

  const onChange = (campo, valor) => {
    setForm((prev) => ({ ...prev, [campo]: valor }));
  };

  const guardar = async () => {
    setErrorMsg("");

    if (!articuloBase?.id_articulo) return setErrorMsg("ID de artículo inválido");
    if (!String(form.descripcion || "").trim()) return setErrorMsg("Debe indicar descripción");

    // Validar obligatorios
    for (const c of clasificaciones) {
      const nk = normKey(c.nombre);
      if (CLASIF_BLOQUEADAS.has(nk)) continue;

      const key = `clasif_${c.id_clasificacion}`;
      if (c.es_obligatoria === 1 && !String(form[key] || "").trim()) {
        return setErrorMsg(`El campo "${c.nombre}" es obligatorio`);
      }
    }

    // Duplicado de descripción
    const existeDesc = articulos.some(
      (a) =>
        Number(a.id_articulo) !== Number(articuloBase.id_articulo) &&
        String(a.descripcion).toLowerCase() === String(form.descripcion).toLowerCase()
    );
    if (existeDesc) return setErrorMsg("La descripción ya existe");

    try {
      // Update base (SIN traspasa, SIN almacen/cantidad/ubicacion)
      const bodyUpdate = {
        codigo: articuloBase.codigo,
        descripcion: String(form.descripcion || "").trim(),
        tipo: String(form.tipo || "").trim() || null,

        folio: form.folio || null,
        proveedor: form.proveedor || null,
        punto_pedido: form.punto_pedido || null
      };

      await api.put(`/articulos/${articuloBase.id_articulo}`, bodyUpdate);

      // Update clasificaciones (sin bloqueadas)
      const payloadClasif = clasificaciones
        .filter((c) => !CLASIF_BLOQUEADAS.has(normKey(c.nombre)))
        .map((c) => ({
          id_clasificacion: c.id_clasificacion,
          valor: String(form[`clasif_${c.id_clasificacion}`] ?? "")
        }));

      await api.post(`/articulos/${articuloBase.id_articulo}/clasificaciones`, {
        clasificaciones: payloadClasif
      });

      onSaved?.();
      onClose?.();
    } catch (err) {
      console.error(err);
      setErrorMsg(err.response?.data?.error || err.message || "Error al guardar cambios");
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
          {/* Base: código/descripcion SOLO una vez */}
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
            <label>Tipo</label>
            <input
              type="text"
              value={form.tipo || ""}
              onChange={(e) => onChange("tipo", e.target.value)}
            />
          </div>

          {/* Si estos base los querés ocultar después, lo hacemos luego.
              Por ahora NO eran el foco del bug de duplicados. */}
          <div className="campo-linea">
            <label>Folio</label>
            <input
              type="text"
              value={form.folio || ""}
              onChange={(e) => onChange("folio", e.target.value)}
            />
          </div>

          <div className="campo-linea">
            <label>Proveedor</label>
            <input
              type="text"
              value={form.proveedor || ""}
              onChange={(e) => onChange("proveedor", e.target.value)}
            />
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

          {/* Clasificaciones: bloqueadas + duplicadas vacías fuera */}
          {clasificaciones
            .filter((c) => {
              const nk = normKey(c.nombre);

              // fuera base/ocultas/traspasa
              if (CLASIF_BLOQUEADAS.has(nk)) return false;

              const key = `clasif_${c.id_clasificacion}`;
              const valor = String(form[key] ?? "").trim();

              // si duplica base y viene vacío -> ocultar SOLO la clasificación vacía
              if (DUP_BASE.has(nk) && valor === "") return false;

              // si duplica codigo/descripcion (por si llegara aquí) -> fuera
              if (nk === "codigo" || nk === "descripcion") return false;

              return true;
            })
            .map((c) => {
              const key = `clasif_${c.id_clasificacion}`;
              return (
                <div className="campo-linea" key={c.id_clasificacion}>
                  <label>
                    {c.nombre}
                    {c.es_obligatoria === 1 && <span style={{ color: "red" }}> *</span>}
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
