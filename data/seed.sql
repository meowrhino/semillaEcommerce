-- seed.sql — datos de ejemplo. Aplica tras schema.sql.
-- npm run db:seed:local  (local)
-- npm run db:seed        (prod)

INSERT INTO productos (id, nombre, descripcion, precio, img) VALUES
  ('demo-01', 'Producto demo sin tallas', 'Ejemplo simple. Edita/borra esta fila cuando rellenes tu catálogo real.', 19.90, ''),
  ('demo-02', 'Producto demo con tallas', 'Ejemplo con varias tallas. La talla "_" es el fallback cuando no hay variantes.', 34.50, '');

INSERT INTO stock_variantes (producto_id, talla, cantidad) VALUES
  ('demo-01', '_', 10),
  ('demo-02', 'S', 3),
  ('demo-02', 'M', 5),
  ('demo-02', 'L', 2);

INSERT INTO envios (zona, precio) VALUES
  ('local',          0),
  ('peninsula',      4.90),
  ('europa',         12.00),
  ('internacional',  22.00);
