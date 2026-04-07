const XLSX = require("xlsx");
const { downloadByPath } = require("../services/dropbox");

const OPERACIONES_FIJAS = [
  "PREPARACIÓN PERFIL",
  "CORTE REFUERZO",
  "CORTE PERFIL",
  "MECANIZADO",
  "SOLDADURA AUTO",
  "ARMADO",
  "ACRISTALADO",
  "MOSQUITERO",
];

function excelDateToJSDate(serial) {
  if (typeof serial !== "number" || !Number.isFinite(serial)) return null;

  const utcDays = Math.floor(serial - 25569);
  const utcValue = utcDays * 86400;
  const dateInfo = new Date(utcValue * 1000);

  const fractionalDay = serial - Math.floor(serial);
  let totalSeconds = Math.round(86400 * fractionalDay);

  const seconds = totalSeconds % 60;
  totalSeconds = (totalSeconds - seconds) / 60;
  const minutes = totalSeconds % 60;
  const hours = (totalSeconds - minutes) / 60;

  return new Date(
    dateInfo.getUTCFullYear(),
    dateInfo.getUTCMonth(),
    dateInfo.getUTCDate(),
    hours,
    minutes,
    seconds
  );
}

function toNumberOrZero(value) {
  if (value == null || value === "") return 0;
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  const n = Number(String(value).replace(",", ".").trim());
  return Number.isFinite(n) ? n : 0;
}

function normalizeOperation(value) {
  const t = String(value || "").trim().toUpperCase();

  const map = {
    "PREPARACION PERFIL": "PREPARACIÓN PERFIL",
    "PREPARACIÓN PERFIL": "PREPARACIÓN PERFIL",
    "CORTE REFUERZO": "CORTE REFUERZO",
    "CORTE PERFIL": "CORTE PERFIL",
    "MECANIZADO": "MECANIZADO",
    "SOLDADURA AUTO": "SOLDADURA AUTO",
    "ARMADO": "ARMADO",
    "ACRISTALADO": "ACRISTALADO",
    "MOSQUITERO": "MOSQUITERO",
  };

  return map[t] || "";
}

