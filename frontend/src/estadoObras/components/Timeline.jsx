export default function Timeline({ estado, progreso }) {
  const hitos = [
    'Comprometida',
    'Planificada',
    'En Compras',
    'Con Ingresos',
    'En Producción',
    'Lista p/Logística',
    'En Instalación',
    'Instalada',
    'Cerrada'
  ];

  const index = hitos.indexOf(estado);

  return (
    <div className="timeline">
      {hitos.map((h, i) => (
        <div key={i} className={`timeline-step ${i <= index ? 'active' : ''}`}>
          <div className="circle"></div>
          <span>{h}</span>
        </div>
      ))}
    </div>
  );
}
