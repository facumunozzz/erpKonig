const XLSX = require("xlsx");
const { downloadByPath } = require("../services/dropbox");

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

function formatFecha(value) {
  if (value == null || value === "") return "";

  if (typeof value === "number") {
    const d = excelDateToJSDate(value);
    if (!d || isNaN(d.getTime())) return String(value);
    const dd = String(d.getDate()).padStart(2, "0");
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const yyyy = d.getFullYear();
    return `${dd}/${mm}/${yyyy}`;
  }

  if (value instanceof Date && !isNaN(value.getTime())) {
    const dd = String(value.getDate()).padStart(2, "0");
    const mm = String(value.getMonth() + 1).padStart(2, "0");
    const yyyy = value.getFullYear();
    return `${dd}/${mm}/${yyyy}`;
  }

  return String(value).trim();
}

function formatHora(value) {
  if (value == null || value === "") return "";

  if (typeof value === "number") {
    const d = excelDateToJSDate(value);
    if (!d || isNaN(d.getTime())) return String(value);
    const hh = String(d.getHours()).padStart(2, "0");
    const mm = String(d.getMinutes()).padStart(2, "0");
    return `${hh}:${mm}`;
  }

  if (value instanceof Date && !isNaN(value.getTime())) {
    const hh = String(value.getHours()).padStart(2, "0");
    const mm = String(value.getMinutes()).padStart(2, "0");
    return `${hh}:${mm}`;
  }

  return String(value).trim();
}

function toNumberOrZero(value) {
  if (value == null || value === "") return 0;
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  const n = Number(String(value).replace(",", ".").trim());
  return Number.isFinite(n) ? n : 0;
}

exports.getRegistroOT = async (req, res) => {
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

    const data = rows
      .slice(1)
      .map((row, index) => {
        const fecha = row[0] ?? "";        // A
        const operador = row[1] ?? "";     // B
        const horaInicio = row[2] ?? "";   // C
        const horaFin = row[3] ?? "";      // D
        const codigo = row[4] ?? "";       // E  -> obra
        const maquina = row[5] ?? "";      // F  -> operación
        const fabricado = row[6] ?? "";    // G
        const parada = row[7] ?? "";       // H
        const pedido = row[10] ?? "";      // K

        return {
          id: index + 1,
          obra: String(codigo).trim(),
          maquina: String(maquina).trim(),
          codigo: String(codigo).trim(),
          pedido: toNumberOrZero(pedido),
          fabricado: toNumberOrZero(fabricado),
          fecha: formatFecha(fecha),
          horaInicio: formatHora(horaInicio),
          horaFin: formatHora(horaFin),
          operador: String(operador).trim(),
          parada: String(parada).trim(),
        };
      })
      .filter(
        (item) =>
          item.obra ||
          item.maquina ||
          item.codigo ||
          item.pedido ||
          item.fabricado ||
          item.fecha ||
          item.horaInicio ||
          item.horaFin ||
          item.operador ||
          item.parada
      );

    return res.json({
      ok: true,
      source: fileId,
      hoja: "Datos",
      total: data.length,
      rows: data,
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

    console.error("dropboxRegistro.getRegistroOT:", err.message, dropboxError);

    return res.status(500).json({
      error: "Error leyendo el registro desde Dropbox",
      detalle: err.message,
      dropbox: dropboxError,
    });
  }
};