import React, { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../api/axiosConfig";
import "./../styles/transferencias.css";

export default function NuevoAjuste() {
  const navigate = useNavigate();

  const [depositos, setDepositos] = useState([]);
  const [motivos, setMotivos] = useState([]);
  const [ubicaciones, setUbicaciones] = useState([]);

  const [depositoId, setDepositoId] = useState("");
  const [ubicacionId, setUbicacionId] = useState("");
  const [motivoId, setMotivoId] = useState("");

  const [obra, setObra] = useState("");
  const [version, setVersion] = useState("");

  const [items, setItems] = useState([
    { codigo: "", descripcion: "", cantidad: "" }
  ]);

  const [errorMsg, setErrorMsg] = useState("");
  const [loadingUbicaciones, setLoadingUbicaciones] = useState(false);

  const codigoRefs = useRef([]);
  const cantidadRefs = useRef([]);

  const bloqueadoCabecera = items.some(
    it =>
      String(it.codigo || "").trim() !== "" ||
      String(it.cantidad || "").trim() !== ""
  );

  useEffect(() => {
    api.get("/depositos")
      .then(res => setDepositos(res.data || []))
      .catch(err => {
        console.error(err);
        setErrorMsg("No se pudieron cargar los depósitos.");
      });

    api.get("/ajustes/motivos")
      .then(res => setMotivos((res.data || []).filter(m => m.activo)))
      .catch(err => {
        console.error(err);
        setErrorMsg("No se pudieron cargar los motivos.");
      });
  }, []);

  useEffect(() => {
    if (!depositoId) {
      setUbicaciones([]);
      setUbicacionId("");
      return;
    }

    const cargarUbicaciones = async () => {
      try {
        setLoadingUbicaciones(true);
        setUbicaciones([]);
        setUbicacionId("");

        const res = await api.get(`/transferencias/ubicaciones/${depositoId}`);
        const list = res.data || [];

        setUbicaciones(list);

        const general = list.find(
          u => String(u.nombre || "").trim().toUpperCase() === "GENERAL"
        );

        if (general) {
          setUbicacionId(String(general.id_ubicacion));
        }
      } catch (err) {
        console.error(err);
        setErrorMsg("No se pudieron cargar las ubicaciones.");
      } finally {
        setLoadingUbicaciones(false);
      }
    };

    cargarUbicaciones();
  }, [depositoId]);

  const actualizarItem = (index, cambios) => {
    setItems(prev =>
      prev.map((it, i) => i === index ? { ...it, ...cambios } : it)
    );
  };

  const buscarArticulo = async (codigo, index) => {
    const c = String(codigo || "").trim().toUpperCase();

    if (!c) {
      actualizarItem(index, { descripcion: "" });
      return false;
    }

    try {
      const res = await api.get(`/articulos/codigo/${encodeURIComponent(c)}`);

      actualizarItem(index, {
        codigo: res.data?.codigo || c,
        descripcion: res.data?.descripcion || ""
      });

      return true;
    } catch (err) {
      console.error("No se encontró artículo:", err);

      actualizarItem(index, {
        codigo: c,
        descripcion: "Artículo no encontrado"
      });

      return false;
    }
  };

  const asegurarFilaSiguiente = (index, focusCol = "codigo") => {
    setItems(prev => {
      const nuevo = [...prev];

      if (index === nuevo.length - 1) {
        nuevo.push({ codigo: "", descripcion: "", cantidad: "" });
      }

      return nuevo;
    });

    setTimeout(() => {
      if (focusCol === "cantidad") {
        cantidadRefs.current[index + 1]?.focus();
      } else {
        codigoRefs.current[index + 1]?.focus();
      }
    }, 80);
  };

  const handleCodigoKeyDown = async (e, index) => {
    if (e.key !== "Enter") return;

    e.preventDefault();

    const c = String(items[index]?.codigo || "").trim().toUpperCase();
    if (!c) return;

    await buscarArticulo(c, index);
    asegurarFilaSiguiente(index, "codigo");
  };

  const handleCantidadKeyDown = (e, index) => {
    if (e.key !== "Enter") return;

    e.preventDefault();
    asegurarFilaSiguiente(index, "cantidad");
  };

  const quitarItem = (idx) => {
    setItems(prev => {
      const nuevo = prev.filter((_, i) => i !== idx);
      return nuevo.length ? nuevo : [{ codigo: "", descripcion: "", cantidad: "" }];
    });
  };

  const agregarFila = () => {
    setItems(prev => [...prev, { codigo: "", descripcion: "", cantidad: "" }]);

    setTimeout(() => {
      codigoRefs.current[items.length]?.focus();
    }, 80);
  };

  const confirmar = async () => {
    try {
      setErrorMsg("");

      if (!depositoId) return setErrorMsg("Seleccioná un depósito.");
      if (!motivoId) return setErrorMsg("Seleccioná un motivo.");

      const itemsValidos = items
        .map(it => ({
          cod_articulo: String(it.codigo || "").trim().toUpperCase(),
          descripcion: String(it.descripcion || "").trim(),
          cantidad: Number(it.cantidad)
        }))
        .filter(it => it.cod_articulo);

      if (!itemsValidos.length) {
        return setErrorMsg("Cargá al menos un código.");
      }

      const noEncontrados = itemsValidos.filter(it =>
        !it.descripcion ||
        it.descripcion.toUpperCase().includes("NO ENCONTRADO")
      );

      if (noEncontrados.length) {
        return setErrorMsg("Hay códigos sin validar o no encontrados.");
      }

      const sinCantidad = itemsValidos.filter(it => !it.cantidad || it.cantidad === 0);

      if (sinCantidad.length) {
        return setErrorMsg("Todos los códigos deben tener cantidad distinta de 0.");
      }

      const body = {
        deposito_id: Number(depositoId),
        id_ubicacion: ubicacionId ? Number(ubicacionId) : null,
        motivo_id: Number(motivoId),
        obra: Number(obra),
        version: Number(version),
        items: itemsValidos.map(it => ({
          cod_articulo: it.cod_articulo,
          cantidad: it.cantidad
        }))
      };

      const res = await api.post("/ajustes", body);

      alert(
        "Ajuste creado: " +
          (
            res.data?.ajuste?.numero_ajuste ||
            res.data?.ajuste?.id ||
            res.data?.message ||
            "OK"
          )
      );

      navigate("/ajustes");
    } catch (err) {
      const msg =
        err.response?.data?.error ||
        err.response?.data?.detalle ||
        err.message ||
        "Error al crear ajuste";

      setErrorMsg(typeof msg === "string" ? msg : JSON.stringify(msg));
    }
  };

  const hayItemsConDatos = items.some(it => String(it.codigo || "").trim());

  const depositoNombre = useMemo(() => {
    const d = depositos.find(x => String(x.id_deposito) === String(depositoId));
    return d?.nombre || "";
  }, [depositos, depositoId]);

  return (
    <div className="nueva-transferencia-page">
      <div className="nt-header">
        <h2 className="module-title">Nuevo Ajuste</h2>

        <button className="nt-volver" onClick={() => navigate("/ajustes")}>
          ← Volver
        </button>
      </div>

      {errorMsg && <div className="nt-error">{errorMsg}</div>}

      <div className="nt-card">
        <div className="nt-row">
          <div className="nt-field">
            <label>Depósito</label>

            <select
              value={depositoId}
              onChange={e => setDepositoId(e.target.value)}
              disabled={bloqueadoCabecera}
            >
              <option value="">-- Seleccioná depósito --</option>

              {depositos.map(d => (
                <option key={d.id_deposito} value={d.id_deposito}>
                  {d.nombre}
                </option>
              ))}
            </select>
          </div>

          <div className="nt-field">
            <label>Ubicación {depositoNombre ? `(${depositoNombre})` : ""}</label>

            <select
              value={ubicacionId}
              onChange={e => setUbicacionId(e.target.value)}
              disabled={bloqueadoCabecera || !depositoId || loadingUbicaciones}
            >
              <option value="">
                {depositoId ? "-- Seleccioná ubicación --" : "Seleccioná depósito primero"}
              </option>

              {ubicaciones.map(u => (
                <option key={u.id_ubicacion} value={u.id_ubicacion}>
                  {u.nombre}
                </option>
              ))}
            </select>
          </div>

          <div className="nt-field">
            <label>Motivo</label>

            <select
              value={motivoId}
              onChange={e => setMotivoId(e.target.value)}
              disabled={bloqueadoCabecera}
            >
              <option value="">-- Seleccioná motivo --</option>

              {motivos.map(m => (
                <option key={m.id_motivo} value={m.id_motivo}>
                  {m.nombre}
                </option>
              ))}
            </select>
          </div>

          <div className="nt-field small">
            <label>Obra</label>
            <input
              type="number"
              value={obra}
              onChange={e => setObra(e.target.value.replace(/[^0-9]/g, ""))}
              disabled={bloqueadoCabecera}
            />
          </div>

          <div className="nt-field small">
            <label>Versión</label>
            <input
              type="number"
              value={version}
              onChange={e => setVersion(e.target.value.replace(/[^0-9]/g, ""))}
              disabled={bloqueadoCabecera}
            />
          </div>
        </div>
      </div>

      <div className="nt-card">
        <h4>Ítems del ajuste</h4>

        <div className="tabla-articulos-container">
          <table className="tabla-articulos">
            <thead>
              <tr>
                <th style={{ width: "180px" }}>Código</th>
                <th>Descripción</th>
                <th style={{ width: "140px", textAlign: "right" }}>Cantidad</th>
                <th style={{ width: "110px" }}>Acción</th>
              </tr>
            </thead>

            <tbody>
              {items.map((it, idx) => (
                <tr key={idx}>
                  <td>
                    <input
                      ref={el => codigoRefs.current[idx] = el}
                      type="text"
                      value={it.codigo}
                      placeholder="Código..."
                      onChange={e =>
                        actualizarItem(idx, {
                          codigo: e.target.value.toUpperCase(),
                          descripcion: ""
                        })
                      }
                      onBlur={() => buscarArticulo(it.codigo, idx)}
                      onKeyDown={e => handleCodigoKeyDown(e, idx)}
                      style={{ width: "100%" }}
                    />
                  </td>

                  <td>
                    <input
                      type="text"
                      value={it.descripcion}
                      readOnly
                      placeholder="Se completa automáticamente"
                      style={{ width: "100%" }}
                    />
                  </td>

                  <td>
                    <input
                      ref={el => cantidadRefs.current[idx] = el}
                      type="number"
                      step="1"
                      value={it.cantidad}
                      onChange={e =>
                        actualizarItem(idx, {
                          cantidad: e.target.value.replace(/[^0-9-]/g, "")
                        })
                      }
                      onKeyDown={e => handleCantidadKeyDown(e, idx)}
                      style={{ width: "100%", textAlign: "right" }}
                    />
                  </td>

                  <td>
                    <button className="borrar-btn" onClick={() => quitarItem(idx)}>
                      Quitar
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="nt-actions" style={{ marginTop: 14 }}>
          <button className="btn-light" onClick={agregarFila}>
            Agregar fila
          </button>

          <button
            className="btn-primary"
            onClick={confirmar}
            disabled={!depositoId || !motivoId || !hayItemsConDatos}
          >
            Confirmar ajuste
          </button>
        </div>
      </div>
    </div>
  );
}