import api from "../api/axiosConfig";

const BOOTSTRAP_BATCH_SIZE = 2500;
const SYNC_BATCH_SIZE = 2500;
const LIVE_SYNC_INTERVAL_MS = 15000;

class MovimientosLocalDb {
  constructor() {
    this.worker = null;
    this.requestId = 0;
    this.pending = new Map();
    this.listeners = new Set();
    this.startPromise = null;
    this.bootstrapLoopPromise = null;
    this.liveSyncPromise = null;
    this.liveSyncTimer = null;
    this.batchCounter = 0;

    this.status = {
      ready: false,
      storageMode: "not-initialized",
      syncing: false,
      bootstrapComplete: false,
      localRows: 0,
      serverTotal: 0,
      lastSyncVersion: "0000000000000000",
      lastError: "",
    };
  }

  emitStatus(patch = {}) {
    this.status = {
      ...this.status,
      ...patch,
    };

    this.listeners.forEach((listener) => {
      try {
        listener({ ...this.status });
      } catch (err) {
        console.error("Listener de movimientosLocalDb:", err);
      }
    });
  }

  subscribe(listener) {
    this.listeners.add(listener);
    listener({ ...this.status });

    return () => this.listeners.delete(listener);
  }

  getStatus() {
    return { ...this.status };
  }

  createWorker() {
    if (this.worker) return;

    this.worker = new Worker(
      new URL("../workers/movimientosDb.worker.js", import.meta.url),
      { type: "module" },
    );

    this.worker.onmessage = (event) => {
      const { id, ok, result, error } = event.data || {};
      const pending = this.pending.get(id);

      if (!pending) return;

      this.pending.delete(id);

      if (ok) pending.resolve(result);
      else pending.reject(new Error(error || "Error del motor SQLite local"));
    };

    this.worker.onerror = (event) => {
      console.error("Worker SQLite movimientos:", event);

      this.emitStatus({
        lastError: event?.message || "Error del worker SQLite",
      });
    };
  }

