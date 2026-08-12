const sql = require("mssql");

const configHetmo = {
  user: process.env.HETMO_DB_USER,
  password: process.env.HETMO_DB_PASSWORD,
  server: process.env.HETMO_DB_SERVER,
  database: process.env.HETMO_DB_DATABASE || "CL-HETMO",
  options: {
    encrypt: false,
    trustServerCertificate: true,
    enableArithAbort: true,
  },
  pool: {
    max: 10,
    min: 0,
    idleTimeoutMillis: 30000,
  },
  connectionTimeout: 30000,
  requestTimeout: 120000,
};

let poolHetmo = null;
let poolPromiseHetmo = null;

async function getHetmoPool() {
  if (poolHetmo?.connected) {
    return poolHetmo;
  }

  if (!poolPromiseHetmo) {
    poolHetmo = new sql.ConnectionPool(configHetmo);

    poolPromiseHetmo = poolHetmo
      .connect()
      .then((pool) => {
        console.log("Conexión a CL-HETMO establecida");
        return pool;
      })
      .catch((error) => {
        poolHetmo = null;
        poolPromiseHetmo = null;
        console.error("Error al conectar con CL-HETMO:", error);
        throw error;
      });
  }

  return poolPromiseHetmo;
}

async function closeHetmoPool() {
  if (poolHetmo) {
    await poolHetmo.close();
  }

  poolHetmo = null;
  poolPromiseHetmo = null;
}

module.exports = {
  sql,
  getHetmoPool,
  closeHetmoPool,
};
