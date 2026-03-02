// backend/services/dropbox.js
const axios = require("axios");

// -----------------------------------------------------------
// Dropbox OAuth (refresh token) + cache de access_token
// -----------------------------------------------------------
let cachedAccessToken = null;
let cachedAccessTokenExpMs = 0;

function mustEnv(name) {
  const v = process.env[name];
  if (!v) throw new Error(`Falta ${name} en .env`);
  return v;
}

/**
 * Obtiene (y cachea) un access_token usando refresh_token.
 * Requiere en .env:
 *   DROPBOX_APP_KEY
 *   DROPBOX_APP_SECRET
 *   DROPBOX_REFRESH_TOKEN
 */
async function fetchAccessTokenFromRefresh() {
  const APP_KEY = mustEnv("DROPBOX_APP_KEY").trim().replace(/^"|"$/g, "");
  const APP_SECRET = mustEnv("DROPBOX_APP_SECRET").trim().replace(/^"|"$/g, "");
  const REFRESH_TOKEN = mustEnv("DROPBOX_REFRESH_TOKEN").trim().replace(/^"|"$/g, "");

  const body = new URLSearchParams();
  body.append("grant_type", "refresh_token");
  body.append("refresh_token", REFRESH_TOKEN);

  const res = await axios.post("https://api.dropboxapi.com/oauth2/token", body, {
    auth: { username: APP_KEY, password: APP_SECRET }, // Basic Auth
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    timeout: 60000,
  });

  const accessToken = res.data?.access_token;
  const expiresInSec = Number(res.data?.expires_in || 14400);

  if (!accessToken) {
    throw new Error("Dropbox: no se pudo obtener access_token desde refresh_token");
  }

  // Cache con margen de 60s para evitar usarlo vencido
  cachedAccessToken = accessToken;
  cachedAccessTokenExpMs = Date.now() + Math.max(60, expiresInSec - 60) * 1000;

  return accessToken;
}

async function getDropboxToken() {
  if (cachedAccessToken && Date.now() < cachedAccessTokenExpMs) return cachedAccessToken;
  return await fetchAccessTokenFromRefresh();
}

// -----------------------------------------------------------
// API helpers (sin cambios funcionales, solo token async)
// -----------------------------------------------------------

/**
 * Obtiene metadata del archivo/carpeta.
 * Acepta path normal "/Carpeta/archivo.xlsx" o "id:xxxx".
 * Devuelve un objeto con meta.id, meta.name, meta.path_display, etc.
 */
async function getMetadata(pathOrId) {
  const token = await getDropboxToken();

  const res = await axios.post(
    "https://api.dropboxapi.com/2/files/get_metadata",
    {
      path: pathOrId,
      include_media_info: false,
      include_deleted: false,
      include_has_explicit_shared_members: false,
    },
    {
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      timeout: 60000,
    }
  );

  return res.data;
}

/**
 * Descarga un archivo como Buffer.
 * Acepta path "/..." o "id:..."
 */
async function downloadByPath(path) {
  const token = await getDropboxToken();

  const res = await axios.post(
    "https://content.dropboxapi.com/2/files/download",
    "", // 👈 body vacío (NO null)
    {
      responseType: "arraybuffer",
      headers: {
        Authorization: `Bearer ${token}`,
        "Dropbox-API-Arg": JSON.stringify({ path }),
        "Content-Type": "text/plain; charset=utf-8", // 👈 CLAVE
      },
      timeout: 60000,
      // 👇 evita que axios te meta urlencoded por defecto
      transformRequest: [(data) => data],
    }
  );

  return Buffer.from(res.data);
}

/**
 * Sube un archivo reemplazando el existente.
 * Acepta path "/..." o "id:..."
 */
async function uploadOverwriteByPath(pathOrId, buffer) {
  const token = await getDropboxToken();

  await axios.post("https://content.dropboxapi.com/2/files/upload", buffer, {
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/octet-stream",
      "Dropbox-API-Arg": JSON.stringify({
        path: pathOrId,
        mode: "overwrite",
        autorename: false,
        mute: false,
        strict_conflict: false,
      }),
    },
    maxBodyLength: Infinity,
    maxContentLength: Infinity,
    timeout: 120000,
  });
}

module.exports = {
  getMetadata,
  downloadByPath,
  uploadOverwriteByPath,
};