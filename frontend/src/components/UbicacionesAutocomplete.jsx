import React, { useEffect, useMemo, useRef, useState } from "react";
import "./../styles/ubicaciones.css";

const normalizar = (v) =>
  String(v || "")
    .trim()
    .toUpperCase();

export default function UbicacionAutocomplete({
  value,
  ubicaciones = [],
  disabled = false,
  placeholder = "Ubicación",
  onChange,
  onValidSave,
  onCancel,
}) {
  const [texto, setTexto] = useState(value || "");
  const [open, setOpen] = useState(false);
  const [error, setError] = useState("");
  const wrapRef = useRef(null);

  useEffect(() => {
    setTexto(value || "");
  }, [value]);

  useEffect(() => {
    const handleClick = (e) => {
      if (!wrapRef.current) return;

      if (!wrapRef.current.contains(e.target)) {
        setOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClick);

    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const ubicacionesActivas = useMemo(() => {
    const map = new Map();

    (ubicaciones || [])
      .filter((u) => u.activa !== false && u.activa !== 0)
      .forEach((u) => {
        const nombre = normalizar(u.nombre);

        if (nombre && !map.has(nombre)) {
          map.set(nombre, {
            ...u,
            nombre,
          });
        }
      });

    return Array.from(map.values()).sort((a, b) =>
      String(a.nombre).localeCompare(String(b.nombre))
    );
  }, [ubicaciones]);

  const sugerencias = useMemo(() => {
    const q = normalizar(texto);

    if (!q) return ubicacionesActivas.slice(0, 15);

    return ubicacionesActivas
      .filter((u) => normalizar(u.nombre).includes(q))
      .slice(0, 15);
  }, [texto, ubicacionesActivas]);

  const existeUbicacion = (nombre) => {
    const n = normalizar(nombre);

    return ubicacionesActivas.some((u) => normalizar(u.nombre) === n);
  };

  const seleccionar = (nombre) => {
    const n = normalizar(nombre);

    setTexto(n);
    setError("");
    setOpen(false);

    if (onChange) onChange(n);
    if (onValidSave) onValidSave(n);
  };

  const validarYGuardar = () => {
    const n = normalizar(texto);

    if (!n) {
      setError("");
      if (onChange) onChange("");
      if (onValidSave) onValidSave("");
      return;
    }

    if (!existeUbicacion(n)) {
      setError("La ubicación no existe.");
      setOpen(true);
      return;
    }

    setError("");

    if (onChange) onChange(n);
    if (onValidSave) onValidSave(n);
  };

  return (
    <div className="ubi-autocomplete" ref={wrapRef}>
      <input
        value={texto}
        disabled={disabled}
        placeholder={placeholder}
        onFocus={() => setOpen(true)}
        onChange={(e) => {
          const v = e.target.value.toUpperCase();

          setTexto(v);
          setError("");
          setOpen(true);

          if (onChange) onChange(v);
        }}
        onBlur={() => {
          setTimeout(() => validarYGuardar(), 150);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();

            if (sugerencias.length === 1) {
              seleccionar(sugerencias[0].nombre);
              return;
            }

            validarYGuardar();
          }

          if (e.key === "Escape") {
            e.preventDefault();

            setError("");
            setOpen(false);
            setTexto(value || "");

            if (onCancel) onCancel();
          }
        }}
        className={error ? "ubi-input-error" : ""}
      />

      {open && sugerencias.length > 0 && (
        <div className="ubi-suggestions">
          {sugerencias.map((u) => (
            <button
              key={u.id_ubicacion || u.nombre}
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => seleccionar(u.nombre)}
            >
              <span>{u.nombre}</span>
            </button>
          ))}
        </div>
      )}

      {error && <div className="ubi-error">{error}</div>}
    </div>
  );
}