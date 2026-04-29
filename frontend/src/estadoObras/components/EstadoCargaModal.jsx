import { useState } from "react";
import "./styles/EstadoCargaModal.css";

const initialForm = {
  caratula: "",
  version: "",
  fase: "",
  mrp: "",
  fecha_mrp: "",
  prioridad: "",
  etapa: "",
  estado_detalle: "",
  referencia: "",
  color: "",
  carpinteria: "",
  vidrio: "",
  recepcion: "",
  premarcos: "",
  mosquitero: "",
  complejidad: "",
  inicio_prod: "",
  disponibilidad: "",
  comentario: "",
};

export default function EstadoCargaModal({ estado, onClose, onSaved }) {
  const [form, setForm] = useState(initialForm);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  function handleChange(e) {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    try {
      setSaving(true);
      setError("");

      const res = await fetch("/api/estado-resumen", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          estado,
          ...form,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data?.error || "No se pudo guardar");
      }

      onSaved?.();
    } catch (err) {
      setError(err.message || "Error inesperado");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="modal-backdrop">
      <div className="modal-card">
        <div className="modal-header">
          <h3>Cargar información</h3>
          <button type="button" onClick={onClose} className="btn-close">
            ×
          </button>
        </div>

        <p className="modal-subtitle">
          Estado: <strong>{estado}</strong>
        </p>

        <form onSubmit={handleSubmit} className="modal-form">
          <input name="caratula" placeholder="Carátula" value={form.caratula} onChange={handleChange} />
          <input name="version" placeholder="Versión" value={form.version} onChange={handleChange} />
          <input name="fase" placeholder="Fase" value={form.fase} onChange={handleChange} />
          <input name="mrp" placeholder="MRP" value={form.mrp} onChange={handleChange} />
          <input type="date" name="fecha_mrp" value={form.fecha_mrp} onChange={handleChange} />
          <input name="prioridad" placeholder="Prioridad" value={form.prioridad} onChange={handleChange} />
          <input name="etapa" placeholder="Etapa" value={form.etapa} onChange={handleChange} />
          <input name="estado_detalle" placeholder="Estado detalle" value={form.estado_detalle} onChange={handleChange} />
          <input name="referencia" placeholder="Referencia" value={form.referencia} onChange={handleChange} />
          <input name="color" placeholder="Color" value={form.color} onChange={handleChange} />
          <input name="carpinteria" placeholder="Carpintería" value={form.carpinteria} onChange={handleChange} />
          <input name="vidrio" placeholder="Vidrio" value={form.vidrio} onChange={handleChange} />
          <input name="recepcion" placeholder="Recepción" value={form.recepcion} onChange={handleChange} />
          <input name="premarcos" placeholder="Premarcos" value={form.premarcos} onChange={handleChange} />
          <input name="mosquitero" placeholder="Mosquitero" value={form.mosquitero} onChange={handleChange} />
          <input name="complejidad" placeholder="Complejidad" value={form.complejidad} onChange={handleChange} />
          <input type="date" name="inicio_prod" value={form.inicio_prod} onChange={handleChange} />
          <input name="disponibilidad" placeholder="Disponibilidad" value={form.disponibilidad} onChange={handleChange} />
          <textarea name="comentario" placeholder="Comentario" value={form.comentario} onChange={handleChange} rows={4} />

          {error && <p className="modal-error">{error}</p>}

          <div className="modal-actions">
            <button type="button" onClick={onClose} className="btn-secondary">
              Cancelar
            </button>
            <button type="submit" className="btn-primary" disabled={saving}>
              {saving ? "Guardando..." : "Guardar"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}