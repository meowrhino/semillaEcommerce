-- schema.sql — esquema D1.
-- El catálogo vive en data/productos.json; aquí solo guardamos lo mutable:
--   • stock      → cantidades por (producto, talla), que bajan con cada venta
--   • pedidos    → historial de compras
--
-- Aplica con:  wrangler d1 execute shop --file=./data/schema.sql
-- (local)      npm run db:init:local
--
-- Es idempotente (IF NOT EXISTS), así que puedes relanzarlo sin perder datos.
-- Para un reset destructivo, ejecuta DROP TABLE manualmente.

CREATE TABLE IF NOT EXISTS stock (
  producto_id TEXT NOT NULL,
  talla       TEXT NOT NULL DEFAULT '_',
  cantidad    INTEGER NOT NULL DEFAULT 0 CHECK (cantidad >= 0),
  PRIMARY KEY (producto_id, talla)
);

CREATE INDEX IF NOT EXISTS idx_stock_producto ON stock(producto_id);

CREATE TABLE IF NOT EXISTS pedidos (
  id                 TEXT PRIMARY KEY,
  stripe_session_id  TEXT UNIQUE,
  email              TEXT,
  amount_total       INTEGER,       -- céntimos
  currency           TEXT,
  items              TEXT NOT NULL, -- JSON: [{id, nombre, precio, talla, cantidad}]
  created_at         TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_pedidos_created_at ON pedidos(created_at DESC);

-- newsletter + mensajes (features opcionales: borra estas tablas si no las usas)
CREATE TABLE IF NOT EXISTS newsletter (
  email       TEXT PRIMARY KEY,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS mensajes (
  id          TEXT PRIMARY KEY,
  nombre      TEXT,
  email       TEXT,
  texto       TEXT NOT NULL,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_mensajes_created_at ON mensajes(created_at DESC);
