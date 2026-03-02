import React, { useEffect, useMemo, useState } from "react";
import api from "../api/axiosConfig.js";
import "./../styles/articulos.css";

function normKey(nombre) {
  return String(nombre || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")     // quita tildes
    .replace(/[^\w\s-]/g, "")           // quita símbolos raros
    .replace(/\s+/g, "_")               // espacios -> _
    .replace(/_+/g, "_");
}

export default function ArticuloCrearModal({
  isOpen,
  onClose,
  articulos = [],
  onSaved
}) {
  const [clasificaciones, setClasificaciones] = useState([]);
  const [form, setForm] = useState({ codigo: "", descripcion: "", tipo: "" });
  const [errorMsg, setErrorMsg] = useState("");

  // Todo lo que NO debe renderizarse como "clasificación"
  // (porque es campo base u oculto, o porque no existe más en UI)
  const CLASIF_BLOQUEADAS = useMemo(
    () =>
      new Set([
        "codigo",
        "descripcion",
        "tipo",
        "traspasa",     // <- NO debe aparecer
        "almacen",
        "cantidad",
        "ubicacion"
      ]),
    []
  );

  useEffect(() => {
    if (!isOpen) return;

    setErrorMsg("");
    setForm({ codigo: "", descripcion: "", tipo: "" });
    setClasificaciones([]);

    (async () => {
      try {
        const res = await api.get("/clasificaciones");
        const activas = (res.data || []).filter((c) => c.activa == 1);

        // armamos modelo con keys dinámicas (por nombre normalizado)
        const modelo = { codigo: "", descripcion: "", tipo: "" };
        activas.forEach((c) => {
          const k = normKey(c.nombre);
          modelo[k] = "";
        });

        setClasificaciones(activas);
        setForm(modelo);
      } catch (err) {
        console.error(err);
        setErrorMsg("Error al cargar clasificaciones");
      }
    })();
  }, [isOpen]);

  const onChange = (campo, valor) => {
    setForm((prev) => ({ ...prev, [campo]: valor }));
  };

  const guardar = async () => {
    setErrorMsg("");

    // Validación base
    if (!form.codigo?.trim() || !form.descripcion?.trim()) {
      return setErrorMsg("Debe indicar código y descripción");
    }

    // Duplicados
    const existeCod = articulos.some(
      (a) => String(a.codigo).toLowerCase() === String(form.codigo).toLowerCase()
    );
    if (existeCod) return setErrorMsg("El código ya existe");

    const existeDesc = articulos.some(
      (a) =>
        String(a.descripcion).toLowerCase() ===
        String(form.descripcion).toLowerCase()
    );
    if (existeDesc) return setErrorMsg("La descripción ya existe");

    // Obligatorios de clasificaciones (bloqueadas NO cuentan)
    for (const c of clasificaciones) {
      const k = normKey(c.nombre);
      if (CLASIF_BLOQUEADAS.has(k)) continue;

      if (c.es_obligatoria === 1 && !String(form[k] || "").trim()) {
        return setErrorMsg(`El campo "${c.nombre}" es obligatorio`);
      }
    }

    try {
      // 1) Crear artículo base (SIN traspasa)
      const articuloBase = {
        codigo: form.codigo.trim(),
        descripcion: form.descripcion.trim(),
        tipo: String(form.tipo || "").trim() || null,

        // Mantengo compatibilidad con tu backend actual (si existen en DB)
        folio: form.folio || null,
        proveedor: form.proveedor || null,
        punto_pedido: form.punto_pedido || null,

        ubicacion: null,
        cantidad: 0
      };

      const resArticulo = await api.post("/articulos", articuloBase);
      const idArticulo = resArticulo.data?.id_articulo;
      if (!idArticulo) throw new Error("El backend no devolvió id_articulo");

      // 2) Guardar clasificaciones (solo las válidas)
      const payload = clasificaciones
        .filter((c) => !CLASIF_BLOQUEADAS.has(normKey(c.nombre)))
        .map((c) => ({
          id_clasificacion: c.id_clasificacion,
          valor: String(form[normKey(c.nombre)] ?? "")
        }));

      await api.post(`/articulos/${idArticulo}/clasificaciones`, {
        clasificaciones: payload
      });

      onSaved?.();
      onClose?.();
    } catch (err) {
      console.error(err);
      setErrorMsg(
        err.response?.data?.error || err.message || "Error al guardar el artículo"
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
          {/* Campos base: SOLO una vez */}
          <div className="campo-linea">
            <label>Código</label>
            <input
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
            <label>Tipo</label>
            <input
              type="text"
              value={form.tipo || ""}
              onChange={(e) => onChange("tipo", e.target.value)}
            />
          </div>

          <hr />

          {/* Clasificaciones: SIN codigo/descripcion/tipo/traspasa/almacen/cantidad/ubicacion */}
          {clasificaciones
            .filter((c) => !CLASIF_BLOQUEADAS.has(normKey(c.nombre)))
            .map((c) => {
              const k = normKey(c.nombre);
              return (
                <div className="campo-linea" key={c.id_clasificacion}>
                  <label>
                    {c.nombre}
                    {c.es_obligatoria === 1 && (
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
