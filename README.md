# semillaEcommerce

Plantilla base para ecommerces pequeños. Todo en Cloudflare: **Pages** (frontend) + **Pages Functions** con Hono (backend) + **D1** (SQLite serverless) + **Stripe Checkout**.

Un solo proveedor, un solo dashboard, cero cold starts, cero CORS.

> Versión anterior Node/Express/Render preservada en la rama [`legacy/node-render`](https://github.com/meowrhino/semillaEcommerce/tree/legacy/node-render) y tag `v0.1-node-render`, por si hiciera falta rescatar esa arquitectura.

---

## Arquitectura

```
Browser
  │
  ▼
Cloudflare Pages (estático: HTML/CSS/JS) ────┐
  │                                           │  mismo origen → sin CORS
  ▼                                           │
Pages Functions (Hono) ──── /api/*  ◀─────────┘
  │
  ├── D1 (SQLite)            productos, stock_variantes, pedidos, envios
  └── Stripe Checkout        /api/crear-sesion  +  /api/stripe-webhook
```

## Estructura del repo

```
semillaEcommerce/
├─ index.html, producto.html, checkout.html, gracias.html, sorry.html
├─ admin/                    # UI admin con token (tickets + stock)
├─ css/styles.css            # base neutra, pinta tu marca encima
├─ js/
│  ├─ config.js              # API_BASE = "/api" (mismo origen)
│  ├─ app.js                 # carrito en localStorage
│  ├─ home.js, producto.js, checkout.js
├─ functions/
│  └─ api/[[route]].js       # backend Hono: catálogo, Stripe, admin
├─ data/
│  ├─ schema.sql             # esquema D1
│  └─ seed.sql               # datos de ejemplo
├─ wrangler.toml             # config Cloudflare (pages + D1 binding)
├─ package.json
└─ .dev.vars.example         # plantilla de secretos locales
```

---

## Quick start (local)

```bash
# 1. Instala dependencias
npm install

# 2. Crea la D1 de desarrollo y aplica schema + seed
npx wrangler login                     # primera vez
npx wrangler d1 create shop            # copia el database_id al wrangler.toml
npm run db:init:local                  # crea tablas en D1 local
npm run db:seed:local                  # mete productos/envíos de demo

# 3. Copia secretos locales
cp .dev.vars.example .dev.vars
# rellena STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, ADMIN_TOKEN

# 4. Levanta todo (front + functions + D1 local)
npm run dev
# abre http://localhost:8788
```

`wrangler pages dev` sirve los estáticos y ejecuta las Functions con D1 emulada en local. No necesitas desplegar para probar.

### Probar webhooks de Stripe en local

```bash
stripe listen --forward-to http://localhost:8788/api/stripe-webhook
# copia el whsec_... que imprime y pégalo como STRIPE_WEBHOOK_SECRET en .dev.vars
```

---

## Deploy a producción

### 1. Crear la DB de producción
```bash
wrangler d1 create shop
# copia el database_id que devuelva al wrangler.toml
wrangler d1 execute shop --file=./data/schema.sql
wrangler d1 execute shop --file=./data/seed.sql   # opcional
```

### 2. Conectar el repo a Cloudflare Pages
- Dashboard de Cloudflare → Pages → Create → Connect to Git → selecciona `meowrhino/semillaEcommerce`.
- **Build command:** (dejar vacío)
- **Build output directory:** `/`
- **Framework preset:** None.
- Deploy. Te queda en `https://semilla-ecommerce.pages.dev`.

### 3. Enlazar D1 y añadir secretos
En Pages → Settings → Functions:
- **D1 database binding**: `DB` → `shop`
- **Environment variables / Secrets** (Production):
  - `STRIPE_SECRET_KEY`
  - `STRIPE_WEBHOOK_SECRET`
  - `ADMIN_TOKEN`
  - `FRONTEND_URL` (p.ej. `https://tutienda.com`)

O por CLI:
```bash
wrangler pages secret put STRIPE_SECRET_KEY
wrangler pages secret put STRIPE_WEBHOOK_SECRET
wrangler pages secret put ADMIN_TOKEN
```

### 4. Configurar el webhook en Stripe
Stripe Dashboard → Developers → Webhooks → Add endpoint:
- URL: `https://tutienda.com/api/stripe-webhook`
- Evento mínimo: `checkout.session.completed`
- Copia el signing secret y guárdalo como `STRIPE_WEBHOOK_SECRET`.

### 5. Dominio propio
Pages → Custom domains → añade el del cliente. Si su DNS ya está en Cloudflare (lo normal), es 1 click y HTTPS automático.

---

## Endpoints

| Método | Ruta                        | Descripción |
|-------:|-----------------------------|-------------|
| GET    | `/api/health`               | Healthcheck. |
| GET    | `/api/productos`            | Catálogo activo con `stockByTalla`. |
| GET    | `/api/productos/:id`        | Detalle de un producto. |
| GET    | `/api/envios`               | Zonas y tarifas. |
| POST   | `/api/crear-sesion`         | Crea sesión Stripe desde `{ carrito, envio }`. Pre-chequea stock. |
| POST   | `/api/stripe-webhook`       | Recibe `checkout.session.completed` → baja stock + registra pedido. |
| GET    | `/api/admin/historial`      | (Bearer) Lista pedidos (`?limit=100`). |
| POST   | `/api/admin/stock-bulk`     | (Bearer) Actualiza stock en masa. |

Rutas admin requieren header `Authorization: Bearer <ADMIN_TOKEN>`.

---

## Esquema D1 (resumen)

- **productos** — id, nombre, descripcion, precio, img, activo, timestamps.
- **stock_variantes** — (producto_id, talla) → cantidad. Talla `'_'` para productos sin variantes.
- **envios** — zona → precio.
- **pedidos** — stripe_session_id único, email, amount_total (céntimos), currency, items (JSON).

Ver [data/schema.sql](data/schema.sql).

---

## Para cada cliente nuevo

1. `gh repo create tu-usuario/tu-tienda --public --template meowrhino/semillaEcommerce`
2. Rellena [data/seed.sql](data/seed.sql) con el catálogo real (o crea un script de import).
3. Pinta [css/styles.css](css/styles.css) con la marca.
4. Cambia el nombre en [js/config.js](js/config.js) (`TIENDA_NOMBRE`).
5. Deploy en Pages, añade dominio del cliente, configura Stripe webhook.
6. Rota `ADMIN_TOKEN` antes de entregarlo.

---

## Rescatar la versión Node/Render (si hace falta)

```bash
git checkout legacy/node-render
# o basarte en el tag:
git checkout v0.1-node-render
```

Esa rama incluye el Express tradicional + driver JSON + stubs SQLite/Turso, desplegable en Render. Útil si algún cliente prefiere esa infra.

---

## Licencia

Elige una (MIT recomendada para plantillas).
