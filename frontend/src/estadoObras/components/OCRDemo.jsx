import { useState } from "react";
import "./styles/OCRDemo.css";

export default function OCRDemo() {
  const [archivo, setArchivo] = useState(null);
  const [procesando, setProcesando] = useState(false);
  const [resultado, setResultado] = useState(null);

  const handleFile = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setArchivo(file);
    setProcesando(true);

    // Simular análisis OCR
    setTimeout(() => {
      setProcesando(false);
      setResultado({
        proveedor: "Vidrios del Norte SRL",
        obra: "12034.1 – Arquitectura Norte SRL",
        fecha: "2025-10-20",
        materiales: [
          { codigo: "DVH6CL", descripcion: "Vidrio DVH 6mm claro", cantidad: 12 },
          { codigo: "PVCBL", descripcion: "Perfil PVC Blanco 2.8m", cantidad: 25 },
          { codigo: "HERR01", descripcion: "Kit herrajes estándar", cantidad: 12 }
        ],
        totalLineas: 3
      });
    }, 2000);
  };

  return (
    <div className="ocr-demo">
      <h2>📄 OCR de Remitos (Simulación)</h2>

      {!archivo && (
        <div className="ocr-upload">
          <p>Arrastrá o seleccioná un remito (PDF o imagen)</p>
          <input type="file" accept=".pdf,.png,.jpg" onChange={handleFile} />
        </div>
      )}

      {archivo && procesando && (
        <div className="ocr-procesando">
          <p>🔍 Analizando "{archivo.name}" con IA...</p>
          <div className="loader"></div>
        </div>
      )}

      {resultado && (
        <div className="ocr-resultado">
          <h3>📦 Resultado del Análisis</h3>
          <p><strong>Proveedor:</strong> {resultado.proveedor}</p>
          <p><strong>Obra:</strong> {resultado.obra}</p>
          <p><strong>Fecha:</strong> {resultado.fecha}</p>

          <table className="ocr-tabla">
            <thead>
              <tr>
                <th>Código</th>
                <th>Descripción</th>
                <th>Cantidad</th>
              </tr>
            </thead>
            <tbody>
              {resultado.materiales.map((m, i) => (
                <tr key={i}>
                  <td>{m.codigo}</td>
                  <td>{m.descripcion}</td>
                  <td>{m.cantidad}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <button
            className="btn-confirmar"
            onClick={() => alert("✅ Remito importado correctamente.")}
          >
            Confirmar importación
          </button>
        </div>
      )}
    </div>
  );
}