function parseDateTime(fechaValue, horaValue, fallbackIndex = 0) {
  let d = null;

  if (fechaValue instanceof Date && !isNaN(fechaValue.getTime())) {
    d = new Date(fechaValue);
  } else if (typeof fechaValue === "number") {
    d = excelDateToJSDate(fechaValue);
  } else if (fechaValue) {
    const parsed = new Date(fechaValue);
    if (!isNaN(parsed.getTime())) d = parsed;
  }

  if (!d) d = new Date(2000, 0, 1);

  let h = 0;
  let m = 0;

  if (horaValue instanceof Date && !isNaN(horaValue.getTime())) {
    h = horaValue.getHours();
    m = horaValue.getMinutes();
  } else if (typeof horaValue === "number") {
    const hd = excelDateToJSDate(horaValue);
    if (hd && !isNaN(hd.getTime())) {
      h = hd.getHours();
      m = hd.getMinutes();
    }
  } else if (typeof horaValue === "string" && horaValue.includes(":")) {
    const [hs, ms] = horaValue.split(":");
    h = Number(hs || 0);
    m = Number(ms || 0);
  }

  d.setHours(h, m, 0, 0);

  return {
    stamp: d.getTime(),
    dayKey: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`,
    fallbackIndex,
  };
}

function buildRowsFromSheet(rows) {
  return rows
    .slice(1)
    .map((row, index) => {
      const fecha = row[0] ?? "";        // A
      const operador = row[1] ?? "";     // B
      const horaInicio = row[2] ?? "";   // C
      const horaFin = row[3] ?? "";      // D
      const codigo = row[4] ?? "";       // E -> obra
      const maquina = row[5] ?? "";      // F -> operación
      const fabricado = row[6] ?? "";    // G
      const parada = row[7] ?? "";       // H
      const pedido = row[10] ?? "";      // K

      const fechaInfo = parseDateTime(fecha, horaInicio, index);

      return {
        id: index + 1,
        obra: String(codigo || "").trim(),
        operacion: normalizeOperation(maquina),
        pedido: toNumberOrZero(pedido),
        fabricado: toNumberOrZero(fabricado),
        operador: String(operador || "").trim(),
        parada: String(parada || "").trim(),
        sortStamp: fechaInfo.stamp,
        sortDayKey: fechaInfo.dayKey,
        sortIndex: index,
      };
    })
    .filter((r) => r.obra && r.operacion);
}

function sortChronological(a, b) {
  if (a.sortStamp !== b.sortStamp) return a.sortStamp - b.sortStamp;
  return a.sortIndex - b.sortIndex;
}

function extractPedidoBlocks(records) {
  if (!records.length) return [];

  const remaining = [...records].sort(sortChronological);
  const blocks = [];

  while (remaining.length > 0) {
    remaining.sort(sortChronological);

    const firstDay = remaining[0].sortDayKey;
    const sameDay = remaining.filter((r) => r.sortDayKey === firstDay);

    let seed = sameDay[0];
    for (const r of sameDay) {
      if (r.pedido > seed.pedido) seed = r;
    }

    const seedIndex = remaining.findIndex((r) => r === seed);
    remaining.splice(seedIndex, 1);

    const block = {
      pedidoReal: seed.pedido,
      fabricadoAcumulado: seed.fabricado,
      registros: [seed],
    };

    let changed = true;
    while (changed) {
      changed = false;

      if (block.fabricadoAcumulado >= block.pedidoReal) break;

      const pendiente = Math.max(block.pedidoReal - block.fabricadoAcumulado, 0);

      const nextIndex = remaining.findIndex((r) => r.pedido === pendiente);
      if (nextIndex >= 0) {
        const next = remaining[nextIndex];
        block.registros.push(next);
        block.fabricadoAcumulado += next.fabricado;
        remaining.splice(nextIndex, 1);
        changed = true;
      }
    }

    blocks.push(block);
  }

  return blocks;
}

function buildOperacionResumen(obra, operacion, rows) {
  const ordered = [...rows].sort(sortChronological);
  const blocks = extractPedidoBlocks(ordered);

  // 🔥 CAMBIO CLAVE:
  const firstBlock = blocks.length ? blocks[0] : null;

  const pedido = firstBlock ? firstBlock.pedidoReal : 0;

  // 🔥 Fabricado total de TODOS los bloques (no solo el último)
  const fabricadoTotal = blocks.reduce(
    (acc, b) => acc + (b.fabricadoAcumulado || 0),
    0
  );

  const fabricado = Math.min(fabricadoTotal, pedido);

  const porcentaje =
    pedido > 0 ? Math.min(100, Math.round((fabricado / pedido) * 100)) : 0;

  const completa = pedido > 0 && fabricado >= pedido;

  return {
    obra,
    nombre: operacion,
    pedido,
    fabricado,
    porcentaje,
    completa,
    bloquesDetectados: blocks.length,
  };
}

exports.getDashboardObras = async (req, res) => {
  try {
    const fileId = (process.env.DROPBOX_EFICIENCIA_ID || "").trim();

    if (!fileId) {
      return res.status(500).json({
        error: "Falta definir DROPBOX_EFICIENCIA_ID en el .env",
      });
    }

    const fileBuffer = await downloadByPath(fileId);

    const workbook = XLSX.read(fileBuffer, {
      type: "buffer",
      cellDates: true,
    });

    const sheet = workbook.Sheets["Datos"];
    if (!sheet) {
      return res.status(404).json({
        error: "No se encontró la hoja 'Datos' en el archivo de Dropbox",
        hojasDisponibles: workbook.SheetNames,
      });
    }

    const rows = XLSX.utils.sheet_to_json(sheet, {
      header: 1,
      defval: "",
      raw: true,
    });

    const registros = buildRowsFromSheet(rows);

    const byObra = new Map();

    for (const r of registros) {
      if (!byObra.has(r.obra)) byObra.set(r.obra, new Map());
      const byOperacion = byObra.get(r.obra);

      if (!byOperacion.has(r.operacion)) byOperacion.set(r.operacion, []);
      byOperacion.get(r.operacion).push(r);
    }

    const obras = [];

    for (const [obra, operacionesMap] of byObra.entries()) {
      const operaciones = OPERACIONES_FIJAS.map((opName) => {
        const opsRows = operacionesMap.get(opName) || [];
        return buildOperacionResumen(obra, opName, opsRows);
      });

      const cumplimiento = Math.round(
        operaciones.reduce((acc, op) => acc + op.porcentaje, 0) / OPERACIONES_FIJAS.length
      );

      const finalizada =
        operaciones.length > 0 &&
        operaciones.every((op) => op.completa);

      obras.push({
        id: obra,
        obra,
        cumplimiento,
        finalizada,
        operaciones,
      });
    }

    obras.sort((a, b) => {
      const aNum = Number(String(a.obra).replace(",", "."));
      const bNum = Number(String(b.obra).replace(",", "."));
      if (Number.isFinite(aNum) && Number.isFinite(bNum)) return aNum - bNum;
      return String(a.obra).localeCompare(String(b.obra), "es");
    });

    return res.json({
      ok: true,
      total: obras.length,
      rows: obras,
    });
  } catch (err) {
    let dropboxError = err.response?.data || null;

    if (Buffer.isBuffer(dropboxError)) {
      try {
        dropboxError = JSON.parse(dropboxError.toString("utf8"));
      } catch {
        dropboxError = dropboxError.toString("utf8");
      }
    }

    console.error("dashboardObras.getDashboardObras:", err.message, dropboxError);

    return res.status(500).json({
      error: "Error generando dashboard de obras",
      detalle: err.message,
      dropbox: dropboxError,
    });
  }
};