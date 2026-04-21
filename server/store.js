/**
 * store.js — capa de persistencia abstracta
 *
 * Toda la lógica de negocio del servidor habla con esta API.
 * Para cambiar de driver (json → sqlite → turso) solo cambias este archivo
 * y la env var STORE_DRIVER.
 *
 * API pública:
 *   store.productos.list()                    -> array
 *   store.productos.get(id)                   -> producto | null
 *   store.productos.updateStock(id, talla, delta)
 *   store.pedidos.create(pedido)              -> pedido persistido
 *   store.pedidos.list({ limit })             -> array (más recientes primero)
 */

const path = require("path");
const { createJsonStore } = require("./jsonStore");

const DRIVER = (process.env.STORE_DRIVER || "json").toLowerCase();

function buildJsonDriver() {
  const productosStore = createJsonStore({
    filePath: path.resolve(__dirname, "..", "data", "productos.json"),
    defaultValue: [],
  });
  const pedidosStore = createJsonStore({
    filePath: path.resolve(__dirname, "..", "data", "pedidos.json"),
    defaultValue: [],
  });

  return {
    productos: {
      async list() {
        return await productosStore.read();
      },
      async get(id) {
        const items = await productosStore.read();
        return items.find((p) => String(p.id) === String(id)) || null;
      },
      async updateStock(id, talla, delta) {
        return await productosStore.write((current) => {
          const next = current.map((p) => {
            if (String(p.id) !== String(id)) return p;
            const stockByTalla = { ...(p.stockByTalla || {}) };
            const key = talla || "_";
            const newStock = Math.max(0, (Number(stockByTalla[key]) || 0) + delta);
            stockByTalla[key] = newStock;
            return { ...p, stockByTalla };
          });
          return next;
        });
      },
    },
    pedidos: {
      async create(pedido) {
        const entry = {
          ...pedido,
          id: pedido.id || `ord_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
          createdAt: pedido.createdAt || new Date().toISOString(),
        };
        await pedidosStore.write((current) => [...current, entry]);
        return entry;
      },
      async list({ limit } = {}) {
        const all = await pedidosStore.read();
        const sorted = [...all].reverse();
        return Number.isFinite(limit) ? sorted.slice(0, limit) : sorted;
      },
    },
  };
}

function buildTursoDriver() {
  // Stub — para activar:
  //   npm i @libsql/client
  //   export STORE_DRIVER=turso TURSO_URL=... TURSO_AUTH_TOKEN=...
  //
  // const { createClient } = require("@libsql/client");
  // const client = createClient({ url: process.env.TURSO_URL, authToken: process.env.TURSO_AUTH_TOKEN });
  //
  // Schema mínimo sugerido:
  //   CREATE TABLE productos (id TEXT PRIMARY KEY, data TEXT NOT NULL);
  //   CREATE TABLE stock (producto_id TEXT, talla TEXT, cantidad INTEGER, PRIMARY KEY (producto_id, talla));
  //   CREATE TABLE pedidos (id TEXT PRIMARY KEY, data TEXT NOT NULL, created_at TEXT NOT NULL);
  //
  // Implementa productos.{list,get,updateStock} y pedidos.{create,list} con client.execute(...)
  throw new Error("Driver 'turso' no implementado todavía — ver comentarios en server/store.js");
}

function buildSqliteDriver() {
  // Stub — para activar:
  //   npm i better-sqlite3
  //   export STORE_DRIVER=sqlite
  //   Configura Render Disk montado en /data, usa path.resolve('/data/shop.db')
  throw new Error("Driver 'sqlite' no implementado todavía — ver comentarios en server/store.js");
}

let store;
switch (DRIVER) {
  case "turso":
    store = buildTursoDriver();
    break;
  case "sqlite":
    store = buildSqliteDriver();
    break;
  case "json":
  default:
    store = buildJsonDriver();
    break;
}

console.log(`[store] driver activo: ${DRIVER}`);

module.exports = store;
