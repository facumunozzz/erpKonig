export default function ExportButton({ obras }) {
  const exportar = () => {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(obras, null, 2));
    const link = document.createElement("a");
    link.href = dataStr;
    link.download = "obras_estado.json";
    link.click();
  };

  return (
    <button onClick={exportar} className="export-btn">
      📤 Exportar informe
    </button>
  );
}
