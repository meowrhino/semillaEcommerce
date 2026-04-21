-- schema.sql — esquema para D1 (SQLite).
-- Aplica con: wrangler d1 execute shop --file=./data/schema.sql
-- Para reset total en dev:  npm run db:init:local  (reescribe tablas si DROP está activo)

DROP TABLE IF EXISTS pedidos;
DROP TABLE IF EXISTS stock_variantes;
DROP TABLE IF EXISTS productos;
DROP TABLE IF EXISTS envios;

CREATE TABLE productos (
  id          TEXT PRIMARY KEY,
  nombre      TEXT NOT NULL,
  descripcion TEXT,
  precio      REAL NOT NULL CHECK (precio >= 0),
  img         TEXT,
  activo      INTEGER NOT NULL DEFAULT 1,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Stock por variante/talla. Usa talla='_' para productos sin variantes.
CREATE TABLE stock_variantes (
  producto_id TEXT NOT NULL,
  talla       TEXT NOT NULL DEFAULT '_',
  cantidad    INTEGER NOT NULL DEFAULT 0 CHECK (cantidad >= 0),
  PRIMARY KEY (producto_id, talla),
  FOREIGN KEY (producto_id) REFERENCES productos(id) ON DELETE CASCADE
);

CREATE TABLE envios (
  zona   TEXT PRIMARY KEY,
  precio REAL NOT NULL CHECK (precio >= 0)
);

CREATE TABLE pedidos (
  id                 TEXT PRIMARY KEY,
  stripe_session_id  TEXT UNIQUE,
  email              TEXT,
  amount_total       INTEGER,       -- en céntimos (cents)
  currency           TEXT,
  items              TEXT NOT NULL, -- JSON: [{id, talla, cantidad, nombre, precio}]
  created_at         TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_pedidos_created_at ON pedidos(created_at DESC);
CREATE INDEX idx_stock_producto     ON stock_variantes(producto_id);