  request(type, payload = null) {
    this.createWorker();

    const id = ++this.requestId;

    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });

      this.worker.postMessage({
        id,
        type,
        payload,
      });
    });
  }

  async start() {
    if (this.startPromise) return this.startPromise;

    this.startPromise = (async () => {
      const engine = await this.request("init");
      const meta = engine?.meta || {};

      this.emitStatus({
        ready: true,
        storageMode: engine?.storageMode || "unknown",
        localRows: Number(engine?.localRows || 0),
        serverTotal: Number(meta.serverTotal || 0),
        bootstrapComplete: String(meta.bootstrapComplete || "0") === "1",
        lastSyncVersion: meta.lastSyncVersion || "0000000000000000",
        lastError: "",
      });

      this.startBootstrapLoop();
      this.startLiveSyncLoop();

      return this.getStatus();
    })().catch((err) => {
      this.startPromise = null;

      this.emitStatus({
        ready: false,
        lastError: err?.message || String(err),
      });

      throw err;
    });

    return this.startPromise;
  }

  waitForIdle() {
    return new Promise((resolve) => {
      if (typeof window !== "undefined" && "requestIdleCallback" in window) {
        window.requestIdleCallback(() => resolve(), { timeout: 1200 });
        return;
      }

      setTimeout(resolve, 120);
    });
  }

  async refreshLocalCountIfNeeded(force = false) {
    this.batchCounter += 1;

    if (!force && this.batchCounter % 20 !== 0) return;

    const engine = await this.request("getStatus");

    this.emitStatus({
      storageMode: engine?.storageMode || this.status.storageMode,
      localRows: Number(engine?.localRows || 0),
    });
  }

  startBootstrapLoop() {
    if (this.bootstrapLoopPromise || this.status.bootstrapComplete) return;

    this.bootstrapLoopPromise = (async () => {
      try {
        while (!this.status.bootstrapComplete) {
          await this.bootstrapOneBatch();

          if (!this.status.bootstrapComplete) {
            await this.waitForIdle();
          }
        }
      } catch (err) {
        console.error("Bootstrap movimientos:", err);

        this.emitStatus({
          lastError: err?.message || String(err),
        });
      } finally {
        this.bootstrapLoopPromise = null;
      }
    })();
  }

  async bootstrapOneBatch() {
    await this.start();

    const engine = await this.request("getStatus");
    const meta = engine?.meta || {};

    if (String(meta.bootstrapComplete || "0") === "1") {
      this.emitStatus({ bootstrapComplete: true });
      return;
    }

    const beforeId = Number(meta.bootstrapBeforeId || 0) || undefined;
    const includeMeta = meta.bootstrapWatermark ? 0 : 1;

    this.emitStatus({ syncing: true });

    const response = await api.get("/movimientos/bootstrap", {
      params: {
        limit: BOOTSTRAP_BATCH_SIZE,
        beforeId,
        includeMeta,
      },
      timeout: 120000,
    });

    const payload = response.data || {};
    const rows = Array.isArray(payload.data) ? payload.data : [];

    const nextMeta = {};

    if (payload.watermark) {
      nextMeta.bootstrapWatermark = payload.watermark;

      /*
       * El live-sync arranca desde el watermark tomado al iniciar la copia.
       * Así las modificaciones nuevas se reciben aunque la carga histórica
       * todavía esté avanzando hacia atrás.
       */
      if (!meta.lastSyncVersion) {
        nextMeta.lastSyncVersion = payload.watermark;
      }
    }

    if (payload.total != null) {
      nextMeta.serverTotal = Number(payload.total || 0);
    }

    if (rows.length) {
      nextMeta.bootstrapBeforeId = payload.nextBeforeId || "";
    }

    if (!payload.hasMore || !rows.length) {
      nextMeta.bootstrapComplete = "1";
      nextMeta.bootstrapBeforeId = "";
    }

    await this.request("applyBootstrapBatch", {
      rows,
      meta: nextMeta,
    });

    const estimatedLocalRows = Math.min(
      Number(this.status.serverTotal || nextMeta.serverTotal || 0) ||
        Number.MAX_SAFE_INTEGER,
      Number(this.status.localRows || 0) + rows.length,
    );

    this.emitStatus({
      syncing: false,
      bootstrapComplete: nextMeta.bootstrapComplete === "1",
      serverTotal: Number(nextMeta.serverTotal || this.status.serverTotal || 0),
      localRows:
        estimatedLocalRows === Number.MAX_SAFE_INTEGER
          ? Number(this.status.localRows || 0) + rows.length
          : estimatedLocalRows,
      lastSyncVersion: nextMeta.lastSyncVersion || this.status.lastSyncVersion,
      lastError: "",
    });

    await this.refreshLocalCountIfNeeded(nextMeta.bootstrapComplete === "1");
  }

  startLiveSyncLoop() {
    if (this.liveSyncTimer) return;

    const run = async () => {
      try {
        await this.syncNow();
      } catch (err) {
        console.error("Live sync movimientos:", err);
      } finally {
        this.liveSyncTimer = setTimeout(run, LIVE_SYNC_INTERVAL_MS);
      }
    };

    this.liveSyncTimer = setTimeout(run, 1500);
  }

  async syncNow() {
    await this.start();

    if (this.liveSyncPromise) return this.liveSyncPromise;

    this.liveSyncPromise = (async () => {
      try {
        this.emitStatus({ syncing: true });

        let continueSync = true;
        let rounds = 0;

        while (continueSync && rounds < 50) {
          rounds += 1;

          const engine = await this.request("getStatus");
          const meta = engine?.meta || {};
          const since = meta.lastSyncVersion || meta.bootstrapWatermark;

          /*
           * Antes de obtener el primer watermark no existe un punto seguro
           * desde el cual pedir cambios. El bootstrap lo obtiene en su primer lote.
           */
          if (!since) break;

          const response = await api.get("/movimientos/sync", {
            params: {
              since,
              limit: SYNC_BATCH_SIZE,
            },
            timeout: 120000,
          });

          const payload = response.data || {};
          const rows = Array.isArray(payload.data) ? payload.data : [];
          const nextVersion = payload.nextVersion || since;

          await this.request("applySyncBatch", {
            rows,
            meta: {
              lastSyncVersion: nextVersion,
            },
          });

          this.emitStatus({
            lastSyncVersion: nextVersion,
            lastError: "",
          });

          continueSync = Boolean(payload.hasMore && rows.length);

          if (continueSync) {
            await this.waitForIdle();
          }
        }

        await this.refreshLocalCountIfNeeded(true);
      } catch (err) {
        this.emitStatus({
          lastError:
            err?.response?.data?.detalle ||
            err?.response?.data?.error ||
            err?.message ||
            String(err),
        });

        throw err;
      } finally {
        this.emitStatus({ syncing: false });
      }
    })().finally(() => {
      this.liveSyncPromise = null;
    });

    return this.liveSyncPromise;
  }

  async queryMovimientos(options = {}) {
    await this.start();

    return this.request("query", options);
  }

  async getDistinctValues(options = {}) {
    await this.start();

    return this.request("distinct", options);
  }

  async clearLocalCache() {
    await this.start();

    const result = await this.request("clear");

    this.emitStatus({
      localRows: 0,
      serverTotal: 0,
      bootstrapComplete: false,
      lastSyncVersion: "0000000000000000",
    });

    this.startBootstrapLoop();

    return result;
  }
}

const movimientosLocalDb = new MovimientosLocalDb();
if (typeof window !== "undefined") {
  setTimeout(() => {
    movimientosLocalDb.start().catch((err) => {
      console.error("No se pudo iniciar el motor local de movimientos:", err);
    });
  }, 0);
}

export default movimientosLocalDb;
