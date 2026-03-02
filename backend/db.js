const sql = require('mssql');
require('dotenv').config();

const config = {
  user: process.env.SQL_USER,
  password: process.env.SQL_PASSWORD,
  server: process.env.SQL_SERVER,
  database: process.env.SQL_DATABASE,
  port: Number(process.env.SQL_PORT) || 1433,
  options: { trustServerCertificate: true },
};

const pool = new sql.ConnectionPool(config);
const poolConnect = pool.connect()
  .then(() => console.log(`[DB] Conectado a ${config.database} en ${config.server}`))
  .catch(err => {
    console.error('[DB] Error al conectar:', err);
    throw err;
  });

pool.on('error', err => {
  console.error('[DB] Error en pool:', err);
});

async function getPool() {
  await poolConnect;
  return pool;
}

module.exports = { sql, pool, poolConnect, getPool };




